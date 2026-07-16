'use client';

import React, { useState, useEffect } from 'react';
import { 
  Plus, Landmark, Calendar, Trash2, X, 
  TrendingUp, ArrowUpRight, Percent, ShieldCheck
} from 'lucide-react';
import { formatMoney } from '../lib/format';

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
  const [titles, setTitles] = useState<FixedIncomeItem[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
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
      const res = await fetch('/api/fixed-income');
      const data = await res.json();
      if (res.ok) {
        setTitles(Array.isArray(data) ? data : []);
      } else {
        console.error("API Error:", data);
        setTitles([]);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/fixed-income', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      if (res.ok) {
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
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Deseja excluir este título de renda fixa?')) return;
    try {
      const res = await fetch(`/api/fixed-income/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        loadData();
      }
    } catch (e) {
      console.error(e);
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
        <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-5 shadow-lg">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs text-slate-400 font-semibold tracking-wider uppercase">Total Aplicado</p>
              <h3 className="text-2xl font-bold text-white mt-1">{formatMoney(totalInvested)}</h3>
            </div>
            <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-lg">
              <Landmark size={18} />
            </div>
          </div>
        </div>

        <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-5 shadow-lg">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs text-slate-400 font-semibold tracking-wider uppercase">Saldo Bruto Atual</p>
              <h3 className="text-2xl font-bold text-slate-200 mt-1">{formatMoney(totalGross)}</h3>
            </div>
            <div className="p-2 bg-slate-500/10 text-slate-400 rounded-lg">
              <TrendingUp size={18} />
            </div>
          </div>
        </div>

        <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-5 shadow-lg">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs text-slate-400 font-semibold tracking-wider uppercase">Saldo Líquido Est.</p>
              <h3 className="text-2xl font-bold text-emerald-400 mt-1">{formatMoney(totalNet)}</h3>
            </div>
            <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg">
              <ShieldCheck size={18} />
            </div>
          </div>
        </div>

        <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-5 shadow-lg">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs text-slate-400 font-semibold tracking-wider uppercase">Rendimento Líquido</p>
              <h3 className="text-2xl font-bold text-indigo-400 mt-1">+{formatMoney(totalProfit)}</h3>
            </div>
            <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-lg">
              <ArrowUpRight size={18} />
            </div>
          </div>
        </div>
      </div>

      {/* Main Container */}
      <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-5 shadow-lg space-y-4">
        <div className="flex justify-between items-center border-b border-slate-800 pb-4">
          <h3 className="text-lg font-bold text-white uppercase tracking-wider">Meus Títulos de Renda Fixa</h3>
          <button 
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1 bg-indigo-500 hover:bg-indigo-600 text-white text-xs px-3 py-1.5 rounded-lg transition"
          >
            <Plus size={14} /> Adicionar Título
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-300">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 text-xs uppercase tracking-wider">
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
                  <tr key={t.id} className="border-b border-slate-800/60 hover:bg-slate-900/20 transition">
                    <td className="py-3.5 px-4 font-semibold text-white">
                      <div>
                        <p>{t.ticker}</p>
                        <p className="text-xs text-slate-400 font-normal">{t.name}</p>
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="text-xs px-2 py-0.5 rounded bg-slate-900 border border-slate-800 font-semibold text-indigo-300">
                        {t.index_type} {t.interest_rate}% {t.index_type === 'CDI' ? 'CDI' : (t.index_type === 'IPCA' ? '+ IPCA' : 'a.a.')}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 max-w-[200px]">
                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px] text-slate-400">
                          <span>{new Date(t.issue_date).toLocaleDateString()}</span>
                          <span>{new Date(t.due_date).toLocaleDateString()}</span>
                        </div>
                        <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden">
                          <div className="bg-indigo-500 h-full rounded-full" style={{ width: `${progressPct}%` }}></div>
                        </div>
                        <p className="text-[10px] text-slate-500 text-right">{t.days_elapsed} de {t.total_days} dias ({progressPct}%)</p>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-slate-300">
                      {t.tax_rate}%
                    </td>
                    <td className="py-3.5 px-4 text-right font-bold">{formatMoney(t.total_invested)}</td>
                    <td className="py-3.5 px-4 text-right font-bold text-slate-200">{formatMoney(t.gross_value)}</td>
                    <td className="py-3.5 px-4 text-right font-bold text-emerald-400">{formatMoney(t.net_value)}</td>
                    <td className="py-3.5 px-4 text-center">
                      <button 
                        onClick={() => handleDelete(t.id)}
                        className="text-slate-500 hover:text-rose-400 p-1 rounded transition"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}

              {titles.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center py-10 text-slate-500 text-sm">
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
          <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl w-full max-w-md p-6 relative shadow-2xl">
            <button 
              onClick={() => setShowAddModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X size={18} />
            </button>
            <h3 className="text-lg font-bold text-white mb-4">Adicionar Título de Renda Fixa</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Ticker / Sigla</label>
                <input 
                  type="text" 
                  value={form.ticker} 
                  onChange={(e) => setForm({ ...form, ticker: e.target.value })}
                  placeholder="Ex: CDB_ITAU_2028, TESOURO_IPCA" 
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-slate-200 focus:outline-none focus:border-indigo-500 text-sm"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Nome do Título</label>
                <input 
                  type="text" 
                  value={form.name} 
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Ex: CDB Itaú Prefixado 2028" 
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-slate-200 focus:outline-none focus:border-indigo-500 text-sm"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Indexador</label>
                  <select 
                    value={form.index_type} 
                    onChange={(e) => setForm({ ...form, index_type: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-slate-200 focus:outline-none focus:border-indigo-500 text-sm"
                  >
                    <option value="CDI">CDI</option>
                    <option value="IPCA">IPCA</option>
                    <option value="PRE">PRÉ-FIXADO</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Taxa (%)</label>
                  <input 
                    type="number" 
                    step="0.01"
                    value={form.interest_rate} 
                    onChange={(e) => setForm({ ...form, interest_rate: e.target.value })}
                    placeholder="Ex: 110 (CDI) ou 12.5 (PRE)" 
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-slate-200 focus:outline-none focus:border-indigo-500 text-sm"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Valor Aplicado (R$)</label>
                  <input 
                    type="number" 
                    step="0.01"
                    value={form.average_price} 
                    onChange={(e) => setForm({ ...form, average_price: e.target.value })}
                    placeholder="Ex: 1000.00" 
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-slate-200 focus:outline-none focus:border-indigo-500 text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Quantidade</label>
                  <input 
                    type="number" 
                    step="0.0001"
                    value={form.quantity} 
                    onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-slate-200 focus:outline-none focus:border-indigo-500 text-sm"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Data de Emissão</label>
                  <input 
                    type="date" 
                    value={form.issue_date} 
                    onChange={(e) => setForm({ ...form, issue_date: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-slate-200 focus:outline-none focus:border-indigo-500 text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Vencimento</label>
                  <input 
                    type="date" 
                    value={form.due_date} 
                    onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-slate-200 focus:outline-none focus:border-indigo-500 text-sm"
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
    </div>
  );
}
