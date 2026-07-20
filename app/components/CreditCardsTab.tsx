'use client';

import React, { useState, useEffect } from 'react';
import { 
  Plus, CheckCircle, CreditCard, Calendar, Trash2, X, Wallet, 
  TrendingUp, AlertCircle, DollarSign, FileText,
  Clock, CheckSquare
} from 'lucide-react';
import { formatMoney } from '../lib/format';
import { CreditCardInstallmentItem, CreditCardsDashboardData } from '../types';
import { apiCall } from '../lib/api';
import { StatementImportModal } from './StatementImportModal';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';
import { useChartPalette } from '../lib/chartPalette';

interface CardItem {
  id: number;
  name: string;
  limit: number;
  closing_day: number;
  due_day: number;
}


interface ExpenseItem {
  id: number;
  description: string;
  total_value: number;
  installments_count: number;
  date: string;
  installments: CreditCardInstallmentItem[];
}

interface InvoiceSummaryItem {
  invoice_month: string;
  total: number;
  pending: number;
  paid: number;
  status: string;
}

const formatInvoiceMonthLabel = (monthStr: string): string => {
  if (!monthStr || !monthStr.includes('-')) return monthStr || '';
  const [year, month] = monthStr.split('-');
  const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const mIndex = parseInt(month, 10) - 1;
  const monthName = months[mIndex] || month;
  return `${monthName}/${year}`;
};

const getCategoryFromDescription = (desc: string): string => {
  const d = (desc || '').toUpperCase();
  if (d.includes('TRANSAÇÃO (') || d.includes('PIX') || d.includes('TRANSFER') || d.includes('TED') || d.includes('DOC')) {
    return 'Transferências/Pessoas';
  }
  if (d.includes('IFOOD') || d.includes('COFFEE') || d.includes('RESTAURANTE') || d.includes('PADARIA') || d.includes('BURGER') || d.includes('SUSHI') || d.includes('PIZZA') || d.includes('CAFE') || d.includes('CAFÉ') || d.includes('LANCHE') || d.includes('MERCADO') || d.includes('SUPERMERCADO') || d.includes('ASSAI') || d.includes('CARREFOUR') || d.includes('ATACADAO')) {
    return 'Alimentação';
  }
  if (d.includes('UBER') || d.includes('99') || d.includes('POSTO') || d.includes('SHELL') || d.includes('IPIRANGA') || d.includes('PETROBRAS') || d.includes('ESTACIONAMENTO') || d.includes('SEM PARAR') || d.includes('VELOE') || d.includes('METRO') || d.includes('ONIBUS')) {
    return 'Transporte';
  }
  if (d.includes('DROGARIA') || d.includes('FARMACIA') || d.includes('FARMÁCIA') || d.includes('PACHECO') || d.includes('RAIA') || d.includes('PAGUE MENOS') || d.includes('SAO PAULO') || d.includes('CONSULTA') || d.includes('MEDICO') || d.includes('HOSPITAL') || d.includes('CLINICA')) {
    return 'Saúde/Farmácia';
  }
  if (d.includes('CINEMA') || d.includes('INGRESSO') || d.includes('SHOW') || d.includes('SYMPLA') || d.includes('EVENTO')) {
    return 'Lazer/Entretenimento';
  }
  if (d.includes('NETFLIX') || d.includes('SPOTIFY') || d.includes('AMAZON') || d.includes('APPLE') || d.includes('GOOGLE') || d.includes('GLOBOPLAY') || d.includes('HBO') || d.includes('DISNEY') || d.includes('VIVO') || d.includes('CLARO') || d.includes('TIM') || d.includes('ENERGIA')) {
    return 'Serviços/Assinaturas';
  }
  if (d.includes('FATURA') || d.includes('PAGAMENTO DE FATURA')) {
    return 'Fatura/Cartão';
  }
  return 'Outros';
};

export function CreditCardsTab() {
  const palette = useChartPalette();
  const [cards, setCards] = useState<CardItem[]>([]);
  const [selectedCard, setSelectedCard] = useState<CardItem | null>(null);
  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [dashboard, setDashboard] = useState<CreditCardsDashboardData | null>(null);
  const [cardInvoices, setCardInvoices] = useState<InvoiceSummaryItem[]>([]);
  const [selectedInvoiceMonth, setSelectedInvoiceMonth] = useState<string>('');
  
  // Modais
  const [showAddCard, setShowAddCard] = useState(false);
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  // Forms
  const [cardForm, setCardForm] = useState({ name: '', limit: '', closing_day: '5', due_day: '15' });
  const [expenseForm, setExpenseForm] = useState({ description: '', total_value: '', installments_count: '1', date: '' });

  const loadAllData = async () => {
    try {
      const dataCards = await apiCall<CardItem[]>('/api/credit-cards');
      setCards(dataCards);
      if (dataCards.length > 0 && !selectedCard) {
        setSelectedCard(dataCards[0]);
      }

      const dataDash = await apiCall<CreditCardsDashboardData>('/api/credit-cards/dashboard');
      setDashboard(dataDash);
    } catch (e) {
      console.error(e);
    }
  };

  const loadCardInvoicesAndExpenses = async (cardId: number, monthToSelect?: string) => {
    try {
      const invoices = await apiCall<InvoiceSummaryItem[]>(`/api/credit-cards/${cardId}/invoices`);
      setCardInvoices(invoices || []);
      
      let targetMonth = monthToSelect;
      if (!targetMonth && invoices && invoices.length > 0) {
        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const currentMonthStr = `${y}-${m}`;
        const foundCurrent = invoices.find(i => i.invoice_month === currentMonthStr);
        if (foundCurrent) {
          targetMonth = currentMonthStr;
        } else {
          targetMonth = invoices[invoices.length - 1].invoice_month;
        }
      }
      
      if (targetMonth) {
        setSelectedInvoiceMonth(targetMonth);
        await loadExpensesByMonth(cardId, targetMonth);
      } else {
        setSelectedInvoiceMonth('');
        setExpenses([]);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const loadExpensesByMonth = async (cardId: number, month: string) => {
    try {
      const data = await apiCall<{ items: ExpenseItem[] }>(`/api/credit-cards/${cardId}/expenses?invoice_month=${month}`);
      setExpenses(data.items || []);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadAllData();
  }, []);

  useEffect(() => {
    if (selectedCard) {
      loadCardInvoicesAndExpenses(selectedCard.id);
    } else {
      setCardInvoices([]);
      setExpenses([]);
      setSelectedInvoiceMonth('');
    }
  }, [selectedCard]);

  const handleCreateCard = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiCall('/api/credit-cards', {
        method: 'POST',
        body: JSON.stringify(cardForm)
      });
      setCardForm({ name: '', limit: '', closing_day: '5', due_day: '15' });
      setShowAddCard(false);
      loadAllData();
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCard) return;
    try {
      await apiCall(`/api/credit-cards/${selectedCard.id}/expenses`, {
        method: 'POST',
        body: JSON.stringify({
          ...expenseForm,
          date: expenseForm.date || new Date().toISOString()
        })
      });
      setExpenseForm({ description: '', total_value: '', installments_count: '1', date: '' });
      setShowAddExpense(false);
      loadAllData();
      if (selectedCard) {
        loadCardInvoicesAndExpenses(selectedCard.id, selectedInvoiceMonth || undefined);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteCard = async (cardId: number) => {
    if (!confirm('Deseja excluir este cartão e todas as despesas associadas?')) return;
    try {
      await apiCall(`/api/credit-cards/${cardId}`, {
        method: 'DELETE'
      });
      setSelectedCard(null);
      loadAllData();
    } catch (e) {
      console.error(e);
    }
  };

  const handleToggleInstallmentStatus = async (installmentId: number, currentStatus: string) => {
    const nextStatus = currentStatus === 'PAID' ? 'PENDING' : 'PAID';
    try {
      await apiCall(`/api/credit-cards/installments/${installmentId}/pay`, {
        method: 'POST',
        body: JSON.stringify({ status: nextStatus })
      });
      loadAllData();
      if (selectedCard) {
        loadCardInvoicesAndExpenses(selectedCard.id, selectedInvoiceMonth || undefined);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const categoryTotals: Record<string, number> = {};
  expenses.forEach(e => {
    const cat = getCategoryFromDescription(e.description);
    const itemValue = Number((e as any).value !== undefined ? (e as any).value : e.total_value || 0);
    categoryTotals[cat] = (categoryTotals[cat] || 0) + itemValue;
  });
  const chartData = Object.entries(categoryTotals).map(([name, value]) => ({
    name,
    value
  }));
  const COLORS = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ec4899', '#06b6d4', '#ef4444', '#64748b'];

  const activeInv = cardInvoices.find(i => i.invoice_month === selectedInvoiceMonth);
  const displayLimit = selectedCard ? selectedCard.limit : (dashboard?.total_limit || 0);
  const displayLimitLabel = selectedCard ? `Limite (${selectedCard.name})` : 'Limite Total';
  
  const displaySpent = selectedInvoiceMonth && activeInv 
    ? activeInv.total 
    : (selectedCard ? cardInvoices.reduce((acc, i) => acc + i.total, 0) : (dashboard?.total_spent || 0));
  const displaySpentLabel = selectedInvoiceMonth && activeInv
    ? `Total Gasto (${selectedCard ? `${selectedCard.name} • ` : ''}${formatInvoiceMonthLabel(selectedInvoiceMonth)})`
    : (selectedCard ? `Total Gasto (${selectedCard.name})` : 'Total Gasto (Geral)');

  const displayPending = selectedInvoiceMonth && activeInv 
    ? activeInv.pending 
    : (selectedCard ? cardInvoices.reduce((acc, i) => acc + i.pending, 0) : (dashboard?.total_pending || 0));
  const displayPendingLabel = selectedInvoiceMonth && activeInv
    ? `Pendente (${selectedCard ? `${selectedCard.name} • ` : ''}${formatInvoiceMonthLabel(selectedInvoiceMonth)})`
    : (selectedCard ? `Pendente (${selectedCard.name})` : 'Faturas Pendentes (Geral)');

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-surface-card border border-slate-800 rounded-xl p-5 relative overflow-hidden shadow-lg">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs text-slate-400 font-semibold tracking-wider uppercase">{displayLimitLabel}</p>
              <h3 className="text-2xl font-bold text-white mt-1">{formatMoney(displayLimit)}</h3>
            </div>
            <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-lg">
              <CreditCard size={18} />
            </div>
          </div>
        </div>

        <div className="bg-surface-card border border-slate-800 rounded-xl p-5 relative overflow-hidden shadow-lg">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs text-slate-400 font-semibold tracking-wider uppercase">{displaySpentLabel}</p>
              <h3 className="text-2xl font-bold text-rose-400 mt-1">{formatMoney(displaySpent)}</h3>
            </div>
            <div className="p-2 bg-rose-500/10 text-rose-400 rounded-lg">
              <DollarSign size={18} />
            </div>
          </div>
        </div>

        <div className="bg-surface-card border border-slate-800 rounded-xl p-5 relative overflow-hidden shadow-lg">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs text-slate-400 font-semibold tracking-wider uppercase">{displayPendingLabel}</p>
              <h3 className="text-2xl font-bold text-amber-400 mt-1">{formatMoney(displayPending)}</h3>
            </div>
            <div className="p-2 bg-amber-500/10 text-amber-400 rounded-lg">
              <Clock size={18} />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar Cartões */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-surface-card border border-slate-800 rounded-xl p-4 shadow-lg space-y-4">
            <div className="flex justify-between items-center">
              <h4 className="text-sm font-bold text-white uppercase tracking-wider">Meus Cartões</h4>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setShowImportModal(true)}
                  title="Importar fatura em PDF/Excel"
                  className="flex items-center gap-1 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium px-2.5 py-1 rounded-lg transition shadow"
                >
                  <FileText size={13} /> Importar
                </button>
                <button 
                  onClick={() => setShowAddCard(true)}
                  title="Adicionar novo cartão"
                  className="p-1 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg transition"
                >
                  <Plus size={16} />
                </button>
              </div>
            </div>

            <div className="space-y-2">
              {cards.map((c) => (
                <div 
                  key={c.id}
                  onClick={() => setSelectedCard(c)}
                  className={`p-3 rounded-lg border text-left cursor-pointer transition flex justify-between items-center ${
                    selectedCard?.id === c.id 
                      ? 'bg-indigo-500/10 border-indigo-500 text-white' 
                      : 'bg-slate-900/40 border-slate-800 hover:border-slate-700 text-slate-300'
                  }`}
                >
                  <div>
                    <p className="font-semibold text-sm">{c.name}</p>
                    <p className="text-xs text-slate-400">Limite: {formatMoney(c.limit)}</p>
                  </div>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteCard(c.id);
                    }}
                    className="text-slate-500 hover:text-rose-400 p-1 rounded transition"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}

              {cards.length > 1 && (
                <div 
                  onClick={() => setSelectedCard({
                    id: 0,
                    name: 'TOTAL',
                    limit: cards.reduce((acc, c) => acc + Number(c.limit || 0), 0),
                    closing_day: 1,
                    due_day: 1
                  })}
                  className={`p-3 rounded-lg border text-left cursor-pointer transition flex justify-between items-center ${
                    selectedCard?.id === 0 
                      ? 'bg-indigo-500/10 border-indigo-500 text-white shadow-md shadow-indigo-500/10' 
                      : 'bg-slate-900/40 border-slate-800 hover:border-slate-700 text-slate-300'
                  }`}
                >
                  <div>
                    <p className="font-semibold text-sm flex items-center gap-1.5 text-indigo-300">
                      <span>TOTAL</span>
                      <span className="text-[10px] font-normal bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded border border-indigo-500/30">
                        Consolidado
                      </span>
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Limite: {formatMoney(cards.reduce((acc, c) => acc + Number(c.limit || 0), 0))}
                    </p>
                  </div>
                </div>
              )}

              {cards.length === 0 && (
                <p className="text-xs text-slate-400 text-center py-4">Nenhum cartão cadastrado.</p>
              )}
            </div>
          </div>

          {/* Faturas Mensais */}
          <div className="bg-surface-card border border-slate-800 rounded-xl p-4 shadow-lg space-y-3">
            <h4 className="text-sm font-bold text-white uppercase tracking-wider flex items-center justify-between">
              <span>Histórico de Faturas</span>
              {selectedCard && <span className="text-[10px] font-normal text-slate-400">{selectedCard.name}</span>}
            </h4>
            <div className="space-y-2 max-h-[220px] overflow-y-auto custom-scrollbar">
              {selectedCard ? (
                cardInvoices.map((f) => {
                  const isSelected = selectedInvoiceMonth === f.invoice_month;
                  return (
                    <div 
                      key={f.invoice_month} 
                      onClick={() => {
                        setSelectedInvoiceMonth(f.invoice_month);
                        loadExpensesByMonth(selectedCard.id, f.invoice_month);
                      }}
                      className={`p-2.5 rounded border flex justify-between items-center cursor-pointer transition ${
                        isSelected 
                          ? 'bg-blue-600/15 border-blue-500 shadow-sm shadow-blue-500/10' 
                          : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div>
                        <p className={`text-xs font-bold ${isSelected ? 'text-blue-300' : 'text-slate-200'}`}>
                          {formatInvoiceMonthLabel(f.invoice_month)}
                        </p>
                        <p className="text-[11px] text-slate-400 mt-0.5">Total: {formatMoney(f.total)}</p>
                      </div>
                      <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                        f.status === 'PAID' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                        f.status === 'PARTIAL' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                        f.total === 0 ? 'bg-slate-800 text-slate-400 border border-slate-700' :
                        'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                      }`}>
                        {f.status === 'PAID' ? 'Paga' : f.status === 'PARTIAL' ? 'Parcial' : f.total === 0 ? 'Zerada' : 'Aberta'}
                      </span>
                    </div>
                  );
                })
              ) : (
                dashboard?.faturas.map((f) => (
                  <div key={f.invoice_month} className="p-2 rounded bg-slate-900/60 border border-slate-800 flex justify-between items-center">
                    <div>
                      <p className="text-xs font-semibold text-slate-300">{formatInvoiceMonthLabel(f.invoice_month)}</p>
                      <p className="text-xs text-slate-400">Total: {formatMoney(f.total)}</p>
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                      f.status === 'PAID' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                      f.status === 'PARTIAL' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                      'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                    }`}>
                      {f.status === 'PAID' ? 'Paga' : f.status === 'PARTIAL' ? 'Parcial' : 'Aberta'}
                    </span>
                  </div>
                ))
              )}

              {selectedCard && cardInvoices.length === 0 && (
                <p className="text-xs text-slate-500 text-center py-4">Nenhuma fatura encontrada para este cartão.</p>
              )}
              {!selectedCard && (!dashboard?.faturas || dashboard.faturas.length === 0) && (
                <p className="text-xs text-slate-500 text-center py-4">Sem faturas lançadas.</p>
              )}
            </div>
          </div>
        </div>

        {/* Detalhes do Cartão Selecionado */}
        <div className="lg:col-span-3 bg-surface-card border border-slate-800 rounded-xl p-5 shadow-lg space-y-5">
          {selectedCard ? (
            <>
              <div className="flex justify-between items-center border-b border-slate-800 pb-4">
                <div>
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <h3 className="text-lg font-bold text-white">{selectedCard.name}</h3>
                    {selectedInvoiceMonth && (
                      <span className="text-xs font-bold text-blue-300 bg-blue-500/15 border border-blue-500/30 px-2.5 py-0.5 rounded-md flex items-center gap-1">
                        📅 Fatura de {formatInvoiceMonthLabel(selectedInvoiceMonth)}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    Fechamento: Dia {selectedCard.closing_day} | Vencimento: Dia {selectedCard.due_day}
                    {(() => {
                      const invSummary = cardInvoices.find(i => i.invoice_month === selectedInvoiceMonth);
                      return invSummary ? (
                        <span className="ml-2 pl-2 border-l border-slate-700 text-slate-300">
                          Total da Fatura: <strong className={invSummary.total === 0 ? 'text-slate-400' : 'text-rose-400 font-bold'}>{formatMoney(invSummary.total)}</strong>
                        </span>
                      ) : null;
                    })()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowImportModal(true)}
                    className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-3.5 py-1.5 rounded-lg transition shadow-md shadow-blue-600/20"
                  >
                    <FileText size={14} /> Importar Relatório
                  </button>
                  <button
                    onClick={() => setShowAddExpense(true)}
                    className="flex items-center gap-1 bg-indigo-500 hover:bg-indigo-600 text-white text-xs px-3 py-1.5 rounded-lg transition"
                  >
                    <Plus size={14} /> Registrar Despesa
                  </button>
                </div>
              </div>

              {/* Gráfico de Pizza por Categoria */}
              {expenses.length > 0 ? (
                <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
                  <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3 flex items-center justify-between">
                    <span>🥧 Composição da Fatura de {formatInvoiceMonthLabel(selectedInvoiceMonth)}</span>
                    <span className="text-[11px] text-slate-400 font-normal">Total analisado: {formatMoney(Object.values(categoryTotals).reduce((a, b) => a + b, 0))}</span>
                  </h4>
                  <div className="h-52 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={chartData}
                          cx="50%"
                          cy="50%"
                          innerRadius={42}
                          outerRadius={70}
                          paddingAngle={4}
                          dataKey="value"
                        >
                          {chartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value: any) => [formatMoney(Number(value || 0)), '']}
                          contentStyle={{ backgroundColor: palette.tooltipBg, borderColor: palette.tooltipBorder, borderRadius: '0.75rem', color: palette.tooltipLabel }}
                          itemStyle={{ color: palette.tooltipLabel }}
                        />
                        <Legend 
                          layout="vertical" 
                          verticalAlign="middle" 
                          align="right"
                          wrapperStyle={{ fontSize: '11px', color: '#94a3b8' }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              ) : selectedInvoiceMonth ? (
                <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-6 text-center my-2">
                  <div className="w-10 h-10 rounded-full bg-slate-800/80 text-slate-400 flex items-center justify-center mx-auto mb-2">
                    <Calendar size={20} />
                  </div>
                  <h4 className="text-sm font-bold text-white">Fatura de {formatInvoiceMonthLabel(selectedInvoiceMonth)} Zerada</h4>
                  <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                    No momento não existem novas despesas importadas ou parcelas de meses anteriores com vencimento nesta competência para o cartão {selectedCard.name}.
                  </p>
                </div>
              ) : null}

              {/* Lista de Despesas */}
              <div className="space-y-4">
                <h4 className="text-sm font-bold text-white uppercase tracking-wider flex items-center justify-between">
                  <span>Lançamentos da Fatura ({formatInvoiceMonthLabel(selectedInvoiceMonth)})</span>
                  <span className="text-xs font-normal text-slate-400">{expenses.length} item(ns)</span>
                </h4>
                <div className="space-y-3 overflow-y-auto max-h-[500px] custom-scrollbar pr-2">
                  {expenses.map((e) => {
                    const itemValue = Number((e as any).value !== undefined ? (e as any).value : e.total_value || 0);
                    return (
                      <div key={e.id} className="p-4 rounded-lg bg-slate-900/50 border border-slate-800 space-y-3">
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-semibold text-sm text-white">{e.description}</p>
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-800 text-blue-300 border border-slate-700/60">
                                {getCategoryFromDescription(e.description)}
                              </span>
                              {e.installments_count > 1 && (e as any).installment_number && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                                  Parcela {(e as any).installment_number}/{e.installments_count}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-400 flex items-center gap-1 mt-1">
                              <Calendar size={12} /> Compra em {new Date(e.date).toLocaleDateString()} | {e.installments_count}x de {formatMoney((e.total_value || 0) / e.installments_count)}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-slate-200 text-sm">{formatMoney(itemValue)}</p>
                            {e.installments_count > 1 && (
                              <p className="text-[10px] text-slate-400">Total da compra: {formatMoney(e.total_value)}</p>
                            )}
                          </div>
                        </div>

                        {/* Parcelas */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-2 border-t border-slate-800/60">
                          {e.installments && e.installments.map((inst) => (
                            <div 
                              key={inst.id}
                              onClick={() => handleToggleInstallmentStatus(inst.id, inst.status)}
                              className={`p-2 rounded border text-left cursor-pointer transition flex items-center justify-between ${
                                inst.status === 'PAID'
                                  ? 'bg-emerald-500/5 border-emerald-500/20 text-slate-400'
                                  : 'bg-slate-900 border-slate-800 text-white hover:border-slate-700'
                              }`}
                            >
                              <div>
                                <p className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
                                  Parcela {inst.installment_number}/{e.installments_count}
                                </p>
                                <p className="text-xs font-bold mt-0.5">{formatMoney(inst.value)}</p>
                                <p className="text-[9px] text-slate-400 mt-0.5">{inst.invoice_month}</p>
                              </div>
                              {inst.status === 'PAID' ? (
                                <CheckCircle size={14} className="text-emerald-400" />
                              ) : (
                                <Clock size={14} className="text-amber-400" />
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}

                  {expenses.length === 0 && (
                    <div className="text-center py-8 text-slate-500 text-sm">
                      Sem lançamentos nesta fatura.
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="text-center py-20 text-slate-500 text-sm">
              Selecione ou crie um cartão de crédito na barra lateral para começar a gerenciar.
            </div>
          )}
        </div>
      </div>

      {/* MODAL: Adicionar Cartão */}
      {showAddCard && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface-card border border-slate-800 rounded-xl w-full max-w-md p-6 relative shadow-2xl">
            <button 
              onClick={() => setShowAddCard(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X size={18} />
            </button>
            <h3 className="text-lg font-bold text-white mb-4">Adicionar Cartão de Crédito</h3>
            <form onSubmit={handleCreateCard} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Nome do Cartão</label>
                <input 
                  type="text" 
                  value={cardForm.name} 
                  onChange={(e) => setCardForm({ ...cardForm, name: e.target.value })}
                  placeholder="Ex: Nubank, Inter, XP" 
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-slate-200 focus:outline-none focus:border-indigo-500 text-sm"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Limite Total (R$)</label>
                <input 
                  type="number" 
                  step="0.01"
                  value={cardForm.limit} 
                  onChange={(e) => setCardForm({ ...cardForm, limit: e.target.value })}
                  placeholder="Ex: 5000" 
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-slate-200 focus:outline-none focus:border-indigo-500 text-sm"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Dia Fechamento</label>
                  <input 
                    type="number" 
                    min="1" 
                    max="31"
                    value={cardForm.closing_day} 
                    onChange={(e) => setCardForm({ ...cardForm, closing_day: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-slate-200 focus:outline-none focus:border-indigo-500 text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Dia Vencimento</label>
                  <input 
                    type="number" 
                    min="1" 
                    max="31"
                    value={cardForm.due_day} 
                    onChange={(e) => setCardForm({ ...cardForm, due_day: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-slate-200 focus:outline-none focus:border-indigo-500 text-sm"
                    required
                  />
                </div>
              </div>

              <button 
                type="submit" 
                className="w-full bg-indigo-500 hover:bg-indigo-600 text-white font-semibold py-2 rounded-lg text-sm transition mt-2"
              >
                Cadastrar Cartão
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Registrar Despesa */}
      {showAddExpense && selectedCard && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface-card border border-slate-800 rounded-xl w-full max-w-md p-6 relative shadow-2xl">
            <button 
              onClick={() => setShowAddExpense(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X size={18} />
            </button>
            <h3 className="text-lg font-bold text-white mb-4">Registrar Despesa em {selectedCard.name}</h3>
            <form onSubmit={handleCreateExpense} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Descrição</label>
                <input 
                  type="text" 
                  value={expenseForm.description} 
                  onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
                  placeholder="Ex: Assinatura Netflix, Supermercado" 
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-slate-200 focus:outline-none focus:border-indigo-500 text-sm"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Valor Total (R$)</label>
                  <input 
                    type="number" 
                    step="0.01"
                    value={expenseForm.total_value} 
                    onChange={(e) => setExpenseForm({ ...expenseForm, total_value: e.target.value })}
                    placeholder="Ex: 150" 
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-slate-200 focus:outline-none focus:border-indigo-500 text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Qtd Parcelas</label>
                  <input 
                    type="number" 
                    min="1"
                    value={expenseForm.installments_count} 
                    onChange={(e) => setExpenseForm({ ...expenseForm, installments_count: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-slate-200 focus:outline-none focus:border-indigo-500 text-sm"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Data da Compra</label>
                <input 
                  type="date" 
                  value={expenseForm.date} 
                  onChange={(e) => setExpenseForm({ ...expenseForm, date: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-slate-200 focus:outline-none focus:border-indigo-500 text-sm"
                />
              </div>

              <button 
                type="submit" 
                className="w-full bg-indigo-500 hover:bg-indigo-600 text-white font-semibold py-2 rounded-lg text-sm transition mt-2"
              >
                Registrar Despesa
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Importação de Relatório / Extrato */}
      <StatementImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        cards={cards}
        preSelectedCardId={selectedCard?.id || null}
        onSuccess={() => {
          setShowImportModal(false);
          loadAllData();
          if (selectedCard) {
            loadCardInvoicesAndExpenses(selectedCard.id, selectedInvoiceMonth || undefined);
          }
        }}
      />
    </div>
  );
}
