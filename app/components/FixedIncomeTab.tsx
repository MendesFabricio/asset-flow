'use client';

import React, { useState, useEffect } from 'react';
import { 
  Plus, Landmark, Trash2, X, 
  TrendingUp, ArrowUpRight, ShieldCheck
} from 'lucide-react';
import { formatMoney } from '../lib/format';
import { apiCall } from '../lib/api';
import { usePrivacy } from '../context/PrivacyContext';
import { ConfirmDialog } from './ui/ConfirmDialog';

interface FixedIncomeItem {
  id: number;
  ticker: string;
  name: string;
  index_type: 'CDI' | 'IPCA' | 'PRE';
  interest_rate: number;
  issue_date: string;
  due_date: string;
  quantity: number;
  average_price: number;
  days_elapsed: number;
  total_days: number;
  tax_rate: number;
  total_invested: number;
  gross_value: number;
  gross_profit: number;
  tax_value: number;
  net_value: number;
  net_profit: number;
}

export function FixedIncomeTab() {
  const { isHidden } = usePrivacy();
  const money = (v: number) => (isHidden ? 'R$ •••••' : formatMoney(v));
  const [titles, setTitles] = useState<FixedIncomeItem[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [form, setForm] = useState({
    ticker: '',
    name: '',
    index_type: 'CDI',
    interest_rate: '',
    quantity: '1',
    average_price: '',
    issue_date: '',
    due_date: ''
  });

  const loadData = async () => {
    try {
      const data = await apiCall<FixedIncomeItem[]>('/api/fixed-income');
      setTitles(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      setTitles([]);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiCall('/api/fixed-income', {
        method: 'POST',
        body: JSON.stringify(form)
      });
      setForm({
        ticker: '',
        name: '',
        index_type: 'CDI',
        interest_rate: '',
        quantity: '1',
        average_price: '',
        issue_date: '',
        due_date: ''
      });
      setShowAddModal(false);
      loadData();
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await apiCall(`/api/fixed-income/${id}`, {
        method: 'DELETE'
      });
      loadData();
    } catch (e) {
      console.error(e);
    } finally {
      setDeleteId(null);
    }
  };

  // Aggregates
  const totalInvested = titles.reduce((acc, curr) => acc + curr.total_invested, 0);
  const totalGross = titles.reduce((acc, curr) => acc + curr.gross_value, 0);
  const totalNet = titles.reduce((acc, curr) => acc + curr.net_value, 0);
  const totalProfit = titles.reduce((acc, curr) => acc + curr.net_profit, 0);

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-surface-card border border-border-subtle rounded-xl p-5 shadow-sm">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs text-text-muted font-semibold tracking-wider uppercase">Total Aplicado</p>
              <h3 className="text-2xl font-semibold text-text-primary mt-1 tabular-nums">{money(totalInvested)}</h3>
            </div>
            <div className="p-2 bg-accent-soft text-accent rounded-lg">
              <Landmark size={18} />
            </div>
          </div>
        </div>

        <div className="bg-surface-card border border-border-subtle rounded-xl p-5 shadow-sm">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs text-text-muted font-semibold tracking-wider uppercase">Saldo Bruto Atual</p>
              <h3 className="text-2xl font-semibold text-text-primary mt-1 tabular-nums">{money(totalGross)}</h3>
            </div>
            <div className="p-2 bg-surface-input text-text-muted rounded-lg">
              <TrendingUp size={18} />
            </div>
          </div>
        </div>

        <div className="bg-surface-card border border-border-subtle rounded-xl p-5 shadow-sm">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs text-text-muted font-semibold tracking-wider uppercase">Saldo Líquido Est.</p>
              <h3 className="text-2xl font-semibold text-status-success mt-1 tabular-nums">{money(totalNet)}</h3>
            </div>
            <div className="p-2 bg-status-success/10 text-status-success rounded-lg">
              <ShieldCheck size={18} />
            </div>
          </div>
        </div>

        <div className="bg-surface-card border border-border-subtle rounded-xl p-5 shadow-sm">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs text-text-muted font-semibold tracking-wider uppercase">Rendimento Líquido</p>
              <h3 className="text-2xl font-semibold text-accent mt-1 tabular-nums">{isHidden ? money(totalProfit) : `+${money(totalProfit)}`}</h3>
            </div>
            <div className="p-2 bg-accent-soft text-accent rounded-lg">
              <ArrowUpRight size={18} />
            </div>
          </div>
        </div>
      </div>

      {/* Main Container */}
      <div className="bg-surface-card border border-border-subtle rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex justify-between items-center border-b border-border-subtle pb-4">
          <h3 className="text-lg font-semibold text-text-primary uppercase tracking-wider">Meus Títulos de Renda Fixa</h3>
          <button 
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1 bg-accent hover:bg-accent/90 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
          >
            <Plus size={14} /> Adicionar Título
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-text-primary">
            <thead>
              <tr className="border-b border-border-subtle text-text-muted text-xs uppercase tracking-wider">
                <th className="py-3 px-4">Título</th>
                <th className="py-3 px-4">Indexador/Taxa</th>
                <th className="py-3 px-4">Prazos & Progresso</th>
                <th className="py-3 px-4">IR Est.</th>
                <th className="py-3 px-4 text-right">Aplicado</th>
                <th className="py-3 px-4 text-right">Bruto</th>
                <th className="py-3 px-4 text-right">Líquido</th>
                <th className="py-3 px-4 text-center">Ações</th>
              </tr>
            </thead>
            <tbody>
              {titles.map((t) => {
                const progressPct = t.total_days > 0 ? Math.min(100, Math.round((t.days_elapsed / t.total_days) * 100)) : 0;
                
                return (
                  <tr key={t.id} className="border-b border-border-subtle hover:bg-surface-elevated transition-colors">
                    <td className="py-3.5 px-4 font-semibold text-text-primary">
                      <div>
                        <p>{t.ticker}</p>
                        <p className="text-xs text-text-muted font-normal">{t.name}</p>
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="text-xs px-2 py-0.5 rounded-md bg-surface-elevated border border-border-subtle font-semibold text-accent tabular-nums">
                        {t.index_type} {t.interest_rate}% {t.index_type === 'CDI' ? 'CDI' : (t.index_type === 'IPCA' ? '+ IPCA' : 'a.a.')}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 max-w-[200px]">
                      <div className="space-y-1">
                        <div className="flex justify-between text-2xs text-text-muted tabular-nums">
                          <span>{new Date(t.issue_date).toLocaleDateString()}</span>
                          <span>{new Date(t.due_date).toLocaleDateString()}</span>
                        </div>
                        <div className="w-full bg-surface-input h-1.5 rounded-full overflow-hidden">
                          <div className="bg-accent h-full rounded-full" style={{ width: `${progressPct}%` }}></div>
                        </div>
                        <p className="text-2xs text-text-muted text-right tabular-nums">{t.days_elapsed} de {t.total_days} dias ({progressPct}%)</p>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-text-primary tabular-nums">
                      {t.tax_rate}%
                    </td>
                    <td className="py-3.5 px-4 text-right font-semibold tabular-nums">{money(t.total_invested)}</td>
                    <td className="py-3.5 px-4 text-right font-semibold text-text-primary tabular-nums">{money(t.gross_value)}</td>
                    <td className="py-3.5 px-4 text-right font-semibold text-status-success tabular-nums">{money(t.net_value)}</td>
                    <td className="py-3.5 px-4 text-center">
                      <button 
                        onClick={() => setDeleteId(t.id)}
                        className="text-text-muted hover:text-status-error p-1 rounded-lg transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}

              {titles.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center py-10 text-text-muted text-sm">
                    Nenhum título de renda fixa cadastrado. Adicione um novo título clicando no botão acima.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL: Adicionar Título */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface-card border border-border-subtle rounded-xl w-full max-w-md p-6 relative shadow-lg">
            <button 
              onClick={() => setShowAddModal(false)}
              className="absolute top-4 right-4 text-text-muted hover:text-text-primary"
            >
              <X size={18} />
            </button>
            <h3 className="text-lg font-semibold text-text-primary mb-4">Adicionar Título de Renda Fixa</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1">Ticker / Sigla</label>
                <input 
                  type="text" 
                  value={form.ticker} 
                  onChange={(e) => setForm({ ...form, ticker: e.target.value })}
                  placeholder="Ex: CDB_ITAU_2028, TESOURO_IPCA" 
                  className="w-full bg-surface-input border border-border-subtle rounded-lg p-2 text-text-primary focus:outline-none focus:border-accent text-sm"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1">Nome do Título</label>
                <input 
                  type="text" 
                  value={form.name} 
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Ex: CDB Itaú Prefixado 2028" 
                  className="w-full bg-surface-input border border-border-subtle rounded-lg p-2 text-text-primary focus:outline-none focus:border-accent text-sm"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1">Indexador</label>
                  <select 
                    value={form.index_type} 
                    onChange={(e) => setForm({ ...form, index_type: e.target.value })}
                    className="w-full bg-surface-input border border-border-subtle rounded-lg p-2 text-text-primary focus:outline-none focus:border-accent text-sm"
                  >
                    <option value="CDI">CDI</option>
                    <option value="IPCA">IPCA</option>
                    <option value="PRE">PRÉ-FIXADO</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1">Taxa (%)</label>
                  <input 
                    type="number" 
                    step="0.01"
                    value={form.interest_rate} 
                    onChange={(e) => setForm({ ...form, interest_rate: e.target.value })}
                    placeholder="Ex: 110 (CDI) ou 12.5 (PRE)" 
                    className="w-full bg-surface-input border border-border-subtle rounded-lg p-2 text-text-primary focus:outline-none focus:border-accent text-sm"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1">Valor Aplicado (R$)</label>
                  <input 
                    type="number" 
                    step="0.01"
                    value={form.average_price} 
                    onChange={(e) => setForm({ ...form, average_price: e.target.value })}
                    placeholder="Ex: 1000.00" 
                    className="w-full bg-surface-input border border-border-subtle rounded-lg p-2 text-text-primary focus:outline-none focus:border-accent text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1">Quantidade</label>
                  <input 
                    type="number" 
                    step="0.0001"
                    value={form.quantity} 
                    onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                    className="w-full bg-surface-input border border-border-subtle rounded-lg p-2 text-text-primary focus:outline-none focus:border-accent text-sm"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1">Data de Emissão</label>
                  <input 
                    type="date" 
                    value={form.issue_date} 
                    onChange={(e) => setForm({ ...form, issue_date: e.target.value })}
                    className="w-full bg-surface-input border border-border-subtle rounded-lg p-2 text-text-primary focus:outline-none focus:border-accent text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1">Vencimento</label>
                  <input 
                    type="date" 
                    value={form.due_date} 
                    onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                    className="w-full bg-surface-input border border-border-subtle rounded-lg p-2 text-text-primary focus:outline-none focus:border-accent text-sm"
                    required
                  />
                </div>
              </div>

              <button 
                type="submit" 
                className="w-full bg-accent hover:bg-accent/90 text-white font-semibold py-2 rounded-lg text-sm transition-colors mt-2"
              >
                Cadastrar Título
              </button>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={deleteId !== null}
        title="Excluir Título"
        message="Deseja excluir este título de renda fixa permanentemente?"
        confirmLabel="Excluir"
        onConfirm={() => deleteId !== null && handleDelete(deleteId)}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}
