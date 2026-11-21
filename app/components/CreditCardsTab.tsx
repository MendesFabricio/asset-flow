'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { 
  Plus, CheckCircle, Calendar, X, 
  FileText,
  Clock
} from 'lucide-react';
import { formatMoney } from '../lib/format';
import { CHART_PALETTE_SERIES } from '../lib/colors';
import { CreditCardInstallmentItem, CreditCardsDashboardData } from '../types';
import { usePrivacy } from '../context/PrivacyContext';
import { apiCall } from '../lib/api';
import { StatementImportModal } from './StatementImportModal';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { CreditCardKpiCards } from './credit-cards/CreditCardKpiCards';
import { CreditCardSidebar } from './credit-cards/CreditCardSidebar';
import { CreditCardCategoryChart } from './credit-cards/CreditCardCategoryChart';

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
  value?: number;
  installment_number?: number;
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
  if (d.includes('IFOOD') || d.includes('RAPPI') || d.includes('DELIVERY') || d.includes('COFFEE') || d.includes('RESTAURANTE') || d.includes('PADARIA') || d.includes('BURGER') || d.includes('SUSHI') || d.includes('PIZZA') || d.includes('CAFE') || d.includes('CAFÉ') || d.includes('LANCHE') || d.includes('MERCADO') || d.includes('SUPERMERCADO') || d.includes('ASSAI') || d.includes('CARREFOUR') || d.includes('ATACADAO') || d.includes('HORTIFRUTI') || d.includes('BAR') || d.includes('CHURRASCARIA') || d.includes('GIRAFFAS') || d.includes('HABIBS')) {
    return 'Alimentação';
  }
  if (d.includes('UBER') || d.includes('99') || d.includes('INDRIVE') || d.includes('POSTO') || d.includes('SHELL') || d.includes('IPIRANGA') || d.includes('PETROBRAS') || d.includes('ESTACIONAMENTO') || d.includes('SEM PARAR') || d.includes('VELOE') || d.includes('METRO') || d.includes('ONIBUS') || d.includes('GASOLINA') || d.includes('ETANOL')) {
    return 'Transporte';
  }
  if (d.includes('DROGARIA') || d.includes('FARMACIA') || d.includes('FARMÁCIA') || d.includes('PACHECO') || d.includes('RAIA') || d.includes('DROGASIL') || d.includes('PAGUE MENOS') || d.includes('ULTRAFARMA') || d.includes('CONSULTA') || d.includes('MEDICO') || d.includes('HOSPITAL') || d.includes('CLINICA') || d.includes('EXAME') || d.includes('ODONTO') || d.includes('LABORATORIO')) {
    return 'Saúde/Farmácia';
  }
  if (d.includes('CINEMA') || d.includes('INGRESSO') || d.includes('SHOW') || d.includes('SYMPLA') || d.includes('EVENTO') || d.includes('NETFLIX') || d.includes('SPOTIFY') || d.includes('STEAM') || d.includes('PLAYSTATION') || d.includes('XBOX') || d.includes('DISNEY') || d.includes('HBO') || d.includes('GLOBOPLAY') || d.includes('GYMPASS') || d.includes('SMART FIT')) {
    return 'Lazer/Assinaturas';
  }
  if (d.includes('AMAZON') || d.includes('MERCADOLIVRE') || d.includes('MERCADO LIVRE') || d.includes('SHOPEE') || d.includes('SHEIN') || d.includes('MAGAZINE') || d.includes('MAGALU') || d.includes('CASAS BAHIA') || d.includes('ZARA') || d.includes('RENNER') || d.includes('RIACHUELO') || d.includes('CENTAURO') || d.includes('NETSHOES') || d.includes('KABUM')) {
    return 'Compras/Varejo';
  }
  if (d.includes('ENEL') || d.includes('SABESP') || d.includes('CEMIG') || d.includes('CPFL') || d.includes('COMGAS') || d.includes('VIVO') || d.includes('CLARO') || d.includes('TIM') || d.includes('ALUGUEL') || d.includes('CONDOMINIO') || d.includes('IPTU') || d.includes('IPVA')) {
    return 'Serviços/Utilitários';
  }
  if (d.includes('FATURA') || d.includes('PAGAMENTO DE FATURA')) {
    return 'Fatura/Cartão';
  }
  return 'Outros';
};

export function CreditCardsTab() {
  const { isHidden } = usePrivacy();
  const money = (v: number) => (isHidden ? 'R$ •••••' : formatMoney(v));
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
  const [deleteCardId, setDeleteCardId] = useState<number | null>(null);

  // Forms
  const [cardForm, setCardForm] = useState({ name: '', limit: '', closing_day: '5', due_day: '15' });
  const [expenseForm, setExpenseForm] = useState({ description: '', total_value: '', installments_count: '1', date: '' });

  const loadAllData = useCallback(async () => {
    try {
      const dataCards = await apiCall<CardItem[]>('/api/credit-cards');
      setCards(dataCards);
      setSelectedCard((prev) => (dataCards.length > 0 && !prev ? dataCards[0] : prev));

      const dataDash = await apiCall<CreditCardsDashboardData>('/api/credit-cards/dashboard');
      setDashboard(dataDash);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const loadExpensesByMonth = useCallback(async (cardId: number, month: string) => {
    try {
      const data = await apiCall<{ items: ExpenseItem[] }>(`/api/credit-cards/${cardId}/expenses?invoice_month=${month}`);
      setExpenses(data.items || []);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const loadCardInvoicesAndExpenses = useCallback(async (cardId: number, monthToSelect?: string) => {
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
  }, [loadExpensesByMonth]);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  useEffect(() => {
    if (selectedCard) {
      loadCardInvoicesAndExpenses(selectedCard.id);
    } else {
      setCardInvoices([]);
      setExpenses([]);
      setSelectedInvoiceMonth('');
    }
  }, [selectedCard, loadCardInvoicesAndExpenses]);

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
    try {
      await apiCall(`/api/credit-cards/${cardId}`, {
        method: 'DELETE'
      });
      setSelectedCard(null);
      loadAllData();
    } catch (e) {
      console.error(e);
    } finally {
      setDeleteCardId(null);
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
    const itemValue = Number(e.value !== undefined ? e.value : e.total_value || 0);
    categoryTotals[cat] = (categoryTotals[cat] || 0) + itemValue;
  });
  const chartData = Object.entries(categoryTotals).map(([name, value]) => ({
    name,
    value
  }));
  const COLORS = CHART_PALETTE_SERIES;

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
      <CreditCardKpiCards
        displayLimitLabel={displayLimitLabel}
        displayLimit={displayLimit}
        displaySpentLabel={displaySpentLabel}
        displaySpent={displaySpent}
        displayPendingLabel={displayPendingLabel}
        displayPending={displayPending}
      />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar Cartões */}
        <div className="lg:col-span-1 space-y-4">
          <CreditCardSidebar
            cards={cards}
            selectedCard={selectedCard}
            onSelectCard={setSelectedCard}
            onDeleteCard={(id) => setDeleteCardId(id)}
            onOpenAddCard={() => setShowAddCard(true)}
            onOpenImport={() => setShowImportModal(true)}
          />

          {/* Faturas Mensais */}
          <div className="bg-surface-card border border-border-subtle rounded-xl p-4 shadow-sm space-y-3">
            <h4 className="text-sm font-semibold text-text-primary uppercase tracking-wider flex items-center justify-between">
              <span>Histórico de Faturas</span>
              {selectedCard && <span className="text-2xs font-normal text-text-muted">{selectedCard.name}</span>}
            </h4>
            <div className="space-y-2 max-h-[220px] overflow-y-auto custom-scrollbar">
              {selectedCard ? (
                cardInvoices.map((f) => {
                  const isSelected = selectedInvoiceMonth === f.invoice_month;
                  return (
                    <button 
                      key={f.invoice_month} 
                      type="button"
                      onClick={() => {
                        setSelectedInvoiceMonth(f.invoice_month);
                        loadExpensesByMonth(selectedCard.id, f.invoice_month);
                      }}
                      className={`w-full p-2.5 rounded-lg border flex justify-between items-center cursor-pointer transition-colors ${
                        isSelected 
                          ? 'bg-accent-soft border-accent' 
                          : 'bg-surface-elevated border-border-subtle hover:border-accent/40'
                      }`}
                    >
                      <div className="text-left">
                        <p className={`text-xs font-semibold ${isSelected ? 'text-accent' : 'text-text-primary'}`}>
                          {formatInvoiceMonthLabel(f.invoice_month)}
                        </p>
                        <p className="text-2xs text-text-muted mt-0.5 tabular-nums">Total: {money(f.total)}</p>
                      </div>
                      <span className={`text-2xs px-2 py-0.5 rounded-md font-semibold ${
                        f.status === 'PAID' ? 'bg-status-success/10 text-status-success border border-status-success/20' :
                        f.status === 'PARTIAL' ? 'bg-status-warning/10 text-status-warning border border-status-warning/20' :
                        f.total === 0 ? 'bg-surface-input text-text-muted border border-border-subtle' :
                        'bg-status-error/10 text-status-error border border-status-error/20'
                      }`}>
                        {f.status === 'PAID' ? 'Paga' : f.status === 'PARTIAL' ? 'Parcial' : f.total === 0 ? 'Zerada' : 'Aberta'}
                      </span>
                    </button>
                  );
                })
              ) : (
                dashboard?.faturas.map((f) => (
                  <div key={f.invoice_month} className="p-2 rounded-lg bg-surface-elevated border border-border-subtle flex justify-between items-center">
                    <div>
                      <p className="text-xs font-semibold text-text-primary">{formatInvoiceMonthLabel(f.invoice_month)}</p>
                      <p className="text-xs text-text-muted tabular-nums">Total: {money(f.total)}</p>
                    </div>
                    <span className={`text-2xs px-2 py-0.5 rounded-md font-semibold ${
                      f.status === 'PAID' ? 'bg-status-success/10 text-status-success border border-status-success/20' :
                      f.status === 'PARTIAL' ? 'bg-status-warning/10 text-status-warning border border-status-warning/20' :
                      'bg-status-error/10 text-status-error border border-status-error/20'
                    }`}>
                      {f.status === 'PAID' ? 'Paga' : f.status === 'PARTIAL' ? 'Parcial' : 'Aberta'}
                    </span>
                  </div>
                ))
              )}

              {selectedCard && cardInvoices.length === 0 && (
                <p className="text-xs text-text-muted text-center py-4">Nenhuma fatura encontrada para este cartão.</p>
              )}
              {!selectedCard && (!dashboard?.faturas || dashboard.faturas.length === 0) && (
                <p className="text-xs text-text-muted text-center py-4">Sem faturas lançadas.</p>
              )}
            </div>
          </div>
        </div>

        {/* Detalhes do Cartão Selecionado */}
        <div className="lg:col-span-3 bg-surface-card border border-border-subtle rounded-xl p-5 shadow-sm space-y-5">
          {selectedCard ? (
            <>
              <div className="flex justify-between items-center border-b border-border-subtle pb-4">
                <div>
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <h3 className="text-lg font-semibold text-text-primary">{selectedCard.name}</h3>
                    {selectedInvoiceMonth && (
                      <span className="text-xs font-semibold text-accent bg-accent-soft border border-accent/30 px-2.5 py-0.5 rounded-md flex items-center gap-1">
                        <Calendar size={12} /> Fatura de {formatInvoiceMonthLabel(selectedInvoiceMonth)}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-text-muted mt-1">
                    Fechamento: Dia {selectedCard.closing_day} | Vencimento: Dia {selectedCard.due_day}
                    {(() => {
                      const invSummary = cardInvoices.find(i => i.invoice_month === selectedInvoiceMonth);
                      return invSummary ? (
                        <span className="ml-2 pl-2 border-l border-border-subtle text-text-primary tabular-nums">
                          Total da Fatura: <strong className={invSummary.total === 0 ? 'text-text-muted' : 'text-status-error font-semibold'}>{money(invSummary.total)}</strong>
                        </span>
                      ) : null;
                    })()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowImportModal(true)}
                    className="flex items-center gap-1.5 bg-accent hover:bg-accent/90 text-white text-xs font-semibold px-3.5 py-1.5 rounded-lg transition-colors"
                  >
                    <FileText size={14} /> Importar Relatório
                  </button>
                  <button
                    onClick={() => setShowAddExpense(true)}
                    className="flex items-center gap-1 bg-surface-input hover:bg-surface-elevated border border-border-subtle text-text-primary text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
                  >
                    <Plus size={14} /> Registrar Despesa
                  </button>
                </div>
              </div>

              {/* Gráfico de Pizza por Categoria */}
              {expenses.length > 0 ? (
                <CreditCardCategoryChart chartData={chartData} colors={COLORS} />
              ) : selectedInvoiceMonth ? (
                <div className="bg-surface-elevated border border-border-subtle rounded-xl p-6 text-center my-2">
                  <div className="w-10 h-10 rounded-lg bg-surface-input text-text-muted flex items-center justify-center mx-auto mb-2">
                    <Calendar size={20} />
                  </div>
                  <h4 className="text-sm font-semibold text-text-primary">Fatura de {formatInvoiceMonthLabel(selectedInvoiceMonth)} Zerada</h4>
                  <p className="text-xs text-text-muted mt-1 max-w-md mx-auto">
                    No momento não existem novas despesas importadas ou parcelas de meses anteriores com vencimento nesta competência para o cartão {selectedCard.name}.
                  </p>
                </div>
              ) : null}

              {/* Lista de Despesas */}
              <div className="space-y-4">
                <h4 className="text-sm font-semibold text-text-primary uppercase tracking-wider flex items-center justify-between">
                  <span>Lançamentos da Fatura ({formatInvoiceMonthLabel(selectedInvoiceMonth)})</span>
                  <span className="text-xs font-normal text-text-muted tabular-nums">{expenses.length} item(ns)</span>
                </h4>
                <div className="space-y-3 overflow-y-auto max-h-[500px] custom-scrollbar pr-2">
                  {expenses.map((e) => {
                    const itemValue = Number(e.value !== undefined ? e.value : e.total_value || 0);
                    return (
                      <div key={e.id} className="p-4 rounded-xl bg-surface-elevated border border-border-subtle space-y-3">
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-semibold text-sm text-text-primary">{e.description}</p>
                              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-2xs font-medium bg-surface-input text-accent border border-border-subtle">
                                {getCategoryFromDescription(e.description)}
                              </span>
                              {e.installments_count > 1 && e.installment_number && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-2xs font-semibold bg-accent-soft text-accent border border-accent/20 tabular-nums">
                                  Parcela {e.installment_number}/{e.installments_count}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-text-muted flex items-center gap-1 mt-1 tabular-nums">
                              <Calendar size={12} /> Compra em {new Date(e.date).toLocaleDateString()} | {e.installments_count}x de {money((e.total_value || 0) / e.installments_count)}
                            </p>
                          </div>
                          <div className="text-right tabular-nums">
                            <p className="font-semibold text-text-primary text-sm">{money(itemValue)}</p>
                            {e.installments_count > 1 && (
                              <p className="text-2xs text-text-muted">Total da compra: {money(e.total_value)}</p>
                            )}
                          </div>
                        </div>

                        {/* Parcelas */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-2 border-t border-border-subtle">
                          {e.installments && e.installments.map((inst) => (
                            <button 
                              key={inst.id}
                              type="button"
                              onClick={() => handleToggleInstallmentStatus(inst.id, inst.status)}
                              className={`p-2 rounded-lg border text-left cursor-pointer transition-colors flex items-center justify-between ${
                                inst.status === 'PAID'
                                  ? 'bg-status-success/10 border-status-success/20 text-text-muted'
                                  : 'bg-surface-card border-border-subtle text-text-primary hover:border-accent/40'
                              }`}
                            >
                              <div>
                                <p className="text-2xs font-semibold tracking-wider text-text-muted uppercase tabular-nums">
                                  Parcela {inst.installment_number}/{e.installments_count}
                                </p>
                                <p className="text-xs font-semibold mt-0.5 tabular-nums">{money(inst.value)}</p>
                                <p className="text-2xs text-text-muted mt-0.5 tabular-nums">{inst.invoice_month}</p>
                              </div>
                              {inst.status === 'PAID' ? (
                                <CheckCircle size={14} className="text-status-success" />
                              ) : (
                                <Clock size={14} className="text-status-warning" />
                              )}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}

                  {expenses.length === 0 && (
                    <div className="text-center py-8 text-text-muted text-sm">
                      Sem lançamentos nesta fatura.
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="text-center py-20 text-text-muted text-sm">
              Selecione ou crie um cartão de crédito na barra lateral para começar a gerenciar.
            </div>
          )}
        </div>
      </div>

      {/* MODAL: Adicionar Cartão */}
      {showAddCard && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface-card border border-border-subtle rounded-xl w-full max-w-md p-6 relative shadow-lg">
            <button 
              onClick={() => setShowAddCard(false)}
              className="absolute top-4 right-4 text-text-muted hover:text-text-primary"
            >
              <X size={18} />
            </button>
            <h3 className="text-lg font-semibold text-text-primary mb-4">Adicionar Cartão de Crédito</h3>
            <form onSubmit={handleCreateCard} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1">Nome do Cartão</label>
                <input 
                  type="text" 
                  value={cardForm.name} 
                  onChange={(e) => setCardForm({ ...cardForm, name: e.target.value })}
                  placeholder="Ex: Nubank, Inter, XP" 
                  className="w-full bg-surface-input border border-border-subtle rounded-lg p-2 text-text-primary focus:outline-none focus:border-accent text-sm"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1">Limite Total (R$)</label>
                <input 
                  type="number" 
                  step="0.01"
                  value={cardForm.limit} 
                  onChange={(e) => setCardForm({ ...cardForm, limit: e.target.value })}
                  placeholder="Ex: 5000" 
                  className="w-full bg-surface-input border border-border-subtle rounded-lg p-2 text-text-primary focus:outline-none focus:border-accent text-sm"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1">Dia Fechamento</label>
                  <input 
                    type="number" 
                    min="1" 
                    max="31"
                    value={cardForm.closing_day} 
                    onChange={(e) => setCardForm({ ...cardForm, closing_day: e.target.value })}
                    className="w-full bg-surface-input border border-border-subtle rounded-lg p-2 text-text-primary focus:outline-none focus:border-accent text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1">Dia Vencimento</label>
                  <input 
                    type="number" 
                    min="1" 
                    max="31"
                    value={cardForm.due_day} 
                    onChange={(e) => setCardForm({ ...cardForm, due_day: e.target.value })}
                    className="w-full bg-surface-input border border-border-subtle rounded-lg p-2 text-text-primary focus:outline-none focus:border-accent text-sm"
                    required
                  />
                </div>
              </div>

              <button 
                type="submit" 
                className="w-full bg-accent hover:bg-accent/90 text-white font-semibold py-2 rounded-lg text-sm transition-colors mt-2"
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
          <div className="bg-surface-card border border-border-subtle rounded-xl w-full max-w-md p-6 relative shadow-lg">
            <button 
              onClick={() => setShowAddExpense(false)}
              className="absolute top-4 right-4 text-text-muted hover:text-text-primary"
            >
              <X size={18} />
            </button>
            <h3 className="text-lg font-semibold text-text-primary mb-4">Registrar Despesa em {selectedCard.name}</h3>
            <form onSubmit={handleCreateExpense} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1">Descrição</label>
                <input 
                  type="text" 
                  value={expenseForm.description} 
                  onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
                  placeholder="Ex: Assinatura Netflix, Supermercado" 
                  className="w-full bg-surface-input border border-border-subtle rounded-lg p-2 text-text-primary focus:outline-none focus:border-accent text-sm"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1">Valor Total (R$)</label>
                  <input 
                    type="number" 
                    step="0.01"
                    value={expenseForm.total_value} 
                    onChange={(e) => setExpenseForm({ ...expenseForm, total_value: e.target.value })}
                    placeholder="Ex: 150" 
                    className="w-full bg-surface-input border border-border-subtle rounded-lg p-2 text-text-primary focus:outline-none focus:border-accent text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1">Qtd Parcelas</label>
                  <input 
                    type="number" 
                    min="1"
                    value={expenseForm.installments_count} 
                    onChange={(e) => setExpenseForm({ ...expenseForm, installments_count: e.target.value })}
                    className="w-full bg-surface-input border border-border-subtle rounded-lg p-2 text-text-primary focus:outline-none focus:border-accent text-sm"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1">Data da Compra</label>
                <input 
                  type="date" 
                  value={expenseForm.date} 
                  onChange={(e) => setExpenseForm({ ...expenseForm, date: e.target.value })}
                  className="w-full bg-surface-input border border-border-subtle rounded-lg p-2 text-text-primary focus:outline-none focus:border-accent text-sm"
                />
              </div>

              <button 
                type="submit" 
                className="w-full bg-accent hover:bg-accent/90 text-white font-semibold py-2 rounded-lg text-sm transition-colors mt-2"
              >
                Registrar Despesa
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Importação de Relatório / Extrato */}
      <ErrorBoundary>
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
      </ErrorBoundary>

      <ConfirmDialog
        isOpen={deleteCardId !== null}
        title="Excluir Cartão"
        message="Deseja excluir este cartão e todas as despesas associadas permanentemente?"
        confirmLabel="Excluir"
        onConfirm={() => deleteCardId !== null && handleDeleteCard(deleteCardId)}
        onCancel={() => setDeleteCardId(null)}
      />
    </div>
  );
}
