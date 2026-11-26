'use client';

import { useState, useEffect, useTransition, useMemo, useCallback } from 'react';
import { apiCall } from '@/lib/api';
import { useToast } from '@/context/ToastContext';
import { ReceivableInstallmentItem, ReceivablesDashboardData } from '@/types';
import {
  CompiledInstallment,
  DebtorItem,
  FaturaSummary,
  getErrorMessage,
  LoanItem,
  ReceivablesConfirmAction,
} from './types';

export function useReceivablesData() {
  const { notify } = useToast();

  const [dashboard, setDashboard] = useState<ReceivablesDashboardData | null>(null);
  const [debtors, setDebtors] = useState<DebtorItem[]>([]);
  const [loans, setLoans] = useState<LoanItem[]>([]);

  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [isLoanModalOpen, setIsLoanModalOpen] = useState(false);
  const [isDebtorModalOpen, setIsDebtorModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isGlobalPayModalOpen, setIsGlobalPayModalOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<ReceivablesConfirmAction | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);

  const [activeSubTab, setActiveSubTab] = useState<'lancamentos' | 'analises'>('lancamentos');
  const [selectedFatura, setSelectedFatura] = useState<string>('Todas');
  const [selectedPersonFilter, setSelectedPersonFilter] = useState<string>('Todos');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('Todos');
  const [searchQuery, setSearchQuery] = useState('');
  const [pendingSearch, setPendingSearch] = useState('');
  const [isPending, startTransition] = useTransition();
  const [selectedInstallments, setSelectedInstallments] = useState<number[]>([]);

  const [payingInstallment, setPayingInstallment] = useState<ReceivableInstallmentItem | null>(null);
  const [payingLoanDesc, setPayingLoanDesc] = useState('');
  const [payingValue, setPayingValue] = useState('');
  const [payingMethod, setPayingMethod] = useState('Pix');

  const [globalPayDebtor, setGlobalPayDebtor] = useState<DebtorItem | null>(null);
  const [globalPayValue, setGlobalPayValue] = useState('');
  const [globalPayMethod, setGlobalPayMethod] = useState('Pix');

  const [fechamentoDia, setFechamentoDia] = useState('15');
  const [vencimentoDia, setVencimentoDia] = useState('20');

  const [editingDebtorId, setEditingDebtorId] = useState<number | null>(null);
  const [newDebtorNome, setNewDebtorNome] = useState('');
  const [newDebtorTelefone, setNewDebtorTelefone] = useState('');
  const [newDebtorObs, setNewDebtorObs] = useState('');

  const [editingLoanId, setEditingLoanId] = useState<number | null>(null);
  const [newLoanDebtorId, setNewLoanDebtorId] = useState('');
  const [newLoanDesc, setNewLoanDesc] = useState('');
  const [newLoanCat, setNewLoanCat] = useState('Geral');
  const [newLoanVal, setNewLoanVal] = useState('');
  const [newLoanParcelado, setNewLoanParcelado] = useState(false);
  const [newLoanTotalParc, setNewLoanTotalParc] = useState('1');
  const [newLoanDate, setNewLoanDate] = useState(new Date().toISOString().split('T')[0]);
  const [newLoanObs, setNewLoanObs] = useState('');

  const refreshAll = useCallback(async () => {
    try {
      const [dashData, debtorsData, loansData, configData] = await Promise.all([
        apiCall<ReceivablesDashboardData>('/api/refunds/dashboard'),
        apiCall<DebtorItem[]>('/api/refunds/debtors'),
        apiCall<LoanItem[]>('/api/refunds/loans'),
        apiCall<{ fechamento_dia: number; vencimento_dia: number }>('/api/refunds/config'),
      ]);
      setDashboard(dashData);
      setDebtors(debtorsData);
      setLoans(loansData);
      setFechamentoDia(configData.fechamento_dia.toString());
      setVencimentoDia(configData.vencimento_dia.toString());
    } catch (err) {
      console.error('Erro ao carregar dados do módulo de reembolsos:', err);
    }
  }, []);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPendingSearch(e.target.value);
    startTransition(() => setSearchQuery(e.target.value));
  };

  const handleSaveConfig = async () => {
    try {
      await apiCall('/api/refunds/config', {
        method: 'POST',
        body: JSON.stringify({
          fechamento_dia: parseInt(fechamentoDia, 10),
          vencimento_dia: parseInt(vencimentoDia, 10),
        }),
      });
      setIsConfigOpen(false);
      refreshAll();
    } catch (err: unknown) {
      notify(getErrorMessage(err, 'Erro ao salvar configuração.'), 'error');
    }
  };

  const handleCreateDebtor = async () => {
    if (!newDebtorNome.trim()) return notify('O nome é obrigatório.', 'error');
    const payload = { nome: newDebtorNome, telefone: newDebtorTelefone, observacoes: newDebtorObs };
    const endpoint = editingDebtorId ? `/api/refunds/debtors/${editingDebtorId}` : '/api/refunds/debtors';
    try {
      await apiCall(endpoint, { method: editingDebtorId ? 'PUT' : 'POST', body: JSON.stringify(payload) });
      setNewDebtorNome('');
      setNewDebtorTelefone('');
      setNewDebtorObs('');
      setEditingDebtorId(null);
      setIsDebtorModalOpen(false);
      refreshAll();
    } catch (err: unknown) {
      notify(getErrorMessage(err, 'Erro ao cadastrar/editar devedor.'), 'error');
    }
  };

  const handleCreateLoan = async () => {
    if (!newLoanDesc || (!editingLoanId && (!newLoanDebtorId || !newLoanVal))) {
      return notify('Preencha todos os campos obrigatórios.', 'error');
    }
    const payload = editingLoanId
      ? { descricao: newLoanDesc, categoria: newLoanCat, observacoes: newLoanObs }
      : {
          debtor_id: parseInt(newLoanDebtorId, 10),
          descricao: newLoanDesc,
          categoria: newLoanCat,
          valor_total: parseFloat(newLoanVal),
          is_parcelado: newLoanParcelado,
          total_parcelas: newLoanParcelado ? parseInt(newLoanTotalParc, 10) : 1,
          data_emprestimo: newLoanDate,
          observacoes: newLoanObs,
        };
    const endpoint = editingLoanId ? `/api/refunds/loans/${editingLoanId}` : '/api/refunds/loans';
    try {
      await apiCall(endpoint, { method: editingLoanId ? 'PUT' : 'POST', body: JSON.stringify(payload) });
      setNewLoanDebtorId('');
      setNewLoanDesc('');
      setNewLoanCat('Geral');
      setNewLoanVal('');
      setNewLoanParcelado(false);
      setNewLoanTotalParc('1');
      setNewLoanObs('');
      setEditingLoanId(null);
      setIsLoanModalOpen(false);
      refreshAll();
    } catch (err: unknown) {
      notify(getErrorMessage(err, 'Erro ao cadastrar/editar empréstimo.'), 'error');
    }
  };

  const handleOpenPay = (inst: ReceivableInstallmentItem, loanDesc: string) => {
    setPayingInstallment(inst);
    setPayingLoanDesc(loanDesc);
    const due = Math.max(0, inst.valor_parcela - (inst.valor_pago || 0));
    setPayingValue(due.toString());
    setPayingMethod('Pix');
    setIsPaymentModalOpen(true);
  };

  const handlePayInstallment = async () => {
    if (!payingInstallment) return;
    try {
      await apiCall(`/api/refunds/installments/${payingInstallment.id}/pay`, {
        method: 'POST',
        body: JSON.stringify({ valor_pago: parseFloat(payingValue), forma_pagamento: payingMethod }),
      });
      setIsPaymentModalOpen(false);
      setPayingInstallment(null);
      refreshAll();
    } catch (err: unknown) {
      notify(getErrorMessage(err, 'Erro ao efetuar pagamento.'), 'error');
    }
  };

  const handleOpenGlobalPay = (d: DebtorItem) => {
    setGlobalPayDebtor(d);
    setGlobalPayValue(d.saldo_pendente.toString());
    setGlobalPayMethod('Pix');
    setIsGlobalPayModalOpen(true);
  };

  const handlePayGlobalDebtor = async () => {
    if (!globalPayDebtor) return;
    try {
      await apiCall(`/api/refunds/debtors/${globalPayDebtor.id}/pay-global`, {
        method: 'POST',
        body: JSON.stringify({ valor_pago: parseFloat(globalPayValue), forma_pagamento: globalPayMethod }),
      });
      setIsGlobalPayModalOpen(false);
      setGlobalPayDebtor(null);
      setGlobalPayValue('');
      refreshAll();
    } catch (err: unknown) {
      notify(getErrorMessage(err, 'Erro ao processar recebimento global.'), 'error');
    }
  };

  const executeConfirmAction = async () => {
    if (!confirmAction) return;
    setConfirmLoading(true);
    try {
      if (confirmAction.kind === 'batch') {
        await apiCall('/api/refunds/installments/pay-batch', {
          method: 'POST',
          body: JSON.stringify({ ids: selectedInstallments }),
        });
        setSelectedInstallments([]);
      } else if (confirmAction.kind === 'loan') {
        await apiCall(`/api/refunds/loans/${confirmAction.id}`, { method: 'DELETE' });
      } else {
        await apiCall(`/api/refunds/debtors/${confirmAction.id}`, { method: 'DELETE' });
      }
      setConfirmAction(null);
      refreshAll();
    } catch {
      const errMsg =
        confirmAction.kind === 'batch'
          ? 'Erro ao liquidar parcelas selecionadas.'
          : confirmAction.kind === 'loan'
            ? 'Erro ao excluir empréstimo.'
            : 'Erro ao excluir devedor.';
      notify(errMsg, 'error');
    } finally {
      setConfirmLoading(false);
    }
  };

  const handleOpenNewDebtor = () => {
    setEditingDebtorId(null);
    setNewDebtorNome('');
    setNewDebtorTelefone('');
    setNewDebtorObs('');
    setIsDebtorModalOpen(true);
  };

  const handleOpenEditDebtor = (d: DebtorItem) => {
    setEditingDebtorId(d.id);
    setNewDebtorNome(d.nome);
    setNewDebtorTelefone(d.telefone || '');
    setNewDebtorObs(d.observacoes || '');
    setIsDebtorModalOpen(true);
  };

  const handleOpenNewLoan = () => {
    setEditingLoanId(null);
    setNewLoanDebtorId('');
    setNewLoanDesc('');
    setNewLoanCat('Geral');
    setNewLoanVal('');
    setNewLoanParcelado(false);
    setNewLoanTotalParc('1');
    setNewLoanObs('');
    setIsLoanModalOpen(true);
  };

  const handleOpenEditLoan = (loanId: number) => {
    const loan = loans.find((l) => l.id === loanId);
    if (!loan) return;
    setEditingLoanId(loan.id);
    setNewLoanDesc(loan.descricao);
    setNewLoanCat(loan.categoria);
    setNewLoanObs(loan.observacoes || '');
    setIsLoanModalOpen(true);
  };

  const allInstallmentsCompiled = useMemo<CompiledInstallment[]>(() => {
    const list: CompiledInstallment[] = [];
    loans.forEach((loan) => {
      (loan.installments || []).forEach((inst) => {
        list.push({
          loanId: loan.id,
          loanDesc: loan.descricao,
          debtorNome: loan.debtor_nome,
          categoria: loan.categoria,
          installment: inst,
        });
      });
    });
    return list;
  }, [loans]);

  const faturasCalculated = useMemo<FaturaSummary[]>(() => {
    const map: Record<string, FaturaSummary> = {};
    allInstallmentsCompiled.forEach((item) => {
      if (selectedPersonFilter !== 'Todos' && item.debtorNome !== selectedPersonFilter) return;
      const f = item.installment.fatura_mes || 'Geral';
      if (!map[f]) map[f] = { fatura: f, total: 0, recebido: 0, pendente: 0, status: 'ABERTA', items_count: 0 };
      map[f].total += item.installment.valor_parcela;
      map[f].recebido += item.installment.valor_pago;
      map[f].items_count += 1;
    });

    const now = new Date();
    const currentFaturaStr = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;

    return Object.values(map)
      .map((details) => {
        details.pendente = Math.max(0, details.total - details.recebido);
        const instsInFatura = allInstallmentsCompiled.filter(
          (item) =>
            (selectedPersonFilter === 'Todos' || item.debtorNome === selectedPersonFilter) &&
            (item.installment.fatura_mes || 'Geral') === details.fatura
        );
        const allPaid = instsInFatura.length > 0 && instsInFatura.every((item) => item.installment.status === 'PAGA');
        details.status = allPaid
          ? 'RECEBIDA'
          : details.recebido > 0
            ? 'RECEBIDA_PARCIALMENTE'
            : details.fatura < currentFaturaStr
              ? 'FECHADA'
              : 'ABERTA';
        return details;
      })
      .sort((a, b) => a.fatura.localeCompare(b.fatura));
  }, [allInstallmentsCompiled, selectedPersonFilter]);

  const filteredInstallments = useMemo(() => {
    return allInstallmentsCompiled.filter((item) => {
      const matchFatura = selectedFatura === 'Todas' || item.installment.fatura_mes === selectedFatura;
      const matchPerson = selectedPersonFilter === 'Todos' || item.debtorNome === selectedPersonFilter;
      let matchStatus = true;
      if (selectedStatusFilter === 'Pendentes') matchStatus = item.installment.status !== 'PAGA';
      else if (selectedStatusFilter === 'Pagas') matchStatus = item.installment.status === 'PAGA';
      else if (selectedStatusFilter === 'Atrasadas') matchStatus = item.installment.status === 'ATRASADA';

      const query = searchQuery.toLowerCase().trim();
      const matchSearch =
        !query ||
        item.loanDesc.toLowerCase().includes(query) ||
        item.debtorNome.toLowerCase().includes(query) ||
        (item.categoria && item.categoria.toLowerCase().includes(query));

      return matchFatura && matchPerson && matchStatus && matchSearch;
    });
  }, [allInstallmentsCompiled, selectedFatura, selectedPersonFilter, selectedStatusFilter, searchQuery]);

  const debtorOptions = useMemo(() => debtors.map((d) => ({ id: d.id, nome: d.nome })), [debtors]);
  const overdueItemsCount = useMemo(
    () => allInstallmentsCompiled.filter((item) => item.installment.status === 'ATRASADA').length,
    [allInstallmentsCompiled]
  );

  const headerTotalLent = useMemo(() => {
    if (selectedPersonFilter === 'Todos') return dashboard?.total_emprestado || 0;
    return debtors.find((d) => d.nome === selectedPersonFilter)?.valor_total_emprestado || 0;
  }, [selectedPersonFilter, debtors, dashboard]);

  const headerTotalReceived = useMemo(() => {
    if (selectedPersonFilter === 'Todos') return dashboard?.total_recebido || 0;
    return debtors.find((d) => d.nome === selectedPersonFilter)?.valor_total_recebido || 0;
  }, [selectedPersonFilter, debtors, dashboard]);

  const headerTotalPending = useMemo(() => {
    if (selectedPersonFilter === 'Todos') return dashboard?.total_pendente || 0;
    return debtors.find((d) => d.nome === selectedPersonFilter)?.saldo_pendente || 0;
  }, [selectedPersonFilter, debtors, dashboard]);

  const headerTotalOverdue = useMemo(() => {
    if (selectedPersonFilter === 'Todos') return dashboard?.total_atrasado || 0;
    return allInstallmentsCompiled
      .filter((i) => i.debtorNome === selectedPersonFilter && i.installment.status === 'ATRASADA')
      .reduce((acc, i) => acc + (i.installment.valor_parcela - i.installment.valor_pago), 0);
  }, [selectedPersonFilter, dashboard, allInstallmentsCompiled]);

  return {
    dashboard,
    debtors,
    loans,
    isConfigOpen,
    setIsConfigOpen,
    isLoanModalOpen,
    setIsLoanModalOpen,
    isDebtorModalOpen,
    setIsDebtorModalOpen,
    isPaymentModalOpen,
    setIsPaymentModalOpen,
    isGlobalPayModalOpen,
    setIsGlobalPayModalOpen,
    confirmAction,
    setConfirmAction,
    confirmLoading,
    activeSubTab,
    setActiveSubTab,
    selectedFatura,
    setSelectedFatura,
    selectedPersonFilter,
    setSelectedPersonFilter,
    selectedStatusFilter,
    setSelectedStatusFilter,
    pendingSearch,
    isPending,
    selectedInstallments,
    setSelectedInstallments,
    payingInstallment,
    payingLoanDesc,
    payingValue,
    setPayingValue,
    payingMethod,
    setPayingMethod,
    globalPayDebtor,
    globalPayValue,
    setGlobalPayValue,
    globalPayMethod,
    setGlobalPayMethod,
    fechamentoDia,
    setFechamentoDia,
    vencimentoDia,
    setVencimentoDia,
    editingDebtorId,
    newDebtorNome,
    setNewDebtorNome,
    newDebtorTelefone,
    setNewDebtorTelefone,
    newDebtorObs,
    setNewDebtorObs,
    editingLoanId,
    newLoanDebtorId,
    setNewLoanDebtorId,
    newLoanDesc,
    setNewLoanDesc,
    newLoanCat,
    setNewLoanCat,
    newLoanVal,
    setNewLoanVal,
    newLoanParcelado,
    setNewLoanParcelado,
    newLoanTotalParc,
    setNewLoanTotalParc,
    newLoanDate,
    setNewLoanDate,
    newLoanObs,
    setNewLoanObs,
    handleSearchChange,
    handleSaveConfig,
    handleCreateDebtor,
    handleCreateLoan,
    handleOpenPay,
    handlePayInstallment,
    handleOpenGlobalPay,
    handlePayGlobalDebtor,
    executeConfirmAction,
    handleOpenNewDebtor,
    handleOpenEditDebtor,
    handleOpenNewLoan,
    handleOpenEditLoan,
    faturasCalculated,
    filteredInstallments,
    debtorOptions,
    overdueItemsCount,
    headerTotalLent,
    headerTotalReceived,
    headerTotalPending,
    headerTotalOverdue,
  };
}
