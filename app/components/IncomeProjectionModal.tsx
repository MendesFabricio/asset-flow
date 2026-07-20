'use client';
import { useState, useCallback } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine
} from 'recharts';
import {
  X, TrendingUp, Target, DollarSign, Calendar, Zap, ChevronRight,
  Landmark, BarChart3, RefreshCw
} from 'lucide-react';
import { formatMoney } from '../lib/format';
import { apiCall } from '../lib/api';
import { ModalShell } from './ModalShell';
import { useChartPalette } from '../lib/chartPalette';

interface Params {
  aporte_mensal: number;
  anos: number;
  retorno_anual_pct: number;
  dy_anual_pct: number;
}

interface Timeline {
  ano: number;
  patrimonio: number;
  renda_mensal_projetada: number;
}

interface ProjectionResult {
  status: string;
  msg?: string;
  parametros: {
    patrimonio_atual: number;
    renda_atual_estimada: number;
    aporte_mensal: number;
    anos: number;
    retorno_anual_pct: number;
    dy_anual_pct: number;
  };
  resultados: {
    patrimonio_final: number;
    renda_mensal_final: number;
    total_aportado: number;
    multiplicador_patrimonio: number;
  };
  marcos_fi: Record<string, number | null>;
  timeline: Timeline[];
}

interface Props {
  onClose: () => void;
}

const MARCOS_LABELS: Record<string, string> = {
  '3000': 'R$ 3k/mês',
  '5000': 'R$ 5k/mês',
  '8000': 'R$ 8k/mês',
  '10000': 'R$ 10k/mês',
  '15000': 'R$ 15k/mês',
  '20000': 'R$ 20k/mês',
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-xs shadow-2xl">
      <p className="text-slate-400 font-bold mb-1">Ano {label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color }} className="font-mono">
          {p.name}: {formatMoney(p.value)}
        </p>
      ))}
    </div>
  );
};

export function IncomeProjectionModal({ onClose }: Props) {
  const [params, setParams] = useState<Params>({
    aporte_mensal: 1500,
    anos: 20,
    retorno_anual_pct: 12,
    dy_anual_pct: 6,
  });
  const [result, setResult] = useState<ProjectionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const palette = useChartPalette();

  const runProjection = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiCall<ProjectionResult>('/api/project-income', {
        method: 'POST',
        body: JSON.stringify(params),
      });
      if (data.status === 'Sucesso') setResult(data);
      else setError(data.msg || 'Erro na projeção.');
    } catch {
      setError('Falha ao conectar ao servidor.');
    } finally {
      setLoading(false);
    }
  }, [params]);

  const setParam = (key: keyof Params, val: number) =>
    setParams(p => ({ ...p, [key]: val }));

  return (
    <ModalShell
      onClose={onClose}
      title="Projeção de Independência Financeira"
      subtitle="Juros compostos sobre patrimônio atual + aportes mensais"
      icon={<TrendingUp size={18} />}
      maxWidth="4xl"
    >
      <div className="space-y-6">
        {/* Parâmetros */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { key: 'aporte_mensal' as keyof Params, label: 'Aporte Mensal', icon: DollarSign, prefix: 'R$', min: 100, max: 50000, step: 100 },
              { key: 'anos' as keyof Params, label: 'Período', icon: Calendar, suffix: 'anos', min: 5, max: 40, step: 1 },
              { key: 'retorno_anual_pct' as keyof Params, label: 'Retorno Anual', icon: Zap, suffix: '% a.a.', min: 4, max: 20, step: 0.5 },
              { key: 'dy_anual_pct' as keyof Params, label: 'DY Médio', icon: Landmark, suffix: '% a.a.', min: 2, max: 15, step: 0.5 },
            ].map(({ key, label, icon: Icon, prefix, suffix, min, max, step }) => (
              <div key={key} className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
                <div className="flex items-center gap-1.5 mb-2">
                  <Icon size={13} className="text-slate-500" />
                  <span className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">{label}</span>
                </div>
                <div className="flex items-baseline gap-1">
                  {prefix && <span className="text-xs text-slate-500">{prefix}</span>}
                  <input
                    type="number"
                    min={min} max={max} step={step}
                    value={params[key]}
                    onChange={e => setParam(key, parseFloat(e.target.value) || 0)}
                    className="w-full bg-transparent text-xl font-bold text-white font-mono focus:outline-none"
                  />
                  {suffix && <span className="text-xs text-slate-500">{suffix}</span>}
                </div>
                <input
                  type="range" min={min} max={max} step={step}
                  value={params[key]}
                  onChange={e => setParam(key, parseFloat(e.target.value))}
                  className="w-full h-1 mt-2 accent-emerald-500 cursor-pointer"
                />
              </div>
            ))}
          </div>

          {/* Botão */}
          <button
            onClick={runProjection}
            disabled={loading}
            className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:shadow-[0_0_30px_rgba(16,185,129,0.5)] disabled:opacity-50"
          >
            {loading
              ? <><RefreshCw size={16} className="animate-spin" /> Calculando...</>
              : <><BarChart3 size={16} /> Projetar Independência Financeira</>
            }
          </button>

          {error && (
            <div className="bg-red-900/20 border border-red-900/40 rounded-xl p-3 text-sm text-red-400">{error}</div>
          )}

          {result && (
            <>
              {/* Cards de Resultado */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: 'Patrimônio Final', value: formatMoney(result.resultados.patrimonio_final), color: 'text-emerald-400' },
                  { label: 'Renda Mensal Final', value: formatMoney(result.resultados.renda_mensal_final), color: 'text-teal-400' },
                  { label: 'Total Aportado', value: formatMoney(result.resultados.total_aportado), color: 'text-slate-300' },
                  { label: 'Multiplicador', value: `${result.resultados.multiplicador_patrimonio}×`, color: 'text-amber-400' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
                    <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest mb-1">{label}</p>
                    <p className={`text-xl font-bold font-mono ${color}`}>{value}</p>
                  </div>
                ))}
              </div>

              {/* Marcos de IF */}
              <div>
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                  <Target size={12} className="text-emerald-400" /> Marcos de Independência Financeira
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {Object.entries(result.marcos_fi).map(([meta, ano]) => (
                    <div
                      key={meta}
                      className={`rounded-xl px-4 py-3 border flex items-center justify-between ${ano
                        ? 'bg-emerald-900/20 border-emerald-900/40'
                        : 'bg-slate-900/40 border-slate-800 opacity-50'}`}
                    >
                      <div>
                        <p className="text-[10px] text-slate-500 uppercase font-bold">{MARCOS_LABELS[meta]}</p>
                        <p className={`text-sm font-bold font-mono ${ano ? 'text-emerald-400' : 'text-slate-600'}`}>
                          {ano ? `Ano ${ano}` : 'Fora do horizonte'}
                        </p>
                      </div>
                      {ano && <ChevronRight size={14} className="text-emerald-600" />}
                    </div>
                  ))}
                </div>
              </div>

              {/* Gráfico de Projeção */}
              <div>
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                  <TrendingUp size={12} className="text-emerald-400" /> Evolução do Patrimônio e Renda
                </h3>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={result.timeline} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
                      <defs>
                        <linearGradient id="patriGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="rendaGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#14b8a6" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="#14b8a6" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={palette.grid} vertical={false} />
                      <XAxis dataKey="ano" tick={{ fill: palette.axis, fontSize: 9 }} tickLine={false} axisLine={false} tickFormatter={v => `Ano ${v}`} interval={Math.floor(result.timeline.length / 5)} />
                      <YAxis yAxisId="pat" tick={{ fill: palette.axis, fontSize: 9 }} tickLine={false} axisLine={false} tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`} />
                      <YAxis yAxisId="renda" orientation="right" tick={{ fill: palette.axis, fontSize: 9 }} tickLine={false} axisLine={false} tickFormatter={v => `R$${(v / 1000).toFixed(1)}k`} />
                      <Tooltip content={<CustomTooltip />} />
                      <Area yAxisId="pat" type="monotone" dataKey="patrimonio" name="Patrimônio" stroke="#10b981" strokeWidth={2} fill="url(#patriGrad)" dot={false} />
                      <Area yAxisId="renda" type="monotone" dataKey="renda_mensal_projetada" name="Renda Mensal" stroke="#14b8a6" strokeWidth={2} fill="url(#rendaGrad)" dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </>
          )}
        </div>
    </ModalShell>
  );
}
