'use client';

import React, { useState, useEffect } from 'react';
import { 
  Plus, Landmark, Trash2, X, 
  TrendingUp, ArrowUpRight, ShieldCheck
} from 'lucide-react';
import { formatMoney } from '@/lib/format';
import { apiCall } from '@/lib/api';
import { usePrivacy } from '@/context/PrivacyContext';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

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
  pricing_mode?: 'TESOURO_MTM' | 'CURVE';
  market_pu?: number | null;
  market_date?: string | null;
}

interface TesouroBondOption {
  ticker: string;
  title_type: string;
  name: string;
  due_date: string;
  price_date: string;
  pu_base: number;
  taxa_compra: number | null;
  taxa_venda: number | null;
  index_type: 'CDI' | 'IPCA' | 'PRE';
  interest_rate: number;
}

export function FixedIncomeTab() {
  const { isHidden } = usePrivacy();
  const money = (v: number) => (isHidden ? 'R$ •••••' : formatMoney(v));
  const [titles, setTitles] = useState<FixedIncomeItem[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [entryMode, setEntryMode] = useState<'MANUAL' | 'TESOURO'>('MANUAL');
  const [tesouroBonds, setTesouroBonds] = useState<TesouroBondOption[]>([]);
  const [tesouroLoading, setTesouroLoading] = useState(false);
  const [tesouroError, setTesouroError] = useState<string | null>(null);
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

  const loadTesouroBonds = async () => {
    if (tesouroBonds.length > 0 || tesouroLoading) return;
    setTesouroLoading(true);
    setTesouroError(null);
    try {
      const data = await apiCall<TesouroBondOption[]>('/api/fixed-income/tesouro-direto');
      setTesouroBonds(Array.isArray(data) ? data : []);
    } catch {
      setTesouroError('Não foi possível carregar os títulos do Tesouro Direto agora.');
    } finally {
      setTesouroLoading(false);
    }
  };

  const handleModeSwitch = (mode: 'MANUAL' | 'TESOURO') => {
    setEntryMode(mode);
    if (mode === 'TESOURO') {
      loadTesouroBonds();
    }
  };

  const handleSelectTesouroBond = (ticker: string) => {
    const bond = tesouroBonds.find((b) => b.ticker === ticker);
    if (!bond) return;
    setForm((prev) => ({
      ...prev,
      ticker: bond.ticker,
      name: bond.name,
      index_type: bond.index_type,
      interest_rate: String(bond.interest_rate),
      average_price: String(bond.pu_base),
      due_date: bond.due_date,
    }));
  };

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
        <div className="bg-surface-card border border-border-subtle rounded-xl p-3.5 shadow-lg">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs text-text-muted font-semibold tracking-wider uppercase">Total Aplicado</p>
              <h3 className="text-lg font-bold text-text-primary mt-0.5">{money(totalInvested)}</h3>
            </div>
            <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-lg">
              <Landmark size={16} />
            </div>
          </div>
        </div>

        <div className="bg-surface-card border border-border-subtle rounded-xl p-3.5 shadow-lg">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs text-text-muted font-semibold tracking-wider uppercase">Saldo Bruto Atual</p>
              <h3 className="text-lg font-bold text-text-primary mt-0.5">{money(totalGross)}</h3>
            </div>
            <div className="p-2 bg-surface-elevated text-text-muted rounded-lg">
              <TrendingUp size={16} />
            </div>
          </div>
        </div>

        <div className="bg-surface-card border border-border-subtle rounded-xl p-3.5 shadow-lg">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs text-text-muted font-semibold tracking-wider uppercase">Saldo Líquido Est.</p>
              <h3 className="text-lg font-bold text-status-success mt-0.5">{money(totalNet)}</h3>
            </div>
            <div className="p-2 bg-emerald-500/10 text-status-success rounded-lg">
              <ShieldCheck size={16} />
            </div>
          </div>
        </div>

        <div className="bg-surface-card border border-border-subtle rounded-xl p-3.5 shadow-lg">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs text-text-muted font-semibold tracking-wider uppercase">Rendimento Líquido</p>
              <h3 className="text-lg font-bold text-accent mt-0.5">{isHidden ? money(totalProfit) : `+${money(totalProfit)}`}</h3>
            </div>
            <div className="p-2 bg-accent-soft text-accent rounded-lg">
              <ArrowUpRight size={16} />
            </div>
          </div>
        </div>
      </div>

      {/* Main Container */}
      <div className="bg-surface-card border border-border-subtle rounded-xl p-5 shadow-lg space-y-4">
        <div className="flex justify-between items-center border-b border-border-subtle pb-4">
          <h3 className="text-lg font-bold text-text-primary uppercase tracking-wider">Meus Títulos de Renda Fixa</h3>
          <button 
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1 bg-indigo-500 hover:bg-indigo-600 text-white text-xs px-3 py-1.5 rounded-lg transition"
          >
            <Plus size={14} /> Adicionar Título
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-text-secondary">
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
                  <tr key={t.id} className="border-b border-border-subtle hover:bg-surface-elevated/40 transition">
                    <td className="py-3.5 px-4 font-semibold text-text-primary">
                      <div>
                        <div className="flex items-center gap-2">
                          <p>{t.ticker}</p>
                          {t.pricing_mode === 'TESOURO_MTM' && (
                            <span className="text-2xs px-1.5 py-0.5 rounded bg-accent-soft text-accent border border-accent/20 font-semibold">
                              MtM Tesouro
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-text-muted font-normal">
                          {t.name}
                          {t.pricing_mode === 'TESOURO_MTM' && t.market_pu != null && (
                            <span className="ml-1.5 text-text-muted">
                              · PU {money(t.market_pu)}
                            </span>
                          )}
                        </p>
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="text-xs px-2 py-0.5 rounded bg-surface-elevated border border-border-subtle font-semibold text-accent">
                        {t.index_type} {t.interest_rate}% {t.index_type === 'CDI' ? 'CDI' : (t.index_type === 'IPCA' ? '+ IPCA' : 'a.a.')}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 max-w-[200px]">
                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px] text-text-muted">
                          <span>{new Date(t.issue_date).toLocaleDateString()}</span>
                          <span>{new Date(t.due_date).toLocaleDateString()}</span>
                        </div>
                        <div className="w-full bg-surface-elevated h-1.5 rounded-full overflow-hidden">
                          <div className="bg-indigo-500 h-full rounded-full" style={{ width: `${progressPct}%` }}></div>
                        </div>
                        <p className="text-[10px] text-text-muted text-right">{t.days_elapsed} de {t.total_days} dias ({progressPct}%)</p>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-text-secondary">
                      {t.tax_rate}%
                    </td>
                    <td className="py-3.5 px-4 text-right font-bold">{money(t.total_invested)}</td>
                    <td className="py-3.5 px-4 text-right font-bold text-text-primary">{money(t.gross_value)}</td>
                    <td className="py-3.5 px-4 text-right font-bold text-status-success">{money(t.net_value)}</td>
                    <td className="py-3.5 px-4 text-center">
                      <button 
                        onClick={() => setDeleteId(t.id)}
                        className="text-text-muted hover:text-status-error p-1 rounded transition"
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
          <div className="bg-surface-card border border-border-subtle rounded-xl w-full max-w-md p-6 relative shadow-2xl">
            <button 
              onClick={() => setShowAddModal(false)}
              className="absolute top-4 right-4 text-text-muted hover:text-text-primary"
            >
              <X size={18} />
            </button>
            <h3 className="text-lg font-bold text-text-primary mb-4">Adicionar Título de Renda Fixa</h3>

            <div className="grid grid-cols-2 gap-2 p-1 bg-surface-input rounded-lg mb-4 border border-border-subtle">
              <button
                type="button"
                onClick={() => handleModeSwitch('MANUAL')}
                className={`py-1.5 text-xs font-semibold rounded-md transition-colors ${
                  entryMode === 'MANUAL'
                    ? 'bg-surface-card text-text-primary shadow-sm'
                    : 'text-text-muted hover:text-text-primary'
                }`}
              >
                Manual (CDB / LCI / Outros)
              </button>
              <button
                type="button"
                onClick={() => handleModeSwitch('TESOURO')}
                className={`py-1.5 text-xs font-semibold rounded-md transition-colors ${
                  entryMode === 'TESOURO'
                    ? 'bg-accent text-white shadow-sm'
                    : 'text-text-muted hover:text-text-primary'
                }`}
              >
                Tesouro Direto (Oficial)
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              {entryMode === 'TESOURO' && (
                <div>
                  <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1">
                    Selecionar Título do Tesouro Direto
                  </label>
                  {tesouroLoading ? (
                    <p className="text-xs text-text-muted py-2">Buscando cotações oficiais do Tesouro...</p>
                  ) : tesouroError ? (
                    <p className="text-xs text-status-error py-1">{tesouroError}</p>
                  ) : (
                    <select
                      value={tesouroBonds.some((b) => b.ticker === form.ticker) ? form.ticker : ''}
                      onChange={(e) => handleSelectTesouroBond(e.target.value)}
                      className="w-full bg-surface-input border border-border-subtle rounded-lg p-2 text-text-primary focus:outline-none focus:border-accent text-sm"
                    >
                      <option value="">Escolha um título...</option>
                      {tesouroBonds.map((b) => (
                        <option key={b.ticker} value={b.ticker}>
                          {b.name} · Venc: {b.due_date.split('-').reverse().join('/')} · PU {formatMoney(b.pu_base)}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-1">Ticker / Sigla</label>
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
                <label className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-1">Nome do Título</label>
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
                  <label className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-1">Indexador</label>
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
                  <label className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-1">Taxa (%)</label>
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
                  <label className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-1">Valor Aplicado (R$)</label>
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
                  <label className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-1">Quantidade</label>
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
                  <label className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-1">Data de Emissão</label>
                  <input 
                    type="date" 
                    value={form.issue_date} 
                    onChange={(e) => setForm({ ...form, issue_date: e.target.value })}
                    className="w-full bg-surface-input border border-border-subtle rounded-lg p-2 text-text-primary focus:outline-none focus:border-accent text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-1">Vencimento</label>
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
                className="w-full bg-indigo-500 hover:bg-indigo-600 text-white font-semibold py-2 rounded-lg text-sm transition mt-2"
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
