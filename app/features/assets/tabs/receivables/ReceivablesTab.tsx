/* eslint-disable @typescript-eslint/no-explicit-any */
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
        apiCall<any>('/api/refunds/dashboard'),
        apiCall<any>('/api/refunds/debtors'),
        apiCall<any>('/api/refunds/loans'),
        apiCall<any>('/api/refunds/config')
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
    } catch (err: any) {
      alert(err.message || "Erro ao salvar configuração.");
    }
  };

  const handleCreateDebtor = async () => {
    if (!newDebtorNome.trim()) return alert("O nome é obrigatório.");
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
    } catch (err: any) {
      alert(err.message || "Erro ao cadastrar/editar devedor.");
    }
  };

  const handleCreateLoan = async () => {
    if (!newLoanDesc || (!editingLoanId && (!newLoanDebtorId || !newLoanVal))) {
      return alert("Preencha todos os campos obrigatórios.");
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
    } catch (err: any) {
      alert(err.message || "Erro ao cadastrar/editar empréstimo.");
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
    } catch (err: any) {
      alert(err.message || "Erro ao efetuar pagamento.");
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
    } catch (err: any) {
      alert(err.message || "Erro ao processar recebimento global.");
    }
  };

  const handlePayBatch = async () => {
    if (selectedInstallments.length === 0) return;
    if (!confirm(`Confirmar liquidação das ${selectedInstallments.length} parcelas selecionadas?`)) return;
    try {
      await apiCall('/api/refunds/installments/pay-batch', {
        method: 'POST',
        body: JSON.stringify({
          ids: selectedInstallments
        })
      });
      setSelectedInstallments([]);
      refreshAll();
    } catch (err) {
      alert("Erro ao liquidar parcelas selecionadas.");
    }
  };

  const handleDeleteLoan = async (id: number, desc: string) => {
    if (!confirm(`Deseja excluir permanentemente o empréstimo "${desc}" e todas as suas parcelas?`)) return;
    try {
      await apiCall(`/api/refunds/loans/${id}`, {
        method: 'DELETE'
      });
      refreshAll();
    } catch (err) {
      alert("Erro ao excluir empréstimo.");
    }
  };

  const handleDeleteDebtor = async (id: number, nome: string) => {
    if (!confirm(`Deseja excluir o perfil de "${nome}"? Todos os empréstimos ativos dele serão arquivados.`)) return;
    try {
      await apiCall(`/api/refunds/debtors/${id}`, {
        method: 'DELETE'
      });
      refreshAll();
    } catch (err) {
      alert("Erro ao excluir devedor.");
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
    <div className="space-y-6 text-slate-100 animate-in fade-in duration-300 pb-10">

      {/* Overdue alert banner */}
      {overdueItemsCount > 0 && (
        <div className="bg-red-500/10 border border-red-500/30 p-4 rounded-xl flex items-center justify-between shadow-lg shadow-red-900/5 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <AlertCircle className="text-red-400 shrink-0" size={20} />
            <div>
              <p className="text-sm font-bold text-red-200">Atenção ao Inadimplemento</p>
              <p className="text-xs text-red-400">Você possui {overdueItemsCount} parcelas em atraso na carteira de reembolsos.</p>
            </div>
          </div>
        </div>
      )}

      {/* Header com Ações Rápidas */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-900/50 backdrop-blur-md p-6 rounded-2xl border border-slate-800">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2 tracking-tight">
            <Wallet className="text-blue-500" /> Plataforma de Reembolsos
          </h2>
          <p className="text-xs text-slate-400 mt-1">Gestão de empréstimos, faturas de cartão e fluxos de caixa a receber.</p>
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
          <button
            type="button"
            onClick={() => setIsConfigOpen(true)}
            className="p-3 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl border border-slate-700 transition-all"
            title="Configurações do Cartão"
          >
            <Settings size={18} />
          </button>
          <button
            type="button"
            onClick={() => { setEditingDebtorId(null); setNewDebtorNome(''); setNewDebtorTelefone(''); setNewDebtorObs(''); setIsDebtorModalOpen(true); }}
            className="flex-1 md:flex-initial bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2.5 rounded-xl border border-slate-700 flex items-center justify-center gap-2 text-sm font-bold transition-all"
          >
            <User size={16} /> Novo Devedor
          </button>
          <button
            type="button"
            onClick={() => { setEditingLoanId(null); setNewLoanDebtorId(''); setNewLoanDesc(''); setNewLoanCat('Geral'); setNewLoanVal(''); setNewLoanParcelado(false); setNewLoanTotalParc('1'); setNewLoanObs(''); setIsLoanModalOpen(true); }}
            className="flex-1 md:flex-initial bg-blue-600 hover:bg-blue-500 text-white px-4 py-2.5 rounded-xl flex items-center justify-center gap-2 text-sm font-bold shadow-lg shadow-blue-900/30 transition-all"
          >
            <Plus size={16} /> Novo Empréstimo
          </button>
        </div>
      </div>

      {/* Cards de Métricas Principais (Glassmorphism - Dynamically Filtered) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">

        <div className="bg-slate-900/40 backdrop-blur-md p-5 rounded-2xl border border-slate-800 flex items-center gap-4">
          <div className="p-3 bg-blue-500/10 text-blue-400 rounded-xl border border-blue-500/20">
            <DollarSign size={22} />
          </div>
          <div>
            <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Total Emprestado</span>
            <p className="text-xl font-bold font-mono text-white mt-0.5">{formatMoney(headerTotalLent)}</p>
          </div>
        </div>

        <div className="bg-slate-900/40 backdrop-blur-md p-5 rounded-2xl border border-slate-800 flex items-center gap-4">
          <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20">
            <CheckCircle size={22} />
          </div>
          <div>
            <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Total Recebido</span>
            <p className="text-xl font-bold font-mono text-emerald-400 mt-0.5">{formatMoney(headerTotalReceived)}</p>
          </div>
        </div>

        <div className="bg-slate-900/40 backdrop-blur-md p-5 rounded-2xl border border-slate-800 flex items-center gap-4">
          <div className="p-3 bg-yellow-500/10 text-yellow-400 rounded-xl border border-yellow-500/20">
            <TrendingUp size={22} />
          </div>
          <div>
            <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Saldo Pendente</span>
            <p className="text-xl font-bold font-mono text-yellow-400 mt-0.5">{formatMoney(headerTotalPending)}</p>
          </div>
        </div>

        <div className="bg-slate-900/40 backdrop-blur-md p-5 rounded-2xl border border-slate-800 flex items-center gap-4">
          <div className="p-3 bg-red-500/10 text-red-400 rounded-xl border border-red-500/20">
            <AlertCircle size={22} />
          </div>
          <div>
            <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Montante Atrasado</span>
            <p className="text-xl font-bold font-mono text-red-400 mt-0.5">{formatMoney(selectedPersonFilter === 'Todos' ? (dashboard?.total_atrasado || 0) : allInstallmentsCompiled.filter(i => i.debtorNome === selectedPersonFilter && i.installment.status === 'ATRASADA').reduce((acc, i) => acc + (i.installment.valor_parcela - i.installment.valor_pago), 0))}</p>
          </div>
        </div>

      </div>

      {/* Grid de Faturas Mensais */}
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><Layers size={14} /> Faturas Virtuais</h3>
          <span className="text-xs text-slate-500">Fechamento Dia {fechamentoDia}</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4 overflow-x-auto pb-2 scrollbar-thin">
          <button
            type="button"
            onClick={() => setSelectedFatura('Todas')}
            className={`p-4 rounded-xl border transition-all text-left flex flex-col justify-between h-[100px] ${selectedFatura === 'Todas' ? 'bg-blue-600/10 border-blue-500 text-white shadow-lg' : 'bg-slate-900/30 border-slate-800 hover:border-slate-700 text-slate-400'}`}
          >
            <div className="flex justify-between items-start w-full">
              <span className="text-xs font-bold uppercase tracking-wider">Consolidado</span>
              <span className="text-[9px] bg-slate-800 px-1.5 py-0.5 rounded font-mono">TODAS</span>
            </div>
            <p className={`text-lg font-bold font-mono ${selectedFatura === 'Todas' ? 'text-blue-400' : 'text-white'}`}>{formatMoney(headerTotalPending)}</p>
          </button>

          {faturasCalculated.map(fat => {
            const isSelected = selectedFatura === fat.fatura;
            let statusColor = 'bg-slate-800 text-slate-400 border-slate-700';
            if (fat.status === 'RECEBIDA') statusColor = 'bg-emerald-950/40 text-emerald-400 border-emerald-800/30';
            else if (fat.status === 'RECEBIDA_PARCIALMENTE') statusColor = 'bg-yellow-950/40 text-yellow-400 border-yellow-800/30';
            else if (fat.status === 'FECHADA') statusColor = 'bg-red-950/40 text-red-400 border-red-800/30';

            return (
              <button
                type="button"
                key={fat.fatura}
                onClick={() => setSelectedFatura(fat.fatura)}
                className={`p-4 rounded-xl border transition-all text-left flex flex-col justify-between h-[100px] ${isSelected ? 'bg-blue-600/10 border-blue-500 text-white shadow-lg' : 'bg-slate-900/30 border-slate-800 hover:border-slate-700 text-slate-400'}`}
              >
                <div className="flex justify-between items-start w-full gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider truncate">{fat.fatura}</span>
                  <span className={`text-[8px] px-1 rounded border shrink-0 font-bold ${statusColor}`}>{fat.status}</span>
                </div>
                <div>
                  <p className={`text-lg font-bold font-mono ${isSelected ? 'text-blue-400' : 'text-white'}`}>{formatMoney(fat.pendente)}</p>
                  <p className="text-[9px] text-slate-500 font-medium">De {formatMoney(fat.total)} ({fat.items_count} parc)</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Grid Principal - Devedores + Gráficos & Tabela */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Lado Esquerdo - Perfis de Devedores */}
        <div className="lg:col-span-1 space-y-4 bg-slate-900/40 backdrop-blur-md p-5 rounded-2xl border border-slate-800">
          <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><User size={14} /> Perfis de Devedores</h3>

          <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1 scrollbar-thin">
            {debtors.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-6">Nenhum devedor cadastrado.</p>
            ) : (
              debtors.map(d => (
                <div key={d.id} className="p-3 bg-slate-950/40 border border-slate-800/80 hover:border-slate-800 rounded-xl space-y-2 group transition-all relative">

                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center border border-slate-700 text-slate-300 font-bold text-xs">
                        {d.nome.substring(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-white leading-none">{d.nome}</p>
                        {d.telefone && (
                          <span className="text-[10px] text-slate-500 flex items-center gap-0.5 mt-0.5"><Phone size={8} /> {d.telefone}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                      <span className={`text-xs font-bold font-mono ${d.saldo_pendente > 0 ? 'text-yellow-400' : 'text-slate-500'}`}>
                        {formatMoney(d.saldo_pendente)}
                      </span>

                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                        {d.saldo_pendente > 0 && (
                          <button
                            type="button"
                            onClick={() => handleOpenGlobalPay(d)}
                            className="bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.5 rounded text-[10px] font-bold transition-all"
                            title="Quitação em Lote / Baixa Parcial por Valor"
                          >
                            Pagar
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleOpenEditDebtor(d)}
                          className="bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 border border-blue-500/30 p-1 rounded transition-all"
                          title="Editar cadastro de devedor"
                        >
                          <Pencil size={10} />
                        </button>
                        {d.saldo_pendente === 0 && (
                          <button
                            type="button"
                            onClick={() => handleDeleteDebtor(d.id, d.nome)}
                            className="bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 p-1 rounded transition-all"
                            title="Remover devedor"
                          >
                            <Trash2 size={10} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-1.5 pt-1.5 border-t border-slate-900/60 text-[9px] text-slate-400">
                    <div>
                      <span className="text-slate-600 block">Total Emprestado:</span>
                      <span className="font-semibold font-mono text-slate-300">{formatMoney(d.valor_total_emprestado)}</span>
                    </div>
                    <div>
                      <span className="text-slate-600 block">Último Pagamento:</span>
                      <span className="font-semibold text-slate-300 truncate block font-mono">
                        {d.data_ultimo_pagamento ? d.data_ultimo_pagamento.split('T')[0] : 'Nenhum'}
                      </span>
                    </div>
                  </div>
                  {d.observacoes && (
                    <p className="text-[9px] text-slate-500 italic bg-slate-900/30 p-1.5 rounded border border-slate-800/30 truncate">{d.observacoes}</p>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Lado Direito - Gráficos de Concentração */}
        <div className="lg:col-span-2 space-y-4 bg-slate-900/40 backdrop-blur-md p-5 rounded-2xl border border-slate-800">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><BarChart2 size={14} /> Distribuição de Receitas</h3>
            <span className="text-[10px] text-slate-500">Visualização Analítica</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Gráfico 1 - Concentração por Categoria */}
            <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-850 h-[220px] flex flex-col justify-between">
              <p className="text-xs font-bold text-slate-400 mb-1 flex items-center gap-1"><PieIcon size={12} /> Concentração por Categorias</p>
              <div className="flex-1 min-h-[160px]">
                {dashboard?.categorias && dashboard.categorias.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={dashboard.categorias}
                        dataKey="valor"
                        nameKey="categoria"
                        cx="50%"
                        cy="50%"
                        outerRadius={55}
                        fill="#3b82f6"
                        labelLine={false}
                      >
                        {dashboard.categorias.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'][index % 5]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b' }}
                        formatter={(val) => formatMoney(val as number)}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-xs text-slate-600">Sem dados.</div>
                )}
              </div>
            </div>

            {/* Gráfico 2 - Balanço de Faturas Mensais */}
            <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-850 h-[220px] flex flex-col justify-between">
              <p className="text-xs font-bold text-slate-400 mb-1 flex items-center gap-1"><TrendingUp size={12} /> Evolução de Faturas</p>
              <div className="flex-1 min-h-[160px]">
                {faturasCalculated.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={faturasCalculated}>
                      <defs>
                        <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="colorRec" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="fatura" stroke="#475569" fontSize={9} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b' }}
                        formatter={(val) => formatMoney(val as number)}
                      />
                      <Area type="monotone" dataKey="total" name="Total Fatura" stroke="#3b82f6" fillOpacity={1} fill="url(#colorTotal)" />
                      <Area type="monotone" dataKey="recebido" name="Recebido" stroke="#10b981" fillOpacity={1} fill="url(#colorRec)" />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-xs text-slate-600">Sem dados.</div>
                )}
              </div>
            </div>

          </div>
        </div>

      </div>

      {/* Seção da Tabela de Lançamentos */}
      <div className="bg-slate-900/50 backdrop-blur-md p-6 rounded-2xl border border-slate-800 space-y-4">

        {/* Controles da Tabela */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><FileText size={14} /> Detalhamento de Lançamentos</h3>
            <div className="flex items-center gap-2 bg-slate-950/60 p-1.5 rounded-lg border border-slate-800">
              <button
                type="button"
                onClick={() => setSelectedStatusFilter('Todos')}
                className={`px-3 py-1 rounded text-xs font-bold transition-all ${selectedStatusFilter === 'Todos' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
              >
                Todos
              </button>
              <button
                type="button"
                onClick={() => setSelectedStatusFilter('Pendentes')}
                className={`px-3 py-1 rounded text-xs font-bold transition-all ${selectedStatusFilter === 'Pendentes' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
              >
                Pendentes
              </button>
              <button
                type="button"
                onClick={() => setSelectedStatusFilter('Pagas')}
                className={`px-3 py-1 rounded text-xs font-bold transition-all ${selectedStatusFilter === 'Pagas' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
              >
                Pagas
              </button>
              <button
                type="button"
                onClick={() => setSelectedStatusFilter('Atrasadas')}
                className={`px-3 py-1 rounded text-xs font-bold transition-all ${selectedStatusFilter === 'Atrasadas' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
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
              className="bg-slate-950 border border-slate-800 p-2 rounded-lg text-xs font-bold outline-none text-slate-300 focus:border-blue-500 transition-all cursor-pointer"
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
                className="w-full bg-slate-950 border border-slate-800 p-2 pl-3 rounded-lg text-xs outline-none text-white focus:border-blue-500 transition-colors"
              />
              {isPending && <span className="absolute right-3 top-2.5 w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></span>}
            </div>

            {/* Ações em Lote */}
            {selectedInstallments.length > 0 && (
              <button
                type="button"
                onClick={handlePayBatch}
                className="bg-emerald-600 hover:bg-emerald-500 text-white px-3.5 py-2 rounded-lg text-xs font-bold transition-all shrink-0 flex items-center gap-1 shadow-md shadow-emerald-950/20"
              >
                <CheckSquare size={13} /> Receber ({selectedInstallments.length})
              </button>
            )}
          </div>
        </div>

        {/* Tabela de Lançamentos */}
        <div className="overflow-x-auto rounded-xl border border-slate-800/80 bg-slate-950/20">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-950/80 text-slate-400 font-bold border-b border-slate-800 uppercase tracking-wider text-[10px]">
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
                    className="cursor-pointer accent-blue-500"
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
                  <td colSpan={11} className="p-8 text-center text-slate-500 italic">Nenhum lançamento pendente encontrado para os filtros selecionados.</td>
                </tr>
              ) : (
                filteredInstallments.map(item => {
                  const isChecked = selectedInstallments.includes(item.installment.id);
                  let statusBadge = 'bg-slate-950/60 text-slate-500 border-slate-800';
                  if (item.installment.status === 'PAGA') statusBadge = 'bg-emerald-950/40 text-emerald-400 border-emerald-900/30';
                  else if (item.installment.status === 'ATRASADA') statusBadge = 'bg-red-950/40 text-red-400 border-red-900/30 animate-pulse';
                  else if (item.installment.status === 'ABERTA') statusBadge = 'bg-blue-950/40 text-blue-400 border-blue-900/30';

                  return (
                    <tr key={item.installment.id} className="border-b border-slate-900 hover:bg-slate-900/20 group transition-all">
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
                            className="cursor-pointer accent-blue-500"
                          />
                        ) : (
                          <div className="w-4 h-4 mx-auto bg-slate-900/10 rounded flex items-center justify-center text-slate-600"><CheckCircle size={10} /></div>
                        )}
                      </td>
                      <td className="p-4 font-medium text-white max-w-[180px] truncate">{item.loanDesc}</td>
                      <td className="p-4 text-slate-400 font-semibold">{item.debtorNome}</td>
                      <td className="p-4 text-slate-400">
                        <span className="bg-slate-900 px-2 py-0.5 rounded border border-slate-800/80 text-[10px] font-medium">{item.categoria}</span>
                      </td>
                      <td className="p-4 text-slate-400 font-mono">
                        {item.installment.numero_parcela}/{item.loanId ? loans.find(l => l.id === item.loanId)?.total_parcelas : 1}
                      </td>
                      <td className="p-4 text-slate-400 font-mono">{item.installment.data_vencimento.split('T')[0]}</td>
                      <td className="p-4 text-slate-500 font-mono font-medium">{item.installment.fatura_mes}</td>
                      <td className="p-4 text-right font-bold font-mono text-slate-200">{formatMoney(item.installment.valor_parcela)}</td>
                      <td className="p-4 text-right font-semibold font-mono text-emerald-500">{formatMoney(item.installment.valor_pago)}</td>
                      <td className="p-4 text-center">
                        <span className={`text-[9px] px-2 py-0.5 rounded border font-bold ${statusBadge}`}>{item.installment.status}</span>
                      </td>
                      <td className="p-4 text-center">
                        <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                          {item.installment.status !== 'PAGA' && (
                            <button
                              type="button"
                              onClick={() => handleOpenPay(item.installment, item.loanDesc)}
                              className="text-slate-400 hover:text-emerald-400 p-1.5 rounded-full hover:bg-emerald-550/10 transition-colors"
                              title="Registrar recebimento"
                            >
                              <CheckCircle size={14} />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleOpenEditLoan(item.loanId)}
                            className="text-slate-400 hover:text-blue-450 p-1.5 rounded-full hover:bg-blue-500/10 transition-colors"
                            title="Editar descrição/categoria do emprÃ©stimo"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteLoan(item.loanId, item.loanDesc)}
                            className="text-slate-600 hover:text-red-400 p-1.5 rounded-full hover:bg-red-500/10"
                            title="Excluir emprÃ©stimo"
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

      {/* ?? Config Modal */}
      {isConfigOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 w-full max-w-sm space-y-4 shadow-2xl animate-in zoom-in-95 relative">
            <button type="button" onClick={() => setIsConfigOpen(false)} className="absolute top-4 right-4 text-slate-500 hover:text-white transition-colors"><X size={20} /></button>
            <h3 className="text-lg font-bold text-white flex items-center gap-2"><Settings className="text-blue-500" /> Configurar Fatura</h3>
            <div className="space-y-4">
              <div>
                <label className="text-[10px] text-slate-500 uppercase font-bold pl-1 mb-1 block">Dia de Fechamento</label>
                <input
                  type="number"
                  min="1"
                  max="31"
                  className="w-full bg-slate-950 border border-slate-800 p-3 rounded-xl text-white outline-none focus:border-blue-500 transition-colors font-mono font-bold"
                  value={fechamentoDia}
                  onChange={e => setFechamentoDia(e.target.value)}
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-500 uppercase font-bold pl-1 mb-1 block">Dia de Vencimento</label>
                <input
                  type="number"
                  min="1"
                  max="31"
                  className="w-full bg-slate-950 border border-slate-800 p-3 rounded-xl text-white outline-none focus:border-blue-500 transition-colors font-mono font-bold"
                  value={vencimentoDia}
                  onChange={e => setVencimentoDia(e.target.value)}
                />
              </div>
            </div>
            <button
              type="button"
              onClick={handleSaveConfig}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white p-3 rounded-xl font-bold transition-all"
            >
              Salvar Configuração
            </button>
          </div>
        </div>
      )}

      {/* ?? Novo/Editar Devedor Modal */}
      {isDebtorModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 w-full max-w-sm space-y-4 shadow-2xl animate-in zoom-in-95 relative">
            <button type="button" onClick={() => setIsDebtorModalOpen(false)} className="absolute top-4 right-4 text-slate-500 hover:text-white transition-colors"><X size={20} /></button>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <User className="text-blue-500" /> {editingDebtorId ? 'Editar Devedor' : 'Cadastrar Devedor'}
            </h3>
            <div className="space-y-3">
              <div>
                <label className="text-[10px] text-slate-500 uppercase font-bold pl-1 mb-1 block">Nome Completo</label>
                <input
                  type="text"
                  placeholder="Ex: Lucas, Pedro..."
                  className="w-full bg-slate-950 border border-slate-800 p-3 rounded-xl text-white outline-none focus:border-blue-500 transition-colors"
                  value={newDebtorNome}
                  onChange={e => setNewDebtorNome(e.target.value)}
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-500 uppercase font-bold pl-1 mb-1 block">Telefone (Opcional)</label>
                <input
                  type="text"
                  placeholder="Ex: (11) 99999-9999"
                  className="w-full bg-slate-950 border border-slate-800 p-3 rounded-xl text-white outline-none focus:border-blue-500 transition-colors font-mono"
                  value={newDebtorTelefone}
                  onChange={e => setNewDebtorTelefone(e.target.value)}
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-500 uppercase font-bold pl-1 mb-1 block">Anotações</label>
                <textarea
                  placeholder="Ex: Contato financeiro preferido..."
                  rows={2}
                  className="w-full bg-slate-950 border border-slate-800 p-3 rounded-xl text-slate-350 outline-none focus:border-blue-500 transition-colors text-xs resize-none"
                  value={newDebtorObs}
                  onChange={e => setNewDebtorObs(e.target.value)}
                />
              </div>
            </div>
            <button
              type="button"
              onClick={handleCreateDebtor}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white p-3 rounded-xl font-bold transition-all"
            >
              {editingDebtorId ? 'Atualizar Devedor' : 'Criar Devedor'}
            </button>
          </div>
        </div>
      )}

      {/* ?? Novo/Editar Empréstimo Modal */}
      {isLoanModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 w-full max-w-md space-y-4 shadow-2xl animate-in zoom-in-95 relative">
            <button type="button" onClick={() => setIsLoanModalOpen(false)} className="absolute top-4 right-4 text-slate-500 hover:text-white transition-colors"><X size={20} /></button>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Plus className="text-blue-500" /> {editingLoanId ? 'Editar Detalhes do Empréstimo' : 'Registrar Empréstimo'}
            </h3>
            <div className="space-y-3">

              {!editingLoanId && (
                <div className="grid grid-cols-2 gap-3 animate-in fade-in duration-200">
                  <div>
                    <label className="text-[10px] text-slate-500 uppercase font-bold pl-1 mb-1 block">Devedor</label>
                    <select
                      value={newLoanDebtorId}
                      onChange={e => setNewLoanDebtorId(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 p-3 rounded-xl text-white outline-none focus:border-blue-500 transition-colors text-xs cursor-pointer"
                    >
                      <option value="">Selecione...</option>
                      {debtorOptions.map(opt => (
                        <option key={opt.id} value={opt.id}>{opt.nome}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 uppercase font-bold pl-1 mb-1 block">Categoria</label>
                    <select
                      value={newLoanCat}
                      onChange={e => setNewLoanCat(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 p-3 rounded-xl text-white outline-none focus:border-blue-500 transition-colors text-xs cursor-pointer"
                    >
                      <option value="Geral">Geral</option>
                      <option value="Aluguel">Aluguel</option>
                      <option value="Refeição">Refeição</option>
                      <option value="Viagem">Viagem</option>
                      <option value="Transporte">Transporte</option>
                      <option value="Outros">Outros</option>
                    </select>
                  </div>
                </div>
              )}

              {editingLoanId && (
                <div className="animate-in fade-in duration-200">
                  <label className="text-[10px] text-slate-500 uppercase font-bold pl-1 mb-1 block">Categoria</label>
                  <select
                    value={newLoanCat}
                    onChange={e => setNewLoanCat(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 p-3 rounded-xl text-white outline-none focus:border-blue-500 transition-colors text-xs cursor-pointer"
                  >
                    <option value="Geral">Geral</option>
                    <option value="Aluguel">Aluguel</option>
                    <option value="Refeição">Refeição</option>
                    <option value="Viagem">Viagem</option>
                    <option value="Transporte">Transporte</option>
                    <option value="Outros">Outros</option>
                  </select>
                </div>
              )}

              <div>
                <label className="text-[10px] text-slate-500 uppercase font-bold pl-1 mb-1 block">Descrição</label>
                <input
                  type="text"
                  placeholder="Ex: Jantar de aniversário"
                  className="w-full bg-slate-950 border border-slate-800 p-3 rounded-xl text-white outline-none focus:border-blue-500 transition-colors text-xs"
                  value={newLoanDesc}
                  onChange={e => setNewLoanDesc(e.target.value)}
                />
              </div>

              {!editingLoanId && (
                <div className="grid grid-cols-2 gap-3 animate-in fade-in duration-200">
                  <div>
                    <label className="text-[10px] text-slate-500 uppercase font-bold pl-1 mb-1 block">Valor Total</label>
                    <input
                      type="number"
                      placeholder="R$ 0,00"
                      className="w-full bg-slate-950 border border-slate-800 p-3 rounded-xl text-white outline-none focus:border-blue-500 transition-colors font-mono font-bold"
                      value={newLoanVal}
                      onChange={e => setNewLoanVal(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 uppercase font-bold pl-1 mb-1 block">Data de Empréstimo</label>
                    <input
                      type="date"
                      className="w-full bg-slate-950 border border-slate-800 p-3 rounded-xl text-white outline-none focus:border-blue-500 transition-colors font-mono"
                      value={newLoanDate}
                      onChange={e => setNewLoanDate(e.target.value)}
                    />
                  </div>
                </div>
              )}

              {!editingLoanId && (
                <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-850 space-y-2 animate-in fade-in duration-200">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-400">Empréstimo Parcelado?</span>
                    <input
                      type="checkbox"
                      checked={newLoanParcelado}
                      onChange={e => setNewLoanParcelado(e.target.checked)}
                      className="cursor-pointer accent-blue-500 w-4 h-4"
                    />
                  </div>
                  {newLoanParcelado && (
                    <div className="animate-in slide-in-from-top-1 duration-200">
                      <label className="text-[10px] text-slate-500 uppercase font-bold pl-1 mb-1 block">Quantidade de Parcelas</label>
                      <input
                        type="number"
                        min="2"
                        placeholder="Qtd parcelas"
                        className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-lg text-white outline-none focus:border-blue-500 transition-colors font-mono"
                        value={newLoanTotalParc}
                        onChange={e => setNewLoanTotalParc(e.target.value)}
                      />
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="text-[10px] text-slate-500 uppercase font-bold pl-1 mb-1 block">Observações / Anotações</label>
                <textarea
                  placeholder="Anotações adicionais para este empréstimo..."
                  rows={2}
                  className="w-full bg-slate-950 border border-slate-800 p-3 rounded-xl text-slate-300 outline-none focus:border-blue-500 transition-colors text-xs resize-none"
                  value={newLoanObs}
                  onChange={e => setNewLoanObs(e.target.value)}
                />
              </div>

            </div>
            <button
              type="button"
              onClick={handleCreateLoan}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white p-3 rounded-xl font-bold transition-all"
            >
              {editingLoanId ? 'Salvar Alterações' : 'Criar Empréstimo'}
            </button>
          </div>
        </div>
      )}

      {/* ?? Registrar Recebimento Modal */}
      {isPaymentModalOpen && payingInstallment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 w-full max-w-sm space-y-4 shadow-2xl animate-in zoom-in-95 relative">
            <button type="button" onClick={() => setIsPaymentModalOpen(false)} className="absolute top-4 right-4 text-slate-500 hover:text-white transition-colors"><X size={20} /></button>
            <h3 className="text-lg font-bold text-white flex items-center gap-2"><CheckSquare className="text-emerald-500" /> Registrar Recebimento</h3>

            <div className="space-y-1.5 p-3 bg-slate-950/60 rounded-xl border border-slate-800 text-xs">
              <p className="text-slate-400">Empréstimo: <span className="text-white font-semibold">{payingLoanDesc}</span></p>
              <p className="text-slate-400">Parcela: <span className="text-white font-mono font-semibold">#{payingInstallment.numero_parcela}</span></p>
              <p className="text-slate-400">Valor Parcela: <span className="text-emerald-400 font-mono font-bold">{formatMoney(payingInstallment.valor_parcela)}</span></p>
              {payingInstallment.valor_pago > 0 && (
                <p className="text-slate-500">Já Recebido Parcialmente: <span className="text-slate-400 font-mono">{formatMoney(payingInstallment.valor_pago)}</span></p>
              )}
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[10px] text-slate-500 uppercase font-bold pl-1 mb-1 block">Valor Pago (R$)</label>
                <input
                  type="number"
                  placeholder="0,00"
                  className="w-full bg-slate-950 border border-slate-800 p-3 rounded-xl text-white outline-none focus:border-blue-500 transition-colors font-mono font-bold text-lg"
                  value={payingValue}
                  onChange={e => setPayingValue(e.target.value)}
                />
                <span className="text-[9px] text-slate-500 block pl-1 mt-1">Valores maiores abaterão parcelas futuras sequencialmente.</span>
              </div>

              <div>
                <label className="text-[10px] text-slate-500 uppercase font-bold pl-1 mb-1 block">Forma de Pagamento</label>
                <select
                  value={payingMethod}
                  onChange={e => setPayingMethod(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 p-3 rounded-xl text-white outline-none focus:border-blue-500 transition-colors text-xs cursor-pointer"
                >
                  <option value="Pix">Pix</option>
                  <option value="Dinheiro">Dinheiro</option>
                  <option value="Crédito">Crédito / Boleto</option>
                  <option value="Outro">Outro</option>
                </select>
              </div>
            </div>

            <button
              type="button"
              onClick={handlePayInstallment}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white p-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2"
            >
              <CheckCircle size={16} /> Confirmar Recebimento
            </button>
          </div>
        </div>
      )}

      {/* ?? Registrar Recebimento Global Modal (User request!) */}
      {isGlobalPayModalOpen && globalPayDebtor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 w-full max-w-sm space-y-4 shadow-2xl animate-in zoom-in-95 relative">
            <button type="button" onClick={() => setIsGlobalPayModalOpen(false)} className="absolute top-4 right-4 text-slate-500 hover:text-white transition-colors"><X size={20} /></button>
            <h3 className="text-lg font-bold text-white flex items-center gap-2"><CheckSquare className="text-emerald-500" /> Quitação / Recebimento Global</h3>

            <div className="space-y-1.5 p-3 bg-slate-950/60 rounded-xl border border-slate-800 text-xs">
              <p className="text-slate-400">Devedor: <span className="text-white font-semibold">{globalPayDebtor.nome}</span></p>
              <p className="text-slate-400">Saldo Devedor Total: <span className="text-yellow-400 font-mono font-bold">{formatMoney(globalPayDebtor.saldo_pendente)}</span></p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[10px] text-slate-500 uppercase font-bold pl-1 mb-1 block">Valor Recebido (R$)</label>
                <input
                  type="number"
                  placeholder="0,00"
                  className="w-full bg-slate-950 border border-slate-800 p-3 rounded-xl text-white outline-none focus:border-blue-500 transition-colors font-mono font-bold text-lg"
                  value={globalPayValue}
                  onChange={e => setGlobalPayValue(e.target.value)}
                />
                <span className="text-[9px] text-slate-500 block pl-1 mt-1">Este valor quitar as parcelas em aberto mais antigas sequencialmente, abatendo ou parcelando a última afetada se necessário.</span>
              </div>

              <div>
                <label className="text-[10px] text-slate-500 uppercase font-bold pl-1 mb-1 block">Forma de Pagamento</label>
                <select
                  value={globalPayMethod}
                  onChange={e => setGlobalPayMethod(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 p-3 rounded-xl text-white outline-none focus:border-blue-500 transition-colors text-xs cursor-pointer"
                >
                  <option value="Pix">Pix</option>
                  <option value="Dinheiro">Dinheiro</option>
                  <option value="Crédito">Crédito / Boleto</option>
                  <option value="Outro">Outro</option>
                </select>
              </div>
            </div>

            <button
              type="button"
              onClick={handlePayGlobalDebtor}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white p-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2"
            >
              <CheckCircle size={16} /> Confirmar Recebimento Lote
            </button>
          </div>
        </div>
      )}

    </div>
  );
};
