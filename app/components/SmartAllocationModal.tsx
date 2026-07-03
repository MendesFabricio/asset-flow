'use client';
import { useState, useEffect, useCallback } from 'react';
import { X, Calculator, ShoppingCart, Sparkles, AlertTriangle, Target, Info, Activity, RefreshCw } from 'lucide-react';
import { Asset } from '../types';
import { formatMoney } from '../utils';
import { Card } from './ui/Card';
import { apiCall } from '../utils/apiClient';

interface ServerSuggestion {
  ticker: string;
  category: string;
  current_pct: number;
  target_pct: number;
  gap_value: number;
  action: 'COMPRAR' | 'MANTER';
  suggested_value: number;
  suggested_lots: number | string;
  lot_size: number;
  score: number;
  corr_penalty: number;
  rationale: string;
}

interface ServerRebalanceResult {
  status: string;
  msg?: string;
  total_atual: number;
  aporte_mensal: number;
  total_apos_aporte: number;
  sugestoes: ServerSuggestion[];
}

interface AllocationItem extends Asset {
  qtd_compra: number;
  custo_total: number;
  impacto_meta: number | null;
  motivo_texto: string;
  tipo_acao: 'REBALANCE' | 'EXPANSION';
  justificativas: string[];
}

interface SmartAllocationModalProps {
  isOpen: boolean;
  onClose: () => void;
  ativos: Asset[];
}

export const SmartAllocationModal = ({ isOpen, onClose, ativos }: SmartAllocationModalProps) => {
  const [amountStr, setAmountStr] = useState('');
  const [serverResult, setServerResult] = useState<ServerRebalanceResult | null>(null);
  const [serverLoading, setServerLoading] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const parseCurrency = (v: string) => {
    if (!v) return 0;
    const clean = v.replace(/[^\d,.]/g, '').replace(/\./g, '').replace(',', '.');
    const n = Number(clean);
    return Number.isFinite(n) ? n : 0;
  };

  const handleSimulate = useCallback(async () => {
    const amount = parseCurrency(amountStr);
    if (!amount || amount <= 0) return;
    setServerLoading(true);
    setServerError(null);
    setServerResult(null);
    try {
      const data = await apiCall<ServerRebalanceResult>('/api/smart-rebalance', {
        method: 'POST',
        body: JSON.stringify({ aporte_mensal: amount }),
      });
      if (data.status === 'Sucesso') setServerResult(data);
      else setServerError(data.msg || 'Erro no servidor.');
    } catch {
      setServerError('Falha ao conectar ao servidor.');
    } finally {
      setServerLoading(false);
    }
  }, [amountStr]);

  if (!isOpen) return null;

  const valorInput = parseCurrency(amountStr);
  const totalAlocado = serverResult ? serverResult.sugestoes.reduce((acc, s) => acc + s.suggested_value, 0) : 0;
  const sobra = valorInput - totalAlocado;
  const highSobra = sobra > (valorInput * 0.05) && sobra > 100;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <Card className="w-full max-w-2xl !bg-[#0f172a] shadow-2xl border border-slate-800 flex flex-col max-h-[90vh] p-0 overflow-hidden ring-1 ring-white/10">

        <div className="relative p-6 border-b border-slate-800 bg-gradient-to-r from-slate-900 via-[#1e1b4b] to-slate-900">
          <div className="flex justify-between items-start relative z-10">
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Sparkles className="text-purple-400" size={20} />
                Simulador Inteligente
              </h2>
              <p className="text-xs text-slate-400 mt-1">Algoritmo de alocação institucional.</p>
            </div>
            <button onClick={onClose} className="bg-slate-800/50 hover:bg-slate-700 p-2 rounded-full text-slate-400 hover:text-white transition-all border border-white/5">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-8 bg-[#0f172a]">
          <div className="flex flex-col items-center gap-6 pt-4">
            <div className="relative w-full max-w-sm group">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-purple-600 rounded-2xl blur opacity-20 group-hover:opacity-30 transition-opacity" />
              <div className="relative flex items-center bg-slate-900 border border-slate-700 rounded-2xl p-2 transition-all group-focus-within:border-purple-500/50 group-focus-within:ring-1 group-focus-within:ring-purple-500/20">
                <span className="pl-4 text-slate-500 font-bold text-lg">R$</span>
                <input
                  type="text"
                  value={amountStr}
                  onChange={(e) => setAmountStr(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSimulate()}
                  placeholder="0,00"
                  className="w-full bg-transparent border-none text-white font-mono text-3xl font-bold p-3 focus:ring-0 outline-none text-center placeholder:text-slate-700"
                  autoFocus
                />
              </div>
            </div>

            <button
              onClick={handleSimulate}
              disabled={!amountStr || parseCurrency(amountStr) <= 0}
              className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white px-8 py-3 rounded-xl font-bold flex items-center gap-2 transition-all shadow-lg shadow-purple-900/20 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed w-full max-w-sm justify-center disabled:grayscale"
            >
              <Calculator size={18} />
              Gerar Recomendação
            </button>
          </div>

          {serverError && (
            <div className="bg-red-900/20 border border-red-900/40 rounded-xl p-3 text-sm text-red-400 flex items-center gap-2">
              <AlertTriangle size={14} /> {serverError}
            </div>
          )}

          {serverLoading && (
            <div className="flex items-center justify-center gap-2 py-8 text-slate-500">
              <RefreshCw size={16} className="animate-spin" />
              <span className="text-sm">Calculando com dados de correlação...</span>
            </div>
          )}

          {serverResult && !serverLoading && (
            <div className="space-y-4 animate-in slide-in-from-bottom-4 duration-500">
              {/* Resumo do aporte */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'Patrimônio Atual', value: formatMoney(serverResult.total_atual) },
                  { label: 'Aporte', value: formatMoney(serverResult.aporte_mensal) },
                  { label: 'Total Pós-Aporte', value: formatMoney(serverResult.total_apos_aporte) },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 text-center">
                    <p className="text-[9px] text-slate-500 uppercase font-bold mb-1">{label}</p>
                    <p className="text-sm font-bold text-white font-mono">{value}</p>
                  </div>
                ))}
              </div>

              {/* Tabela de sugestões */}
              <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Activity size={14} className="text-purple-400" /> Rebalanceamento com Correlação
                </h3>
                <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-1 rounded-full border border-slate-700">
                  {serverResult.sugestoes.filter(s => s.action === 'COMPRAR').length} ordens
                </span>
              </div>

              <div className="space-y-2">
                {serverResult.sugestoes.filter(s => s.action === 'COMPRAR').map(s => (
                  <div key={s.ticker} className="p-3 bg-slate-800/30 border border-slate-800 rounded-xl hover:border-purple-500/30 transition-all">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <img
                          src={`https://raw.githubusercontent.com/thefintz/icones-b3/main/icones/${s.ticker}.png`}
                          className="w-8 h-8 rounded-full bg-slate-800 object-cover"
                          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                        <div>
                          <p className="font-bold text-white text-sm">{s.ticker}</p>
                          <p className="text-[10px] text-slate-500">{s.category}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-emerald-400 font-mono">{formatMoney(s.suggested_value)}</p>
                        <p className="text-[10px] text-slate-500">
                          {s.lot_size > 0 ? `${s.suggested_lots} lote(s)` : `${s.suggested_lots} un.`}
                        </p>
                      </div>
                    </div>
                    {/* Barra de gap vs meta */}
                    <div className="mt-2 space-y-1">
                      <div className="flex justify-between text-[10px] text-slate-500">
                        <span>Atual {s.current_pct.toFixed(1)}% → Meta {s.target_pct.toFixed(1)}%</span>
                        {s.corr_penalty > 0 && (
                          <span className="text-amber-500">Penalidade corr. -{(s.corr_penalty * 100).toFixed(1)}%</span>
                        )}
                      </div>
                      <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full"
                          style={{ width: `${Math.min(100, (s.current_pct / s.target_pct) * 100)}%` }}
                        />
                      </div>
                      <p className="text-[9px] text-slate-600 mt-0.5">{s.rationale}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Ativos acima da meta */}
              {serverResult.sugestoes.filter(s => s.action === 'MANTER').length > 0 && (
                <div className="text-[11px] text-slate-600 border-t border-slate-800 pt-2">
                  <p className="font-bold text-slate-500 mb-1">Acima da meta (manter):</p>
                  <div className="flex flex-wrap gap-1.5">
                    {serverResult.sugestoes.filter(s => s.action === 'MANTER').map(s => (
                      <span key={s.ticker} className="bg-slate-800 border border-slate-700 rounded-full px-2 py-0.5 text-slate-400 text-[10px]">{s.ticker}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {amountStr !== '' && serverResult && serverResult.sugestoes.filter(s => s.action === 'COMPRAR').length === 0 && !serverLoading && parseCurrency(amountStr) > 0 && (
            <div className="text-center py-8 text-slate-500 border-t border-slate-800/50 flex flex-col items-center gap-2">
              <AlertTriangle className="text-slate-600" size={24} />
              <p className="text-xs italic">
                Não foi possível alocar este valor.<br />
                O montante pode ser insuficiente para comprar 1 cota ou os limites de segurança foram atingidos.
              </p>
            </div>
          )}
        </div>

        {serverResult && !serverLoading && (
          <div className="flex flex-col border-t border-slate-800">
            {highSobra && (
              <div className="bg-amber-900/20 px-4 py-2 flex items-start gap-2 border-b border-amber-900/30">
                <AlertTriangle className="text-amber-500 mt-0.5" size={14} />
                <div>
                  <p className="text-[10px] font-bold text-amber-400 uppercase">Proteção de Capital</p>
                  <p className="text-[10px] text-amber-200/70 leading-tight">
                    <b>{formatMoney(sobra)}</b> preservados. Motivos: Efeito de arredondamento de lotes/unidades (compras apenas em unidades inteiras, com exceção da aba CDB / LCI).
                  </p>
                </div>
              </div>
            )}

            <div className="p-4 bg-slate-950 flex justify-between items-center gap-4">
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Total Alocado</span>
                <span className="text-xl font-bold text-emerald-400 font-mono tracking-tight">{formatMoney(totalAlocado)}</span>
              </div>
              <div className="h-8 w-px bg-slate-800"></div>
              <div className="flex flex-col items-end">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Sobrou (Caixa)</span>
                <span className={`text-lg font-bold font-mono tracking-tight ${highSobra ? 'text-amber-400' : 'text-slate-300'}`}>{formatMoney(sobra)}</span>
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
};
