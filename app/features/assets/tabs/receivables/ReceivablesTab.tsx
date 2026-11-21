/* eslint-disable @typescript-eslint/no-unused-vars */
'use client';

import React, { useState, useEffect, useTransition, useMemo } from 'react';
import {
  Plus, CheckCircle, User, Calendar, CheckSquare, Pencil,
  Trash2, X, Wallet, Settings, BarChart2,
  TrendingUp, AlertCircle, Phone, DollarSign,
  PieChart as PieIcon, Layers, FileText
} from 'lucide-react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis,
  Tooltip, BarChart, Bar, Cell, PieChart, Pie, Legend
} from 'recharts';
import { formatMoney } from '@/lib/format';
import { apiCall } from '@/lib/api';
import { useToast } from '@/context/ToastContext';
import { usePrivacy } from '@/context/PrivacyContext';
import { useChartPalette } from '@/lib/chartPalette';
import { CHART_PALETTE_SERIES, SEMANTIC_CHART_HEX } from '@/lib/colors';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ReceivablesModals } from './ReceivablesModals';

type ReceivablesConfirmAction =
  | { kind: 'batch' }
  | { kind: 'loan'; id: number; desc: string }
  | { kind: 'debtor'; id: number; nome: string };

const getErrorMessage = (err: unknown, fallback: string) =>
  err instanceof Error ? err.message : fallback;

interface DebtorItem {
  id: number;
  nome: string;
  foto_url?: string;
  telefone?: string;
  observacoes?: string;
  valor_total_emprestado: number;
  valor_total_recebido: number;
  saldo_pendente: number;
  data_ultimo_pagamento?: string;
  data_primeiro_emprestimo?: string;
  data_ultimo_contato?: string;
}

interface LoanItem {
  id: number;
  debtor_id: number;
  debtor_nome: string;
  descricao: string;
  categoria: string;
  data_emprestimo: string;
  valor_total: number;
  is_parcelado: boolean;
  total_parcelas: number;
  status: string; // PENDENTE, PARCIAL, LIQUIDADO
  fatura_mes: string;
  observacoes?: string;
  installments: ReceivableInstallmentItem[];
}

import { ReceivableInstallmentItem, ReceivablesDashboardData } from '@/types';

export const ReceivablesTab = () => {
  const { notify } = useToast();
  const { isHidden } = usePrivacy();
  const palette = useChartPalette();
  const money = (v: number) => (isHidden ? 'R$ •••••' : formatMoney(v));
  // State
  const [dashboard, setDashboard] = useState<ReceivablesDashboardData | null>(null);
  const [debtors, setDebtors] = useState<DebtorItem[]>([]);
  const [loans, setLoans] = useState<LoanItem[]>([]);

  // Modals
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [isLoanModalOpen, setIsLoanModalOpen] = useState(false);
  const [isDebtorModalOpen, setIsDebtorModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isGlobalPayModalOpen, setIsGlobalPayModalOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<ReceivablesConfirmAction | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);

  // Selection
  const [selectedFatura, setSelectedFatura] = useState<string>('Todas');
  const [selectedPersonFilter, setSelectedPersonFilter] = useState<string>('Todos');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('Todos');
  const [searchQuery, setSearchQuery] = useState('');
  const [pendingSearch, setPendingSearch] = useState('');
  const [isPending, startTransition] = useTransition();
  const [selectedInstallments, setSelectedInstallments] = useState<number[]>([]);

  // Pay form
  const [payingInstallment, setPayingInstallment] = useState<ReceivableInstallmentItem | null>(null);
  const [payingLoanDesc, setPayingLoanDesc] = useState('');
  const [payingValue, setPayingValue] = useState('');
  const [payingMethod, setPayingMethod] = useState('Pix');

  // Global Pay Form
  const [globalPayDebtor, setGlobalPayDebtor] = useState<DebtorItem | null>(null);
  const [globalPayValue, setGlobalPayValue] = useState('');
  const [globalPayMethod, setGlobalPayMethod] = useState('Pix');

  // Config form
  const [fechamentoDia, setFechamentoDia] = useState('15');
  const [vencimentoDia, setVencimentoDia] = useState('20');

  // Debtor form
  const [editingDebtorId, setEditingDebtorId] = useState<number | null>(null);
  const [newDebtorNome, setNewDebtorNome] = useState('');
  const [newDebtorTelefone, setNewDebtorTelefone] = useState('');
  const [newDebtorObs, setNewDebtorObs] = useState('');

  // Loan form
  const [editingLoanId, setEditingLoanId] = useState<number | null>(null);
  const [newLoanDebtorId, setNewLoanDebtorId] = useState('');
  const [newLoanDesc, setNewLoanDesc] = useState('');
  const [newLoanCat, setNewLoanCat] = useState('Geral');
  const [newLoanVal, setNewLoanVal] = useState('');
  const [newLoanParcelado, setNewLoanParcelado] = useState(false);
  const [newLoanTotalParc, setNewLoanTotalParc] = useState('1');
  const [newLoanDate, setNewLoanDate] = useState(new Date().toISOString().split('T')[0]);
  const [newLoanObs, setNewLoanObs] = useState('');

  // Fetch Logic
  const refreshAll = async () => {
    try {
      const [dashData, debtorsData, loansData, configData] = await Promise.all([
        apiCall<ReceivablesDashboardData>('/api/refunds/dashboard'),
        apiCall<DebtorItem[]>('/api/refunds/debtors'),
        apiCall<LoanItem[]>('/api/refunds/loans'),
        apiCall<{ fechamento_dia: number; vencimento_dia: number }>('/api/refunds/config')
      ]);

      setDashboard(dashData);
      setDebtors(debtorsData);
      setLoans(loansData);
      setFechamentoDia(configData.fechamento_dia.toString());
      setVencimentoDia(configData.vencimento_dia.toString());
    } catch (err) {
      console.error("Erro ao carregar dados do módulo de reembolsos:", err);
    }
  };

  useEffect(() => {
    refreshAll();
  }, []);

  // Search input query
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPendingSearch(e.target.value);
    startTransition(() => {
      setSearchQuery(e.target.value);
    });
  };

  // Mutators
  const handleSaveConfig = async () => {
    try {
      await apiCall('/api/refunds/config', {
        method: 'POST',
        body: JSON.stringify({
          fechamento_dia: parseInt(fechamentoDia),
          vencimento_dia: parseInt(vencimentoDia)
        })
      });
      setIsConfigOpen(false);
      refreshAll();
    } catch (err: unknown) {
      notify(getErrorMessage(err, "Erro ao salvar configuração."), "error");
    }
  };

  const handleCreateDebtor = async () => {
    if (!newDebtorNome.trim()) return notify("O nome é obrigatório.", "error");
    const payload = {
      nome: newDebtorNome,
      telefone: newDebtorTelefone,
      observacoes: newDebtorObs
    };
    const endpoint = editingDebtorId
      ? `/api/refunds/debtors/${editingDebtorId}`
      : `/api/refunds/debtors`;
    const method = editingDebtorId ? 'PUT' : 'POST';

    try {
      await apiCall(endpoint, {
        method,
        body: JSON.stringify(payload)
      });
      setNewDebtorNome('');
      setNewDebtorTelefone('');
      setNewDebtorObs('');
      setEditingDebtorId(null);
      setIsDebtorModalOpen(false);
      refreshAll();
    } catch (err: unknown) {
      notify(getErrorMessage(err, "Erro ao cadastrar/editar devedor."), "error");
    }
  };

  const handleCreateLoan = async () => {
    if (!newLoanDesc || (!editingLoanId && (!newLoanDebtorId || !newLoanVal))) {
      return notify("Preencha todos os campos obrigatórios.", "error");
    }
    const payload = editingLoanId ? {
      descricao: newLoanDesc,
      categoria: newLoanCat,
      observacoes: newLoanObs
    } : {
      debtor_id: parseInt(newLoanDebtorId),
      descricao: newLoanDesc,
      categoria: newLoanCat,
      valor_total: parseFloat(newLoanVal),
      is_parcelado: newLoanParcelado,
      total_parcelas: newLoanParcelado ? parseInt(newLoanTotalParc) : 1,
      data_emprestimo: newLoanDate,
      observacoes: newLoanObs
    };

    const endpoint = editingLoanId
      ? `/api/refunds/loans/${editingLoanId}`
      : `/api/refunds/loans`;
    const method = editingLoanId ? 'PUT' : 'POST';

    try {
      await apiCall(endpoint, {
        method,
        body: JSON.stringify(payload)
      });
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
      notify(getErrorMessage(err, "Erro ao cadastrar/editar empréstimo."), "error");
    }
  };

  const handleOpenPay = (inst: ReceivableInstallmentItem, loanDesc: string) => {
    setPayingInstallment(inst);
    setPayingLoanDesc(loanDesc);
    const alreadyPaid = inst.valor_pago || 0;
    const due = Math.max(0, inst.valor_parcela - alreadyPaid);
    setPayingValue(due.toString());
    setPayingMethod('Pix');
    setIsPaymentModalOpen(true);
  };

  const handlePayInstallment = async () => {
    if (!payingInstallment) return;
    try {
      await apiCall(`/api/refunds/installments/${payingInstallment.id}/pay`, {
        method: 'POST',
        body: JSON.stringify({
          valor_pago: parseFloat(payingValue),
          forma_pagamento: payingMethod
        })
      });
      setIsPaymentModalOpen(false);
      setPayingInstallment(null);
      refreshAll();
    } catch (err: unknown) {
      notify(getErrorMessage(err, "Erro ao efetuar pagamento."), "error");
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
        body: JSON.stringify({
          valor_pago: parseFloat(globalPayValue),
          forma_pagamento: globalPayMethod
        })
      });
      setIsGlobalPayModalOpen(false);
      setGlobalPayDebtor(null);
      setGlobalPayValue('');
      refreshAll();
    } catch (err: unknown) {
      notify(getErrorMessage(err, "Erro ao processar recebimento global."), "error");
    }
  };

  const handlePayBatch = () => {
    if (selectedInstallments.length === 0) return;
    setConfirmAction({ kind: 'batch' });
  };

  const handleDeleteLoan = (id: number, desc: string) => {
    setConfirmAction({ kind: 'loan', id, desc });
  };

  const handleDeleteDebtor = (id: number, nome: string) => {
    setConfirmAction({ kind: 'debtor', id, nome });
  };

  const executeConfirmAction = async () => {
    if (!confirmAction) return;
    setConfirmLoading(true);
    try {
      if (confirmAction.kind === 'batch') {
        await apiCall('/api/refunds/installments/pay-batch', {
          method: 'POST',
          body: JSON.stringify({ ids: selectedInstallments })
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

  const handleOpenEditDebtor = (d: DebtorItem) => {
    setEditingDebtorId(d.id);
    setNewDebtorNome(d.nome);
    setNewDebtorTelefone(d.telefone || '');
    setNewDebtorObs(d.observacoes || '');
    setIsDebtorModalOpen(true);
  };

  const handleOpenEditLoan = (loanId: number) => {
    const loan = loans.find(l => l.id === loanId);
    if (!loan) return;
    setEditingLoanId(loan.id);
    setNewLoanDesc(loan.descricao);
    setNewLoanCat(loan.categoria);
    setNewLoanObs(loan.observacoes || '');
    setIsLoanModalOpen(true);
  };

  // Compile all installments list
  const allInstallmentsCompiled = useMemo(() => {
    const list: Array<{
      loanId: number;
      loanDesc: string;
      debtorNome: string;
      categoria: string;
      installment: ReceivableInstallmentItem;
    }> = [];

    loans.forEach(loan => {
      (loan.installments || []).forEach(inst => {
        list.push({
          loanId: loan.id,
          loanDesc: loan.descricao,
          debtorNome: loan.debtor_nome,
          categoria: loan.categoria,
          installment: inst
        });
      });
    });
    return list;
  }, [loans]);

  // Dynamic Faturas based on chosen Debtor Filter (User request!)
  const faturasCalculated = useMemo(() => {
    const map: Record<string, { fatura: string; total: number; recebido: number; pendente: number; status: string; items_count: number }> = {};

    allInstallmentsCompiled.forEach(item => {
      if (selectedPersonFilter !== 'Todos' && item.debtorNome !== selectedPersonFilter) {
        return;
      }

      const f = item.installment.fatura_mes || "Geral";
      if (!map[f]) {
        map[f] = { fatura: f, total: 0, recebido: 0, pendente: 0, status: "ABERTA", items_count: 0 };
      }

      map[f].total += item.installment.valor_parcela;
      map[f].recebido += item.installment.valor_pago;
      map[f].items_count += 1;
    });

    const now = new Date();
    const currentFaturaStr = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;

    const list = Object.values(map).map(details => {
      details.pendente = Math.max(0, details.total - details.recebido);

      const instsInFatura = allInstallmentsCompiled.filter(item =>
        (selectedPersonFilter === 'Todos' || item.debtorNome === selectedPersonFilter) &&
        (item.installment.fatura_mes || "Geral") === details.fatura
      );
      const allPaid = instsInFatura.length > 0 && instsInFatura.every(item => item.installment.status === 'PAGA');

      if (allPaid) {
        details.status = "RECEBIDA";
      } else if (details.recebido > 0) {
        details.status = "RECEBIDA_PARCIALMENTE";
      } else if (details.fatura < currentFaturaStr) {
        details.status = "FECHADA";
      } else {
        details.status = "ABERTA";
      }

      return details;
    });

    return list.sort((a, b) => a.fatura.localeCompare(b.fatura));
  }, [allInstallmentsCompiled, selectedPersonFilter]);

  // Filters application
  const filteredInstallments = useMemo(() => {
    return allInstallmentsCompiled.filter(item => {
      const matchFatura = selectedFatura === 'Todas' || item.installment.fatura_mes === selectedFatura;
      const matchPerson = selectedPersonFilter === 'Todos' || item.debtorNome === selectedPersonFilter;

      let matchStatus = true;
      if (selectedStatusFilter === 'Pendentes') {
        matchStatus = item.installment.status !== 'PAGA';
      } else if (selectedStatusFilter === 'Pagas') {
        matchStatus = item.installment.status === 'PAGA';
      } else if (selectedStatusFilter === 'Atrasadas') {
        matchStatus = item.installment.status === 'ATRASADA';
      }

      const query = searchQuery.toLowerCase().trim();
      const matchSearch = !query ||
        item.loanDesc.toLowerCase().includes(query) ||
        item.debtorNome.toLowerCase().includes(query) ||
        (item.categoria && item.categoria.toLowerCase().includes(query));

      return matchFatura && matchPerson && matchStatus && matchSearch;
    });
  }, [allInstallmentsCompiled, selectedFatura, selectedPersonFilter, selectedStatusFilter, searchQuery]);

  const debtorOptions = useMemo(() => {
    return debtors.map(d => ({ id: d.id, nome: d.nome }));
  }, [debtors]);

  const overdueItemsCount = useMemo(() => {
    return allInstallmentsCompiled.filter(item => item.installment.status === 'ATRASADA').length;
  }, [allInstallmentsCompiled]);

  // Dynamically calculate Header Totals based on Selected Debtor Filter
  const headerTotalLent = useMemo(() => {
    if (selectedPersonFilter === 'Todos') return dashboard?.total_emprestado || 0;
    return debtors.find(d => d.nome === selectedPersonFilter)?.valor_total_emprestado || 0;
  }, [selectedPersonFilter, debtors, dashboard]);

  const headerTotalReceived = useMemo(() => {
    if (selectedPersonFilter === 'Todos') return dashboard?.total_recebido || 0;
    return debtors.find(d => d.nome === selectedPersonFilter)?.valor_total_recebido || 0;
  }, [selectedPersonFilter, debtors, dashboard]);

  const headerTotalPending = useMemo(() => {
    if (selectedPersonFilter === 'Todos') return dashboard?.total_pendente || 0;
    return debtors.find(d => d.nome === selectedPersonFilter)?.saldo_pendente || 0;
  }, [selectedPersonFilter, debtors, dashboard]);

  return (
    <div className="space-y-6 text-text-primary pb-10">

      {/* Overdue alert banner */}
      {overdueItemsCount > 0 && (
        <div className="bg-status-error/10 border border-status-error/30 p-4 rounded-xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertCircle className="text-status-error shrink-0" size={20} />
            <div>
              <p className="text-sm font-semibold text-status-error">Atenção ao Inadimplemento</p>
              <p className="text-xs text-text-muted tabular-nums">Você possui {overdueItemsCount} parcelas em atraso na carteira de reembolsos.</p>
            </div>
          </div>
        </div>
      )}

      {/* Header com Ações Rápidas */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-surface-card p-6 rounded-xl border border-border-subtle shadow-sm">
        <div>
          <h2 className="text-2xl font-semibold flex items-center gap-2 tracking-tight">
            <Wallet className="text-accent" /> Plataforma de Reembolsos
          </h2>
          <p className="text-xs text-text-muted mt-1">Gestão de empréstimos, faturas de cartão e fluxos de caixa a receber.</p>
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
          <button
            type="button"
            onClick={() => setIsConfigOpen(true)}
            className="p-3 bg-surface-input hover:bg-surface-elevated text-text-muted hover:text-text-primary rounded-lg border border-border-subtle transition-colors"
            title="Configurações do Cartão"
          >
            <Settings size={18} />
          </button>
          <button
            type="button"
            onClick={() => { setEditingDebtorId(null); setNewDebtorNome(''); setNewDebtorTelefone(''); setNewDebtorObs(''); setIsDebtorModalOpen(true); }}
            className="flex-1 md:flex-initial bg-surface-input hover:bg-surface-elevated text-text-primary px-4 py-2.5 rounded-lg border border-border-subtle flex items-center justify-center gap-2 text-sm font-semibold transition-colors"
          >
            <User size={16} /> Novo Devedor
          </button>
          <button
            type="button"
            onClick={() => { setEditingLoanId(null); setNewLoanDebtorId(''); setNewLoanDesc(''); setNewLoanCat('Geral'); setNewLoanVal(''); setNewLoanParcelado(false); setNewLoanTotalParc('1'); setNewLoanObs(''); setIsLoanModalOpen(true); }}
            className="flex-1 md:flex-initial bg-accent hover:bg-accent/90 text-white px-4 py-2.5 rounded-lg flex items-center justify-center gap-2 text-sm font-semibold transition-colors"
          >
            <Plus size={16} /> Novo Empréstimo
          </button>
        </div>
      </div>

      {/* Cards de Métricas Principais */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">

        <div className="bg-surface-card p-5 rounded-xl border border-border-subtle shadow-sm flex items-center gap-4">
          <div className="p-3 bg-accent-soft text-accent rounded-lg border border-accent/20">
            <DollarSign size={22} />
          </div>
          <div>
            <span className="text-2xs text-text-muted uppercase font-semibold tracking-wider">Total Emprestado</span>
            <p className="text-xl font-semibold font-mono tabular-nums text-text-primary mt-0.5">{money(headerTotalLent)}</p>
          </div>
        </div>

        <div className="bg-surface-card p-5 rounded-xl border border-border-subtle shadow-sm flex items-center gap-4">
          <div className="p-3 bg-status-success/10 text-status-success rounded-lg border border-status-success/20">
            <CheckCircle size={22} />
          </div>
          <div>
            <span className="text-2xs text-text-muted uppercase font-semibold tracking-wider">Total Recebido</span>
            <p className="text-xl font-semibold font-mono tabular-nums text-status-success mt-0.5">{money(headerTotalReceived)}</p>
          </div>
        </div>

        <div className="bg-surface-card p-5 rounded-xl border border-border-subtle shadow-sm flex items-center gap-4">
          <div className="p-3 bg-status-warning/10 text-status-warning rounded-lg border border-status-warning/20">
            <TrendingUp size={22} />
          </div>
          <div>
            <span className="text-2xs text-text-muted uppercase font-semibold tracking-wider">Saldo Pendente</span>
            <p className="text-xl font-semibold font-mono tabular-nums text-status-warning mt-0.5">{money(headerTotalPending)}</p>
          </div>
        </div>

        <div className="bg-surface-card p-5 rounded-xl border border-border-subtle shadow-sm flex items-center gap-4">
          <div className="p-3 bg-status-error/10 text-status-error rounded-lg border border-status-error/20">
            <AlertCircle size={22} />
          </div>
          <div>
            <span className="text-2xs text-text-muted uppercase font-semibold tracking-wider">Montante Atrasado</span>
            <p className="text-xl font-semibold font-mono tabular-nums text-status-error mt-0.5">{money(selectedPersonFilter === 'Todos' ? (dashboard?.total_atrasado || 0) : allInstallmentsCompiled.filter(i => i.debtorNome === selectedPersonFilter && i.installment.status === 'ATRASADA').reduce((acc, i) => acc + (i.installment.valor_parcela - i.installment.valor_pago), 0))}</p>
          </div>
        </div>

      </div>

      {/* Grid de Faturas Mensais */}
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wider flex items-center gap-1.5"><Layers size={14} /> Faturas Virtuais</h3>
          <span className="text-xs text-text-muted tabular-nums">Fechamento Dia {fechamentoDia}</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4 overflow-x-auto pb-2 scrollbar-thin">
          <button
            type="button"
            onClick={() => setSelectedFatura('Todas')}
            className={`p-4 rounded-xl border transition-colors text-left flex flex-col justify-between h-[100px] ${selectedFatura === 'Todas' ? 'bg-accent-soft border-accent text-text-primary shadow-sm' : 'bg-surface-card border-border-subtle hover:border-accent/40 text-text-muted'}`}
          >
            <div className="flex justify-between items-start w-full">
              <span className="text-xs font-semibold uppercase tracking-wider">Consolidado</span>
              <span className="text-2xs bg-surface-input px-1.5 py-0.5 rounded-md font-mono">TODAS</span>
            </div>
            <p className={`text-lg font-semibold font-mono tabular-nums ${selectedFatura === 'Todas' ? 'text-accent' : 'text-text-primary'}`}>{money(headerTotalPending)}</p>
          </button>

          {faturasCalculated.map(fat => {
            const isSelected = selectedFatura === fat.fatura;
            let statusColor = 'bg-surface-input text-text-muted border-border-subtle';
            if (fat.status === 'RECEBIDA') statusColor = 'bg-status-success/10 text-status-success border-status-success/30';
            else if (fat.status === 'RECEBIDA_PARCIALMENTE') statusColor = 'bg-status-warning/10 text-status-warning border-status-warning/30';
            else if (fat.status === 'FECHADA') statusColor = 'bg-status-error/10 text-status-error border-status-error/30';

            return (
              <button
                type="button"
                key={fat.fatura}
                onClick={() => setSelectedFatura(fat.fatura)}
                className={`p-4 rounded-xl border transition-colors text-left flex flex-col justify-between h-[100px] ${isSelected ? 'bg-accent-soft border-accent text-text-primary shadow-sm' : 'bg-surface-card border-border-subtle hover:border-accent/40 text-text-muted'}`}
              >
                <div className="flex justify-between items-start w-full gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider truncate">{fat.fatura}</span>
                  <span className={`text-2xs px-1.5 rounded-md border shrink-0 font-semibold ${statusColor}`}>{fat.status.replaceAll('_', ' ')}</span>
                </div>
                <div>
                  <p className={`text-lg font-semibold font-mono tabular-nums ${isSelected ? 'text-accent' : 'text-text-primary'}`}>{money(fat.pendente)}</p>
                  <p className="text-2xs text-text-muted font-medium tabular-nums">De {money(fat.total)} ({fat.items_count} parc)</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Grid Principal - Devedores + Gráficos & Tabela */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Lado Esquerdo - Perfis de Devedores */}
        <div className="lg:col-span-1 space-y-4 bg-surface-card p-5 rounded-xl border border-border-subtle shadow-sm">
          <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wider flex items-center gap-1.5"><User size={14} /> Perfis de Devedores</h3>

          <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1 scrollbar-thin">
            {debtors.length === 0 ? (
              <p className="text-xs text-text-muted text-center py-6">Nenhum devedor cadastrado.</p>
            ) : (
              debtors.map(d => (
                <div key={d.id} className="p-3 bg-surface-elevated border border-border-subtle rounded-xl space-y-2 group transition-colors relative">

                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-surface-input flex items-center justify-center border border-border-subtle text-text-primary font-semibold text-xs">
                        {d.nome.substring(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-text-primary leading-none">{d.nome}</p>
                        {d.telefone && (
                          <span className="text-2xs text-text-muted flex items-center gap-0.5 mt-0.5 tabular-nums"><Phone size={8} /> {d.telefone}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                      <span className={`text-xs font-semibold font-mono tabular-nums ${d.saldo_pendente > 0 ? 'text-status-warning' : 'text-text-muted'}`}>
                        {money(d.saldo_pendente)}
                      </span>

                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {d.saldo_pendente > 0 && (
                          <button
                            type="button"
                            onClick={() => handleOpenGlobalPay(d)}
                            className="bg-status-success/15 hover:bg-status-success/25 text-status-success border border-status-success/30 px-1.5 py-0.5 rounded-md text-2xs font-semibold transition-colors"
                            title="Quitação em Lote / Baixa Parcial por Valor"
                          >
                            Pagar
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleOpenEditDebtor(d)}
                          className="bg-accent-soft hover:bg-accent/25 text-accent border border-accent/30 p-1 rounded-md transition-colors"
                          title="Editar cadastro de devedor"
                        >
                          <Pencil size={10} />
                        </button>
                        {d.saldo_pendente === 0 && (
                          <button
                            type="button"
                            onClick={() => handleDeleteDebtor(d.id, d.nome)}
                            className="bg-status-error/15 hover:bg-status-error/25 text-status-error border border-status-error/30 p-1 rounded-md transition-colors"
                            title="Remover devedor"
                          >
                            <Trash2 size={10} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-1.5 pt-1.5 border-t border-border-subtle text-2xs text-text-muted">
                    <div>
                      <span className="text-text-muted block">Total Emprestado:</span>
                      <span className="font-semibold font-mono tabular-nums text-text-primary">{money(d.valor_total_emprestado)}</span>
                    </div>
                    <div>
                      <span className="text-text-muted block">Último Pagamento:</span>
                      <span className="font-semibold text-text-primary truncate block font-mono tabular-nums">
                        {d.data_ultimo_pagamento ? d.data_ultimo_pagamento.split('T')[0] : 'Nenhum'}
                      </span>
                    </div>
                  </div>
                  {d.observacoes && (
                    <p className="text-2xs text-text-muted italic bg-surface p-1.5 rounded-lg border border-border-subtle truncate">{d.observacoes}</p>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Lado Direito - Gráficos de Concentração */}
        <div className="lg:col-span-2 space-y-4 bg-surface-card p-5 rounded-xl border border-border-subtle shadow-sm">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wider flex items-center gap-1.5"><BarChart2 size={14} /> Distribuição de Receitas</h3>
            <span className="text-2xs text-text-muted">Visualização Analítica</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Gráfico 1 - Concentração por Categoria */}
            <div className="bg-surface-elevated p-4 rounded-xl border border-border-subtle h-[220px] flex flex-col justify-between">
              <p className="text-xs font-semibold text-text-muted mb-1 flex items-center gap-1"><PieIcon size={12} /> Concentração por Categorias</p>
              <div className="flex-1 min-h-[160px]">
                {dashboard?.categorias && dashboard.categorias.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                    <PieChart>
                      <Pie
                        data={dashboard.categorias}
                        dataKey="valor"
                        nameKey="categoria"
                        cx="50%"
                        cy="50%"
                        outerRadius={55}
                        fill={SEMANTIC_CHART_HEX.blue}
                        labelLine={false}
                      >
                        {dashboard.categorias.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={CHART_PALETTE_SERIES[index % CHART_PALETTE_SERIES.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ backgroundColor: palette.tooltipBg, borderColor: palette.tooltipBorder, color: palette.tooltipLabel }}
                        formatter={(val) => money(val as number)}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-xs text-text-muted">Sem dados.</div>
                )}
              </div>
            </div>

            {/* Gráfico 2 - Balanço de Faturas Mensais */}
            <div className="bg-surface-elevated p-4 rounded-xl border border-border-subtle h-[220px] flex flex-col justify-between">
              <p className="text-xs font-semibold text-text-muted mb-1 flex items-center gap-1"><TrendingUp size={12} /> Evolução de Faturas</p>
              <div className="flex-1 min-h-[160px]">
                {faturasCalculated.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                    <AreaChart data={faturasCalculated}>
                      <defs>
                        <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={SEMANTIC_CHART_HEX.blue} stopOpacity={0.2} />
                          <stop offset="95%" stopColor={SEMANTIC_CHART_HEX.blue} stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="colorRec" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={SEMANTIC_CHART_HEX.emerald} stopOpacity={0.2} />
                          <stop offset="95%" stopColor={SEMANTIC_CHART_HEX.emerald} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="fatura" stroke={palette.axis} fontSize={11} />
                      <Tooltip
                        contentStyle={{ backgroundColor: palette.tooltipBg, borderColor: palette.tooltipBorder, color: palette.tooltipLabel }}
                        formatter={(val) => money(val as number)}
                      />
                      <Area type="monotone" dataKey="total" name="Total Fatura" stroke={SEMANTIC_CHART_HEX.blue} fillOpacity={1} fill="url(#colorTotal)" />
                      <Area type="monotone" dataKey="recebido" name="Recebido" stroke={SEMANTIC_CHART_HEX.emerald} fillOpacity={1} fill="url(#colorRec)" />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-xs text-text-muted">Sem dados.</div>
                )}
              </div>
            </div>

          </div>
        </div>

      </div>

      {/* Seção da Tabela de Lançamentos */}
      <div className="bg-surface-card p-6 rounded-xl border border-border-subtle shadow-sm space-y-4">

        {/* Controles da Tabela */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
            <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wider flex items-center gap-1.5"><FileText size={14} /> Detalhamento de Lançamentos</h3>
            <div className="flex items-center gap-2 bg-surface-elevated p-1.5 rounded-lg border border-border-subtle">
              <button
                type="button"
                onClick={() => setSelectedStatusFilter('Todos')}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${selectedStatusFilter === 'Todos' ? 'bg-accent text-white' : 'text-text-muted hover:text-text-primary'}`}
              >
                Todos
              </button>
              <button
                type="button"
                onClick={() => setSelectedStatusFilter('Pendentes')}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${selectedStatusFilter === 'Pendentes' ? 'bg-accent text-white' : 'text-text-muted hover:text-text-primary'}`}
              >
                Pendentes
              </button>
              <button
                type="button"
                onClick={() => setSelectedStatusFilter('Pagas')}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${selectedStatusFilter === 'Pagas' ? 'bg-accent text-white' : 'text-text-muted hover:text-text-primary'}`}
              >
                Pagas
              </button>
              <button
                type="button"
                onClick={() => setSelectedStatusFilter('Atrasadas')}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${selectedStatusFilter === 'Atrasadas' ? 'bg-accent text-white' : 'text-text-muted hover:text-text-primary'}`}
              >
                Atrasadas
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full lg:w-auto shrink-0">
            {/* Filter by Devedor */}
            <select
              value={selectedPersonFilter}
              onChange={(e) => setSelectedPersonFilter(e.target.value)}
              className="bg-surface-input border border-border-subtle p-2 rounded-lg text-xs font-semibold outline-none text-text-primary focus:border-accent transition-colors cursor-pointer"
            >
              <option value="Todos">Filtrar: Todos</option>
              {debtorOptions.map(opt => (
                <option key={opt.id} value={opt.nome}>{opt.nome}</option>
              ))}
            </select>

            {/* Input de Busca */}
            <div className="relative w-full lg:w-[220px]">
              <input
                type="text"
                placeholder="Buscar por descrição..."
                value={pendingSearch}
                onChange={handleSearchChange}
                className="w-full bg-surface-input border border-border-subtle p-2 pl-3 rounded-lg text-xs outline-none text-text-primary focus:border-accent transition-colors"
              />
              {isPending && <span className="absolute right-3 top-2.5 w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin"></span>}
            </div>

            {/* Ações em Lote */}
            {selectedInstallments.length > 0 && (
              <button
                type="button"
                onClick={handlePayBatch}
                className="bg-status-success hover:bg-status-success/90 text-white px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors shrink-0 flex items-center gap-1"
              >
                <CheckSquare size={13} /> Receber ({selectedInstallments.length})
              </button>
            )}
          </div>
        </div>

        {/* Tabela de Lançamentos */}
        <div className="overflow-x-auto rounded-xl border border-border-subtle bg-surface">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-surface-elevated text-text-muted font-semibold border-b border-border-subtle uppercase tracking-wider text-2xs">
                <th className="p-4 w-[40px] text-center">
                  <input
                    type="checkbox"
                    checked={selectedInstallments.length > 0 && selectedInstallments.length === filteredInstallments.filter(i => i.installment.status !== 'PAGA').length}
                    onChange={(e) => {
                      if (e.target.checked) {
                        const openIds = filteredInstallments
                          .filter(i => i.installment.status !== 'PAGA')
                          .map(i => i.installment.id);
                        setSelectedInstallments(openIds);
                      } else {
                        setSelectedInstallments([]);
                      }
                    }}
                    className="cursor-pointer accent-accent"
                  />
                </th>
                <th className="p-4">Descrição</th>
                <th className="p-4">Devedor</th>
                <th className="p-4">Categoria</th>
                <th className="p-4">Parcela</th>
                <th className="p-4">Vencimento</th>
                <th className="p-4">Fatura</th>
                <th className="p-4 text-right">Valor</th>
                <th className="p-4 text-right">Pago</th>
                <th className="p-4 text-center">Status</th>
                <th className="p-4 text-center">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredInstallments.length === 0 ? (
                <tr>
                  <td colSpan={11} className="p-8 text-center text-text-muted italic">Nenhum lançamento pendente encontrado para os filtros selecionados.</td>
                </tr>
              ) : (
                filteredInstallments.map(item => {
                  const isChecked = selectedInstallments.includes(item.installment.id);
                  let statusBadge = 'bg-surface-input text-text-muted border-border-subtle';
                  if (item.installment.status === 'PAGA') statusBadge = 'bg-status-success/10 text-status-success border-status-success/30';
                  else if (item.installment.status === 'ATRASADA') statusBadge = 'bg-status-error/10 text-status-error border-status-error/30';
                  else if (item.installment.status === 'ABERTA') statusBadge = 'bg-accent-soft text-accent border-accent/30';

                  return (
                    <tr key={item.installment.id} className="border-b border-border-subtle hover:bg-surface-elevated group transition-colors">
                      <td className="p-4 text-center">
                        {item.installment.status !== 'PAGA' ? (
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              setSelectedInstallments(prev =>
                                prev.includes(item.installment.id)
                                  ? prev.filter(id => id !== item.installment.id)
                                  : [...prev, item.installment.id]
                              );
                            }}
                            className="cursor-pointer accent-accent"
                          />
                        ) : (
                          <div className="w-4 h-4 mx-auto bg-surface-input rounded flex items-center justify-center text-text-muted"><CheckCircle size={10} /></div>
                        )}
                      </td>
                      <td className="p-4 font-medium text-text-primary max-w-[180px] truncate">{item.loanDesc}</td>
                      <td className="p-4 text-text-muted font-semibold">{item.debtorNome}</td>
                      <td className="p-4 text-text-muted">
                        <span className="bg-surface-input px-2 py-0.5 rounded-md border border-border-subtle text-2xs font-medium">{item.categoria}</span>
                      </td>
                      <td className="p-4 text-text-muted font-mono tabular-nums">
                        {item.installment.numero_parcela}/{item.loanId ? loans.find(l => l.id === item.loanId)?.total_parcelas : 1}
                      </td>
                      <td className="p-4 text-text-muted font-mono tabular-nums">{item.installment.data_vencimento.split('T')[0]}</td>
                      <td className="p-4 text-text-muted font-mono tabular-nums font-medium">{item.installment.fatura_mes}</td>
                      <td className="p-4 text-right font-semibold font-mono tabular-nums text-text-primary">{money(item.installment.valor_parcela)}</td>
                      <td className="p-4 text-right font-semibold font-mono tabular-nums text-status-success">{money(item.installment.valor_pago)}</td>
                      <td className="p-4 text-center">
                        <span className={`text-2xs px-2 py-0.5 rounded-md border font-semibold ${statusBadge}`}>{item.installment.status}</span>
                      </td>
                      <td className="p-4 text-center">
                        <div className="flex items-center justify-center gap-1 opacity-75 group-hover:opacity-100 transition-opacity">
                          {item.installment.status !== 'PAGA' && (
                            <button
                              type="button"
                              onClick={() => handleOpenPay(item.installment, item.loanDesc)}
                              className="text-text-muted hover:text-status-success p-1.5 rounded-lg hover:bg-status-success/10 transition-colors"
                              title="Registrar recebimento"
                            >
                              <CheckCircle size={14} />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleOpenEditLoan(item.loanId)}
                            className="text-text-muted hover:text-accent p-1.5 rounded-lg hover:bg-accent-soft transition-colors"
                            title="Editar descrição/categoria do empréstimo"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteLoan(item.loanId, item.loanDesc)}
                            className="text-text-muted hover:text-status-error p-1.5 rounded-lg hover:bg-status-error/10 transition-colors"
                            title="Excluir empréstimo"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ReceivablesModals
        money={money}
        isConfigOpen={isConfigOpen}
        onCloseConfig={() => setIsConfigOpen(false)}
        fechamentoDia={fechamentoDia}
        setFechamentoDia={setFechamentoDia}
        vencimentoDia={vencimentoDia}
        setVencimentoDia={setVencimentoDia}
        onSaveConfig={handleSaveConfig}
        isDebtorModalOpen={isDebtorModalOpen}
        onCloseDebtorModal={() => setIsDebtorModalOpen(false)}
        editingDebtorId={editingDebtorId}
        newDebtorNome={newDebtorNome}
        setNewDebtorNome={setNewDebtorNome}
        newDebtorTelefone={newDebtorTelefone}
        setNewDebtorTelefone={setNewDebtorTelefone}
        newDebtorObs={newDebtorObs}
        setNewDebtorObs={setNewDebtorObs}
        onCreateDebtor={handleCreateDebtor}
        isLoanModalOpen={isLoanModalOpen}
        onCloseLoanModal={() => setIsLoanModalOpen(false)}
        editingLoanId={editingLoanId}
        newLoanDebtorId={newLoanDebtorId}
        setNewLoanDebtorId={setNewLoanDebtorId}
        debtorOptions={debtorOptions}
        newLoanCat={newLoanCat}
        setNewLoanCat={setNewLoanCat}
        newLoanDesc={newLoanDesc}
        setNewLoanDesc={setNewLoanDesc}
        newLoanVal={newLoanVal}
        setNewLoanVal={setNewLoanVal}
        newLoanDate={newLoanDate}
        setNewLoanDate={setNewLoanDate}
        newLoanParcelado={newLoanParcelado}
        setNewLoanParcelado={setNewLoanParcelado}
        newLoanTotalParc={newLoanTotalParc}
        setNewLoanTotalParc={setNewLoanTotalParc}
        newLoanObs={newLoanObs}
        setNewLoanObs={setNewLoanObs}
        onCreateLoan={handleCreateLoan}
        isPaymentModalOpen={isPaymentModalOpen}
        onClosePaymentModal={() => setIsPaymentModalOpen(false)}
        payingInstallment={payingInstallment}
        payingLoanDesc={payingLoanDesc}
        payingValue={payingValue}
        setPayingValue={setPayingValue}
        payingMethod={payingMethod}
        setPayingMethod={setPayingMethod}
        onPayInstallment={handlePayInstallment}
        isGlobalPayModalOpen={isGlobalPayModalOpen}
        onCloseGlobalPayModal={() => setIsGlobalPayModalOpen(false)}
        globalPayDebtor={globalPayDebtor}
        globalPayValue={globalPayValue}
        setGlobalPayValue={setGlobalPayValue}
        globalPayMethod={globalPayMethod}
        setGlobalPayMethod={setGlobalPayMethod}
        onPayGlobalDebtor={handlePayGlobalDebtor}
      />

      <ConfirmDialog
        isOpen={confirmAction !== null}
        title={
          confirmAction?.kind === 'batch'
            ? 'Liquidar parcelas'
            : confirmAction?.kind === 'loan'
            ? 'Excluir empréstimo'
            : 'Excluir devedor'
        }
        message={
          confirmAction?.kind === 'batch'
            ? `Confirmar liquidação das ${selectedInstallments.length} parcelas selecionadas?`
            : confirmAction?.kind === 'loan'
            ? `Deseja excluir permanentemente o empréstimo "${confirmAction.desc}" e todas as suas parcelas?`
            : confirmAction?.kind === 'debtor'
            ? `Deseja excluir o perfil de "${confirmAction.nome}"? Todos os empréstimos ativos dele serão arquivados.`
            : ''
        }
        confirmLabel={
          confirmLoading
            ? 'Processando...'
            : confirmAction?.kind === 'batch'
            ? 'Liquidar'
            : 'Excluir'
        }
        onCancel={() => { if (!confirmLoading) setConfirmAction(null); }}
        onConfirm={executeConfirmAction}
      />
    </div>
  );
};
