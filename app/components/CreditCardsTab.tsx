'use client';

import React, { useState, useEffect } from 'react';
import { 
  Plus, CheckCircle, CreditCard, Calendar, Trash2, X, Wallet, 
  TrendingUp, AlertCircle, DollarSign, FileText,
  Clock, CheckSquare
} from 'lucide-react';
import { formatMoney } from '../utils';

interface CardItem {
  id: number;
  name: string;
  limit: number;
  closing_day: number;
  due_day: number;
}

interface InstallmentItem {
  id: number;
  installment_number: number;
  value: number;
  due_date: string;
  status: string; // PENDING, PAID
  invoice_month: string;
}

interface ExpenseItem {
  id: number;
  description: string;
  total_value: number;
  installments_count: number;
  date: string;
  installments: InstallmentItem[];
}

interface DashboardData {
  total_limit: number;
  total_spent: number;
  total_pending: number;
  faturas: Array<{
    invoice_month: string;
    total: number;
    pending: number;
    paid: number;
    status: 'PAID' | 'PARTIAL' | 'PENDING';
  }>;
}

export default function CreditCardsTab() {
  const [cards, setCards] = useState<CardItem[]>([]);
  const [selectedCard, setSelectedCard] = useState<CardItem | null>(null);
  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  
  // Modais
  const [showAddCard, setShowAddCard] = useState(false);
  const [showAddExpense, setShowAddExpense] = useState(false);

  // Forms
  const [cardForm, setCardForm] = useState({ name: '', limit: '', closing_day: '5', due_day: '15' });
  const [expenseForm, setExpenseForm] = useState({ description: '', total_value: '', installments_count: '1', date: '' });

  const loadAllData = async () => {
    try {
      const resCards = await fetch('/api/credit-cards');
      const dataCards = await resCards.json();
      setCards(dataCards);
      if (dataCards.length > 0 && !selectedCard) {
        setSelectedCard(dataCards[0]);
      }

      const resDash = await fetch('/api/credit-cards/dashboard');
      const dataDash = await resDash.json();
      setDashboard(dataDash);
    } catch (e) {
      console.error(e);
    }
  };

  const loadExpenses = async (cardId: number) => {
    try {
      const res = await fetch(`/api/credit-cards/${cardId}/expenses`);
      const data = await res.json();
      setExpenses(data);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadAllData();
  }, []);

  useEffect(() => {
    if (selectedCard) {
      loadExpenses(selectedCard.id);
    } else {
      setExpenses([]);
    }
  }, [selectedCard]);

  const handleCreateCard = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/credit-cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cardForm)
      });
      if (res.ok) {
        setCardForm({ name: '', limit: '', closing_day: '5', due_day: '15' });
        setShowAddCard(false);
        loadAllData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCard) return;
    try {
      const res = await fetch(`/api/credit-cards/${selectedCard.id}/expenses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...expenseForm,
          date: expenseForm.date || new Date().toISOString()
        })
      });
      if (res.ok) {
        setExpenseForm({ description: '', total_value: '', installments_count: '1', date: '' });
        setShowAddExpense(false);
        loadAllData();
        loadExpenses(selectedCard.id);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteCard = async (cardId: number) => {
    if (!confirm('Deseja excluir este cartão e todas as despesas associadas?')) return;
    try {
      const res = await fetch(`/api/credit-cards/${cardId}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        setSelectedCard(null);
        loadAllData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleToggleInstallmentStatus = async (installmentId: number, currentStatus: string) => {
    const nextStatus = currentStatus === 'PAID' ? 'PENDING' : 'PAID';
    try {
      const res = await fetch(`/api/credit-cards/installments/${installmentId}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus })
      });
      if (res.ok) {
        loadAllData();
        if (selectedCard) loadExpenses(selectedCard.id);
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-5 relative overflow-hidden shadow-lg">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs text-slate-400 font-semibold tracking-wider uppercase">Limite Total</p>
              <h3 className="text-2xl font-bold text-white mt-1">{formatMoney(dashboard?.total_limit || 0)}</h3>
            </div>
            <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-lg">
              <CreditCard size={18} />
            </div>
          </div>
        </div>

        <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-5 relative overflow-hidden shadow-lg">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs text-slate-400 font-semibold tracking-wider uppercase">Total Gasto</p>
              <h3 className="text-2xl font-bold text-rose-400 mt-1">{formatMoney(dashboard?.total_spent || 0)}</h3>
            </div>
            <div className="p-2 bg-rose-500/10 text-rose-400 rounded-lg">
              <DollarSign size={18} />
            </div>
          </div>
        </div>

        <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-5 relative overflow-hidden shadow-lg">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs text-slate-400 font-semibold tracking-wider uppercase">Faturas Pendentes</p>
              <h3 className="text-2xl font-bold text-amber-400 mt-1">{formatMoney(dashboard?.total_pending || 0)}</h3>
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
          <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-4 shadow-lg space-y-4">
            <div className="flex justify-between items-center">
              <h4 className="text-sm font-bold text-white uppercase tracking-wider">Meus Cartões</h4>
              <button 
                onClick={() => setShowAddCard(true)}
                className="p-1 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg transition"
              >
                <Plus size={16} />
              </button>
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

              {cards.length === 0 && (
                <p className="text-xs text-slate-400 text-center py-4">Nenhum cartão cadastrado.</p>
              )}
            </div>
          </div>

          {/* Faturas Mensais */}
          <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-4 shadow-lg space-y-3">
            <h4 className="text-sm font-bold text-white uppercase tracking-wider">Histórico de Faturas</h4>
            <div className="space-y-2 max-h-[220px] overflow-y-auto custom-scrollbar">
              {dashboard?.faturas.map((f) => (
                <div key={f.invoice_month} className="p-2 rounded bg-slate-900/60 border border-slate-800 flex justify-between items-center">
                  <div>
                    <p className="text-xs font-semibold text-slate-300">{f.invoice_month}</p>
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
              ))}

              {(!dashboard?.faturas || dashboard.faturas.length === 0) && (
                <p className="text-xs text-slate-500 text-center py-4">Sem faturas lançadas.</p>
              )}
            </div>
          </div>
        </div>

        {/* Detalhes do Cartão Selecionado */}
        <div className="lg:col-span-3 bg-[#0f172a] border border-[#1e293b] rounded-xl p-5 shadow-lg space-y-5">
          {selectedCard ? (
            <>
              <div className="flex justify-between items-center border-b border-slate-800 pb-4">
                <div>
                  <h3 className="text-lg font-bold text-white">{selectedCard.name}</h3>
                  <p className="text-xs text-slate-400">
                    Fechamento: Dia {selectedCard.closing_day} | Vencimento: Dia {selectedCard.due_day}
                  </p>
                </div>
                <button
                  onClick={() => setShowAddExpense(true)}
                  className="flex items-center gap-1 bg-indigo-500 hover:bg-indigo-600 text-white text-xs px-3 py-1.5 rounded-lg transition"
                >
                  <Plus size={14} /> Registrar Despesa
                </button>
              </div>

              {/* Lista de Despesas */}
              <div className="space-y-4">
                <h4 className="text-sm font-bold text-white uppercase tracking-wider">Histórico de Lançamentos</h4>
                <div className="space-y-3 overflow-y-auto max-h-[500px] custom-scrollbar pr-2">
                  {expenses.map((e) => (
                    <div key={e.id} className="p-4 rounded-lg bg-slate-900/50 border border-slate-800 space-y-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-semibold text-sm text-white">{e.description}</p>
                          <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                            <Calendar size={12} /> {new Date(e.date).toLocaleDateString()} | {e.installments_count}x
                          </p>
                        </div>
                        <p className="font-bold text-slate-200 text-sm">{formatMoney(e.total_value)}</p>
                      </div>

                      {/* Parcelas */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-2 border-t border-slate-800/60">
                        {e.installments.map((inst) => (
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
                  ))}

                  {expenses.length === 0 && (
                    <div className="text-center py-10 text-slate-500 text-sm">
                      Nenhum lançamento neste cartão. Comece cadastrando uma nova despesa acima.
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
          <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl w-full max-w-md p-6 relative shadow-2xl">
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
          <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl w-full max-w-md p-6 relative shadow-2xl">
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
    </div>
  );
}
