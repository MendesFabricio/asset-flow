'use client';

import { useEffect, useState } from 'react';
import { apiCall } from '../utils/apiClient';
import { Card } from './ui/Card';
import { BookOpen, Calendar, Trash2, Plus, AlertCircle, FileText, CheckCircle } from 'lucide-react';
import { formatMoney } from '../utils';

interface Decision {
  id: number;
  asset_id: number;
  ticker: string;
  date: string;
  decision_type: 'COMPRA' | 'VENDA' | 'MANTER' | 'ESTUDO';
  title: string;
  content: string;
  target_price: number | null;
}

export default function DecisionsTab() {
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form states
  const [showAddForm, setShowAddForm] = useState(false);
  const [ticker, setTicker] = useState('');
  const [decisionType, setDecisionType] = useState<'COMPRA' | 'VENDA' | 'MANTER' | 'ESTUDO'>('ESTUDO');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [targetPrice, setTargetPrice] = useState('');

  const [tickers, setTickers] = useState<string[]>([]);

  const fetchDecisions = () => {
    setLoading(true);
    apiCall<Decision[]>('/api/decisions')
      .then((data) => {
        setDecisions(data);
        setError(null);
      })
      .catch((err) => {
        console.error(err);
        setError('Erro ao carregar o diário de decisões.');
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchDecisions();

    // Fetch active tickers to populate autocomplete/dropdown
    apiCall<{ assets: { ticker: string }[] }>('/api/assets')
      .then((res) => {
        if (res && res.assets) {
          setTickers(res.assets.map((a) => a.ticker));
        }
      })
      .catch(() => {});
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticker || !title || !content) return;

    try {
      await apiCall('/api/decisions', {
        method: 'POST',
        body: JSON.stringify({
          ticker,
          decision_type: decisionType,
          title,
          content,
          target_price: targetPrice ? parseFloat(targetPrice) : null,
        }),
      });

      // Reset form
      setTicker('');
      setDecisionType('ESTUDO');
      setTitle('');
      setContent('');
      setTargetPrice('');
      setShowAddForm(false);
      
      // Refresh
      fetchDecisions();
    } catch (err: any) {
      alert(err.message || 'Erro ao salvar anotação.');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Deseja realmente excluir esta anotação do diário?')) return;

    try {
      await apiCall(`/api/decisions/${id}`, {
        method: 'DELETE',
      });
      setDecisions((prev) => prev.filter((d) => d.id !== id));
    } catch (err: any) {
      alert(err.message || 'Erro ao remover anotação.');
    }
  };

  const getBadgeColor = (type: string) => {
    switch (type) {
      case 'COMPRA':
        return 'bg-emerald-950/40 text-emerald-400 border-emerald-500/30';
      case 'VENDA':
        return 'bg-red-950/40 text-red-400 border-red-500/30';
      case 'MANTER':
        return 'bg-amber-950/40 text-amber-400 border-amber-500/30';
      default:
        return 'bg-blue-950/40 text-blue-400 border-blue-500/30';
    }
  };

  return (
    <div className="space-y-6">
      {/* Botão topo */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <BookOpen size={18} className="text-blue-400" />
          <h3 className="font-bold text-slate-200 text-sm uppercase tracking-widest leading-none">
            Diário de Decisões do Investidor
          </h3>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all shadow-md"
        >
          {showAddForm ? 'Cancelar' : <><Plus size={14} /> Nova Decisão</>}
        </button>
      </div>

      {/* Formulário Add */}
      {showAddForm && (
        <Card className="!bg-[#0f172a] !border-slate-800/80 p-6 animate-in slide-in-from-top-4 duration-300">
          <form onSubmit={handleAdd} className="space-y-4">
            <h4 className="font-bold text-slate-300 text-xs uppercase tracking-wider border-b border-slate-800 pb-2">
              Registrar Tese / Racional de Investimento
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                  Ativo / Ticker
                </label>
                <select
                  required
                  value={ticker}
                  onChange={(e) => setTicker(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 focus:border-blue-500 text-slate-200 rounded-xl px-4 py-2.5 text-xs outline-none transition-all"
                >
                  <option value="">Selecione o Ativo...</option>
                  {tickers.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                  Decisão
                </label>
                <select
                  value={decisionType}
                  onChange={(e) => setDecisionType(e.target.value as any)}
                  className="w-full bg-slate-900 border border-slate-800 focus:border-blue-500 text-slate-200 rounded-xl px-4 py-2.5 text-xs outline-none transition-all"
                >
                  <option value="ESTUDO">Estudo / Monitorar</option>
                  <option value="COMPRA">Compra</option>
                  <option value="VENDA">Venda</option>
                  <option value="MANTER">Manter / Hold</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                  Preço Alvo / Gatilho (Opcional)
                </label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="R$ 0,00"
                  value={targetPrice}
                  onChange={(e) => setTargetPrice(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 focus:border-blue-500 text-slate-200 rounded-xl px-4 py-2.5 text-xs outline-none transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                Título do Racional
              </label>
              <input
                type="text"
                required
                placeholder="Ex: Compra de PETR4 após divulgação do guidance de produção..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 focus:border-blue-500 text-slate-200 rounded-xl px-4 py-2.5 text-xs outline-none transition-all"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                Tese de Investimento (Suporta Markdown / Texto Livre)
              </label>
              <textarea
                required
                rows={4}
                placeholder="Descreva detalhadamente o porquê de sua decisão (ex: múltiplos atrativos, aumento de DY, hedge cambial...)"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 focus:border-blue-500 text-slate-200 rounded-xl px-4 py-2.5 text-xs outline-none transition-all resize-none font-sans"
              />
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all shadow-md"
              >
                <CheckCircle size={14} /> Registrar Decisão
              </button>
            </div>
          </form>
        </Card>
      )}

      {/* Lista de decisões */}
      {loading && !showAddForm ? (
        <div className="animate-pulse space-y-4">
          <div className="h-32 bg-slate-900/40 border border-slate-800 rounded-2xl" />
          <div className="h-32 bg-slate-900/40 border border-slate-800 rounded-2xl" />
        </div>
      ) : decisions.length === 0 ? (
        <Card className="flex flex-col items-center justify-center p-8 text-center !bg-[#0f172a] !border-slate-800 min-h-[250px]">
          <FileText className="text-slate-500 mb-3" size={32} />
          <p className="text-slate-400 text-sm font-medium">
            Seu diário de decisões está vazio.
          </p>
          <p className="text-slate-600 text-xs mt-1">
            Garantir a governança de suas decisões financeiras ajuda a evitar compras emocionais.
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {decisions.map((dec) => (
            <Card
              key={dec.id}
              className="flex flex-col !bg-[#0f172a] !border-slate-800/80 hover:!border-slate-700/80 p-5 transition-all shadow-md group"
            >
              {/* Top info */}
              <div className="flex justify-between items-start gap-4">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="text-lg font-bold text-white font-mono">{dec.ticker}</span>
                  <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded border ${getBadgeColor(dec.decision_type)}`}>
                    {dec.decision_type}
                  </span>
                  {dec.target_price !== null && (
                    <span className="text-[10px] font-bold text-amber-500 bg-amber-950/20 px-2.5 py-0.5 rounded border border-amber-500/20 font-mono">
                      Gatilho: {formatMoney(dec.target_price)}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1.5 text-slate-500 text-[10px] font-medium uppercase tracking-tight">
                    <Calendar size={11} />
                    {new Date(dec.date).toLocaleDateString('pt-BR', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                  <button
                    onClick={() => handleDelete(dec.id)}
                    className="text-slate-500 hover:text-red-400 p-1 rounded hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100"
                    title="Excluir anotação"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>

              {/* Title & Content */}
              <div className="mt-3">
                <h4 className="font-bold text-sm text-slate-200">{dec.title}</h4>
                <p className="mt-2 text-slate-400 text-xs leading-relaxed whitespace-pre-wrap font-sans">
                  {dec.content}
                </p>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
