'use client';
import { useState, useEffect, useCallback } from 'react';
import { X, Calculator, ShoppingCart, Sparkles, AlertTriangle, Target, Info, Activity, RefreshCw } from 'lucide-react';
import { Asset } from '../types';
import { formatMoney } from '../utils';
import { Card } from './ui/Card';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5328';

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
  const [allocation, setAllocation] = useState<AllocationItem[]>([]);
  const [tooltipData, setTooltipData] = useState<{ x: number, y: number, lines: string[] } | null>(null);
  const [windowWidth, setWindowWidth] = useState(1024); // Default seguro

  // Modo de simulação: 'local' (client-side original) | 'server' (com correlação)
  const [mode, setMode] = useState<'local' | 'server'>('local');
  const [serverResult, setServerResult] = useState<ServerRebalanceResult | null>(null);
  const [serverLoading, setServerLoading] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  // Monitora largura da tela para o Tooltip inteligente
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setTimeout(() => setWindowWidth(window.innerWidth), 0);
      const handleResize = () => setWindowWidth(window.innerWidth);
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }
  }, [])

  const parseCurrency = (v: string) => {
    if (!v) return 0;
    const clean = v.replace(/[^\d,.]/g, '').replace(/\./g, '').replace(',', '.');
    const n = Number(clean);
    return Number.isFinite(n) ? n : 0;
  };

  // Simulação server-side com correlação
  const handleServerSimulate = useCallback(async () => {
    const amount = parseCurrency(amountStr);
    if (!amount || amount <= 0) return;
    setServerLoading(true);
    setServerError(null);
    setServerResult(null);
    try {
      const res = await fetch(`${API_BASE}/api/smart-rebalance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aporte_mensal: amount }),
      });
      const data: ServerRebalanceResult = await res.json();
      if (data.status === 'Sucesso') setServerResult(data);
      else setServerError(data.msg || 'Erro no servidor.');
    } catch {
      setServerError('Falha ao conectar ao servidor.');
    } finally {
      setServerLoading(false);
    }
  }, [amountStr]);

  const handleSimulate = () => {
    if (mode === 'server') { handleServerSimulate(); return; }
    const amount = parseCurrency(amountStr);
    if (!amount || amount <= 0) return;

    const POLICY = {
      // 🔧 1. Disciplina Global: Gasta no máximo X% do aporte total para fechar gaps.
      // O resto (se houver) vai para expansão ou caixa.
      REBALANCE_GLOBAL_CAP: amount > 10000 ? 0.50 : 0.70,
      EXPANSION_CAP: 0.05,
      MIN_SCORE: 40,
      MIN_CASH_STOP: 50
    };

    const validAssets = ativos.filter(a => a.preco_atual > 0 && Number.isFinite(a.preco_atual));
    const assetMap = new Map(validAssets.map(a => [a.ticker, a]));

    let availableCash = amount;
    // Controle global de gasto em rebalanceamento
    let rebalanceSpent = 0;
    const maxRebalanceGlobal = amount * POLICY.REBALANCE_GLOBAL_CAP;

    const purchaseMap = new Map<string, { qtd: number, custo: number, motivo: string, tipo: 'REBALANCE' | 'EXPANSION', logs: string[] }>();

    // --- TURNO 1: REBALANCEAMENTO (Com Teto Global) ---
    const rebalanceCandidates = validAssets
      .filter(a => a.falta_comprar > 0)
      .sort((a, b) => b.falta_comprar - a.falta_comprar);

    for (const asset of rebalanceCandidates) {
      if (availableCash < asset.preco_atual) continue;

      // Quanto ainda posso gastar em rebalanceamento HOJE?
      const remainingRebalanceBudget = Math.max(0, maxRebalanceGlobal - rebalanceSpent);

      // Se acabou o orçamento de rebalanceamento, para o turno 1 (mesmo sobrando caixa)
      if (remainingRebalanceBudget < asset.preco_atual) break;

      const sharesToFillGap = Math.ceil(asset.falta_comprar / asset.preco_atual);
      const sharesAffordable = Math.floor(availableCash / asset.preco_atual);
      const sharesSafety = Math.floor(remainingRebalanceBudget / asset.preco_atual);

      const sharesToBuy = Math.min(sharesToFillGap, sharesAffordable, sharesSafety);

      if (sharesToBuy > 0) {
        const cost = sharesToBuy * asset.preco_atual;

        const logs = [`Meta em aberto: ${formatMoney(asset.falta_comprar)}`];

        // 🔧 3. Justificativa Rica
        const impacto = Math.min((cost / asset.falta_comprar) * 100, 100);
        if (impacto >= 99) logs.push('🎯 Meta totalmente atingida');
        else logs.push(`📈 Cobre ${impacto.toFixed(0)}% do gap atual`);

        if (sharesSafety < sharesToFillGap && sharesSafety < sharesAffordable) {
          logs.push(`🔒 Travado pelo Teto de Rebalanceamento (${(POLICY.REBALANCE_GLOBAL_CAP * 100).toFixed(0)}%)`);
        }

        purchaseMap.set(asset.ticker, {
          qtd: sharesToBuy,
          custo: cost,
          motivo: 'Rebalanceamento',
          tipo: 'REBALANCE',
          logs: logs
        });

        availableCash -= cost;
        rebalanceSpent += cost;
      }
    }

    // --- TURNO 2: EXPANSÃO ---
    if (availableCash > 100) {
      const expansionCandidates = validAssets
        .filter(a =>
          a.falta_comprar <= 0 &&
          (a.score || 0) >= POLICY.MIN_SCORE &&
          (!a.vi_graham || a.preco_atual < a.vi_graham)
        )
        .sort((a, b) => (b.score || 0) - (a.score || 0));

      for (const asset of expansionCandidates) {
        if (availableCash < asset.preco_atual) continue;

        const existing = purchaseMap.get(asset.ticker);
        if (existing) continue;

        const maxExpansionCash = amount * POLICY.EXPANSION_CAP;
        const sharesAffordable = Math.floor(availableCash / asset.preco_atual);
        const sharesCap = Math.floor(maxExpansionCash / asset.preco_atual);

        const sharesToBuy = Math.min(sharesAffordable, sharesCap);

        if (sharesToBuy > 0) {
          const cost = sharesToBuy * asset.preco_atual;

          const logs = [`Score de Qualidade: ${asset.score}`];
          if (asset.vi_graham && asset.preco_atual < asset.vi_graham) {
            logs.push(`Abaixo do V.I. Graham (${formatMoney(asset.vi_graham)})`);
          }
          if (sharesCap < sharesAffordable) {
            logs.push(`🛡️ Pulverização forçada (Max 5%)`);
          }

          purchaseMap.set(asset.ticker, {
            qtd: sharesToBuy,
            custo: cost,
            motivo: 'Expansão',
            tipo: 'EXPANSION',
            logs: logs
          });
          availableCash -= cost;
        }
        if (availableCash < POLICY.MIN_CASH_STOP) break;
      }
    }

    const finalSuggestions: AllocationItem[] = [];
    purchaseMap.forEach((data, ticker) => {
      const asset = assetMap.get(ticker);
      if (asset) {
        let impacto: number | null = null;
        if (asset.falta_comprar > 0) {
          impacto = Math.min((data.custo / asset.falta_comprar) * 100, 100);
        }

        finalSuggestions.push({
          ...asset,
          qtd_compra: data.qtd,
          custo_total: data.custo,
          impacto_meta: impacto,
          motivo_texto: data.motivo,
          tipo_acao: data.tipo,
          justificativas: data.logs
        });
      }
    });

    setAllocation(finalSuggestions.sort((a, b) => {
      if (a.tipo_acao !== b.tipo_acao) return a.tipo_acao === 'REBALANCE' ? -1 : 1;
      return b.custo_total - a.custo_total;
    }));
  };

  if (!isOpen) return null;

  const valorInput = parseCurrency(amountStr);
  const totalAlocado = mode === 'local'
    ? allocation.reduce((acc, item) => acc + item.custo_total, 0)
    : (serverResult ? serverResult.sugestoes.reduce((acc, s) => acc + s.suggested_value, 0) : 0);
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

        {/* MODE SELECTOR */}
        <div className="px-6 pt-4 flex gap-2">
          {([
            { id: 'local', label: 'Simulador Local', icon: Calculator },
            { id: 'server', label: 'Com Correlação (IA)', icon: Activity },
          ] as const).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setMode(id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                mode === id
                  ? 'bg-purple-600/20 border-purple-500/50 text-purple-300'
                  : 'bg-slate-800/50 border-slate-700 text-slate-500 hover:text-slate-300'
              }`}
            >
              <Icon size={12} />{label}
            </button>
          ))}
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

          {/* SERVER-SIDE RESULTS */}
          {mode === 'server' && serverError && (
            <div className="bg-red-900/20 border border-red-900/40 rounded-xl p-3 text-sm text-red-400 flex items-center gap-2">
              <AlertTriangle size={14} /> {serverError}
            </div>
          )}

          {mode === 'server' && serverLoading && (
            <div className="flex items-center justify-center gap-2 py-8 text-slate-500">
              <RefreshCw size={16} className="animate-spin" />
              <span className="text-sm">Calculando com dados de correlação...</span>
            </div>
          )}

          {mode === 'server' && serverResult && !serverLoading && (
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

          {/* LOCAL RESULTS */}
          {mode === 'local' && allocation.length > 0 && (
            <div className="space-y-4 animate-in slide-in-from-bottom-4 duration-500">
              <div className="flex justify-between items-end px-1 border-b border-slate-800 pb-2">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <ShoppingCart size={16} className="text-emerald-400" />
                  Plano de Execução
                </h3>
                <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-1 rounded-full border border-slate-700">
                  {allocation.length} ordens
                </span>
              </div>

              <div className="space-y-2">
                {allocation.map((item) => (
                  <div key={item.ticker} className="flex items-center justify-between p-3 bg-slate-800/30 border border-slate-800 rounded-xl hover:bg-slate-800/60 transition-colors group relative">
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <img src={`https://raw.githubusercontent.com/thefintz/icones-b3/main/icones/${item.ticker}.png`} className="w-10 h-10 rounded-full bg-slate-800 object-cover shadow-sm" />
                        <div className="absolute -bottom-1 -right-1 bg-slate-900 rounded-full p-0.5">
                          <div className="bg-blue-500/20 text-blue-400 text-[8px] font-bold px-1.5 rounded-full border border-blue-500/30">
                            +{item.qtd_compra}
                          </div>
                        </div>
                      </div>
                      <div>
                        <div className="font-bold text-slate-200 text-sm flex items-center gap-2">
                          {item.ticker}
                          <div
                            className={`text-[9px] font-normal px-1.5 py-0.5 rounded border flex items-center gap-1 cursor-help transition-colors ${item.tipo_acao === 'EXPANSION'
                              ? 'text-amber-400 bg-amber-900/20 border-amber-900/40 hover:bg-amber-900/40'
                              : 'text-emerald-400 bg-emerald-900/20 border-emerald-900/40 hover:bg-emerald-900/40'
                              }`}
                            onMouseEnter={(e) => {
                              const rect = e.currentTarget.getBoundingClientRect();
                              setTooltipData({ x: rect.right, y: rect.top, lines: item.justificativas });
                            }}
                            onMouseLeave={() => setTooltipData(null)}
                          >
                            {item.tipo_acao === 'EXPANSION' ? <Sparkles size={8} /> : <Target size={8} />}
                            {item.motivo_texto}
                            <Info size={8} className="opacity-50 ml-0.5" />
                          </div>
                        </div>
                        <div className="text-[10px] text-slate-500 uppercase font-medium mt-0.5">{item.tipo} • Score {item.score}</div>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-emerald-400 font-bold font-mono text-sm">{formatMoney(item.custo_total)}</div>
                      <div className="text-[10px] text-slate-600 font-mono">{formatMoney(item.preco_atual)} / un</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {amountStr !== '' && allocation.length === 0 && parseCurrency(amountStr) > 0 && (
            <div className="text-center py-8 text-slate-500 border-t border-slate-800/50 flex flex-col items-center gap-2">
              <AlertTriangle className="text-slate-600" size={24} />
              <p className="text-xs italic">
                Não foi possível alocar este valor.<br />
                O montante pode ser insuficiente para comprar 1 cota ou os limites de segurança foram atingidos.
              </p>
            </div>
          )}
        </div>

        {((mode === 'local' && allocation.length > 0) || (mode === 'server' && serverResult && !serverLoading)) && (
          <div className="flex flex-col border-t border-slate-800">
            {highSobra && (
              <div className="bg-amber-900/20 px-4 py-2 flex items-start gap-2 border-b border-amber-900/30">
                <AlertTriangle className="text-amber-500 mt-0.5" size={14} />
                <div>
                  <p className="text-[10px] font-bold text-amber-400 uppercase">Proteção de Capital</p>
                  <p className="text-[10px] text-amber-200/70 leading-tight">
                    <b>{formatMoney(sobra)}</b> preservados. Motivos: {
                      mode === 'local' 
                        ? 'Teto global de rebalanceamento atingido ou falta de ativos qualificados para expansão.' 
                        : 'Efeito de arredondamento de lotes/unidades (compras apenas em unidades inteiras, com exceção da aba Reserva).'
                    }
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

      {/* 🚀 TOOLTIP FLUTUANTE INTELIGENTE */}
      {tooltipData && (
        <div
          className="fixed z-[100] animate-in fade-in zoom-in-95 duration-150 pointer-events-none"
          // 🔧 2. Lógica de Posição Inteligente
          style={{
            top: tooltipData.y - 10,
            left: tooltipData.x > (windowWidth - 220) ? tooltipData.x - 230 : tooltipData.x + 10
          }}
        >
          <div className="bg-slate-900/95 backdrop-blur border border-slate-700 shadow-2xl rounded-lg p-3 w-52 ring-1 ring-black/50">
            <p className="text-[9px] font-bold text-slate-400 uppercase mb-2 border-b border-slate-800 pb-1">
              Racional da Escolha
            </p>
            <div className="space-y-1.5">
              {tooltipData.lines.map((line, idx) => (
                <div key={idx} className="text-[10px] text-slate-300 flex items-start gap-1.5 leading-tight">
                  <span className="mt-1 w-1 h-1 rounded-full bg-blue-500 shrink-0" />
                  {line}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
