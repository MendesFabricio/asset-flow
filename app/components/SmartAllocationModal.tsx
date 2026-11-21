'use client';
import { useState, useCallback, useEffect, useMemo } from 'react';
import { Calculator, Sparkles, AlertTriangle, Activity, RefreshCw, Coins } from 'lucide-react';

import { formatMoney } from '../lib/format';
import { apiCall } from '../lib/api';
import { ModalShell } from './ModalShell';
import { usePrivacy } from '../context/PrivacyContext';
import type { Asset } from '../types';

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
  ai_sentiment?: 'Positivo' | 'Neutro' | 'Negativo' | string | null;
  rationale: string;
}

interface ServerRebalanceResult {
  status: string;
  msg?: string;
  total_atual: number;
  aporte_mensal: number;
  total_apos_aporte: number;
  sobra?: number;
  reserva_sobra?: number;
  sugestoes: ServerSuggestion[];
}

interface SmartAllocationModalProps {
  isOpen: boolean;
  onClose: () => void;
  ativos?: Asset[];
}

export const SmartAllocationModal = ({ isOpen, onClose, ativos = [] }: SmartAllocationModalProps) => {
  const { isHidden } = usePrivacy() as { isHidden: boolean };
  const [amountStr, setAmountStr] = useState('');
  const [reinvestDividends, setReinvestDividends] = useState(true);
  const [maxAssetPct, setMaxAssetPct] = useState<string>('20');
  const [monthDividends, setMonthDividends] = useState(0);
  const [serverResult, setServerResult] = useState<ServerRebalanceResult | null>(null);
  const [serverLoading, setServerLoading] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    const now = new Date();
    const ymPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    apiCall<{ date?: string; total?: number }[]>('/api/dividends/history')
      .then((rows) => {
        if (!active || !Array.isArray(rows)) return;
        const sum = rows
          .filter((d) => d.date && d.date.startsWith(ymPrefix))
          .reduce((acc, d) => acc + (Number(d.total) || 0), 0);
        setMonthDividends(Number(sum.toFixed(2)));
      })
      .catch(() => {
        if (active) setMonthDividends(0);
      });
    return () => {
      active = false;
    };
  }, [isOpen]);

  const parseCurrency = (v: string) => {
    if (!v) return 0;
    const clean = v.replace(/[^\d,.]/g, '');
    const hasComma = clean.includes(',');
    const hasDot = clean.includes('.');

    if (hasComma && hasDot) {
      const lastComma = clean.lastIndexOf(',');
      const lastDot = clean.lastIndexOf('.');
      if (lastComma > lastDot) {
        return Number(clean.replace(/\./g, '').replace(',', '.')) || 0;
      } else {
        return Number(clean.replace(/,/g, '')) || 0;
      }
    }

    if (hasComma) {
      const parts = clean.split(',');
      if (parts.length > 2 || (parts.length === 2 && parts[1].length !== 2)) {
        return Number(clean.replace(/,/g, '')) || 0;
      }
      return Number(clean.replace(',', '.')) || 0;
    }

    if (hasDot) {
      const parts = clean.split('.');
      if (parts.length > 2 || (parts.length === 2 && parts[1].length !== 2)) {
        return Number(clean.replace(/\./g, '')) || 0;
      }
      return Number(clean) || 0;
    }

    const n = Number(clean);
    return Number.isFinite(n) ? n : 0;
  };

  const baseInput = parseCurrency(amountStr);
  const extraDividends = reinvestDividends ? monthDividends : 0;
  const effectiveContribution = baseInput + extraDividends;

  const handleSimulate = useCallback(async () => {
    const amount = parseCurrency(amountStr) + (reinvestDividends ? monthDividends : 0);
    if (!amount || amount <= 0) return;
    setServerLoading(true);
    setServerError(null);
    setServerResult(null);
    try {
      const data = await apiCall<ServerRebalanceResult>('/api/smart-rebalance', {
        method: 'POST',
        body: JSON.stringify({
          aporte_mensal: amount,
          max_asset_pct: maxAssetPct ? Number(maxAssetPct) : null,
        }),
      });
      if (data.status === 'Sucesso') setServerResult(data);
      else setServerError(data.msg || 'Erro no servidor.');
    } catch {
      setServerError('Falha ao conectar ao servidor.');
    } finally {
      setServerLoading(false);
    }
  }, [amountStr, reinvestDividends, monthDividends, maxAssetPct]);

  const estimatedPassiveDelta = useMemo(() => {
    if (!serverResult) return 0;
    const assetByTicker = new Map(ativos.map((a) => [a.ticker.toUpperCase(), a]));
    return serverResult.sugestoes
      .filter((s) => s.action === 'COMPRAR' && s.suggested_value > 0)
      .reduce((acc, s) => {
        const asset = assetByTicker.get(s.ticker.toUpperCase());
        if (!asset) return acc;
        let monthlyYield = 0;
        if (asset.renda_mensal_est && asset.total_atual > 0) {
          monthlyYield = asset.renda_mensal_est / asset.total_atual;
        } else if (asset.manual_dy && asset.manual_dy > 0) {
          monthlyYield = asset.manual_dy / 12;
        }
        return acc + s.suggested_value * monthlyYield;
      }, 0);
  }, [serverResult, ativos]);

  if (!isOpen) return null;

  const maskMoney = (v: number) => (isHidden ? 'R$ •••••' : formatMoney(v));
  const totalAlocado = serverResult ? serverResult.sugestoes.reduce((acc, s) => acc + s.suggested_value, 0) : 0;
  const sobra = Math.max(0, Number((effectiveContribution - totalAlocado).toFixed(2)));
  const highSobra = sobra > (effectiveContribution * 0.05) && sobra > 100;

  return (
    <ModalShell
      onClose={onClose}
      title="Simulador Inteligente"
      subtitle="Algoritmo de alocação institucional."
      icon={<Sparkles size={18} />}
      maxWidth="2xl"
      zIndex={60}
      footer={
        serverResult && !serverLoading ? (
          <div className="flex flex-col">
            {highSobra && (
              <div className="bg-status-warning/10 px-4 py-2 flex items-start gap-2 border-b border-status-warning/20 rounded-t-xl mb-4">
                <AlertTriangle className="text-status-warning mt-0.5" size={14} />
                <div>
                  <p className="text-2xs font-semibold text-status-warning uppercase">Proteção de Capital</p>
                  <p className="text-2xs text-text-muted leading-tight tabular-nums">
                    <b>{formatMoney(sobra)}</b> preservados. Motivos: Efeito de arredondamento de lotes/unidades (compras apenas em unidades inteiras, com exceção da aba Reserva).
                  </p>
                </div>
              </div>
            )}

            <div className="flex justify-between items-center gap-4">
              <div className="flex flex-col">
                <span className="text-2xs font-semibold text-text-muted uppercase tracking-wider">Total Alocado</span>
                <span className="text-xl font-semibold text-status-success font-mono tabular-nums tracking-tight">{maskMoney(totalAlocado)}</span>
              </div>
              <div className="h-8 w-px bg-border-subtle"></div>
              <div className="flex flex-col items-center">
                <span className="text-2xs font-semibold text-text-muted uppercase tracking-wider">+Renda Passiva Est.</span>
                <span className="text-sm font-semibold text-accent font-mono tabular-nums tracking-tight">+{maskMoney(estimatedPassiveDelta)}/mês</span>
              </div>
              <div className="h-8 w-px bg-border-subtle"></div>
              <div className="flex flex-col items-end">
                <span className="text-2xs font-semibold text-text-muted uppercase tracking-wider">Sobrou (Caixa)</span>
                <span className={`text-lg font-semibold font-mono tabular-nums tracking-tight ${highSobra ? 'text-status-warning' : 'text-text-primary'}`}>{maskMoney(sobra)}</span>
              </div>
            </div>
          </div>
        ) : undefined
      }
    >
      <div className="space-y-8">
          <div className="flex flex-col items-center gap-6 pt-4">
            <div className="relative w-full max-w-sm group">
              <div className="relative flex items-center bg-surface-input border border-border-subtle rounded-xl p-2 transition-colors group-focus-within:border-accent">
                <span className="pl-4 text-text-muted font-semibold text-lg">R$</span>
                <input
                  type="text"
                  value={amountStr}
                  onChange={(e) => setAmountStr(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSimulate()}
                  placeholder="0,00"
                  className="w-full bg-transparent border-none text-text-primary font-mono tabular-nums text-2xl font-semibold p-3 focus:ring-0 outline-none text-center placeholder:text-text-muted/50"
                  autoFocus
                />
              </div>
            </div>
            
            {/* Range Slider para Aporte */}
            <div className="w-full max-w-sm px-2">
              <input
                type="range"
                min="0"
                max="50000"
                step="500"
                value={parseCurrency(amountStr)}
                onChange={(e) => setAmountStr(Number(e.target.value).toLocaleString('pt-BR', { minimumFractionDigits: 2 }))}
                className="w-full h-1.5 bg-surface-input rounded-lg appearance-none cursor-pointer accent-accent focus:outline-none"
              />
              <div className="flex justify-between text-2xs text-text-muted mt-1 uppercase font-semibold tracking-wider tabular-nums">
                <span>R$ 0</span>
                <span>R$ 50k</span>
              </div>
            </div>

            <div className="w-full max-w-sm flex items-center justify-between gap-3 bg-surface-elevated border border-border-subtle rounded-xl px-3.5 py-2 text-xs">
              <label htmlFor="smart-max-asset-pct" className="text-text-muted font-semibold">
                Concentração máx. por ativo
              </label>
              <select
                id="smart-max-asset-pct"
                value={maxAssetPct}
                onChange={(e) => setMaxAssetPct(e.target.value)}
                className="bg-surface-input border border-border-subtle rounded-lg px-2.5 py-1 text-text-primary font-mono font-semibold text-xs focus:outline-none focus:border-accent"
              >
                <option value="">Sem trava</option>
                <option value="10">10%</option>
                <option value="15">15%</option>
                <option value="20">20%</option>
                <option value="25">25%</option>
              </select>
            </div>

            {monthDividends > 0 && (
              <label className="flex items-center gap-2 text-xs text-text-primary cursor-pointer bg-status-success/10 border border-status-success/20 rounded-xl px-3.5 py-2">
                <input
                  type="checkbox"
                  checked={reinvestDividends}
                  onChange={(e) => setReinvestDividends(e.target.checked)}
                  className="accent-status-success rounded"
                />
                <Coins size={14} className="text-status-success" />
                <span className="tabular-nums">
                  Reinvestir proventos do mês (<strong>+{maskMoney(monthDividends)}</strong>)
                </span>
              </label>
            )}

            <button
              onClick={handleSimulate}
              disabled={effectiveContribution <= 0}
              className="bg-accent hover:bg-accent/90 text-white px-8 py-3 rounded-lg font-semibold flex items-center gap-2 transition-colors active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed w-full max-w-sm justify-center disabled:grayscale"
            >
              <Calculator size={18} />
              Gerar Recomendação
            </button>
          </div>

          {serverError && (
            <div className="bg-status-error/10 border border-status-error/30 rounded-xl p-3 text-sm text-status-error flex items-center gap-2">
              <AlertTriangle size={14} /> {serverError}
            </div>
          )}

          {serverLoading && (
            <div className="flex items-center justify-center gap-2 py-8 text-text-muted">
              <RefreshCw size={16} className="animate-spin" />
              <span className="text-sm">Calculando com dados de correlação...</span>
            </div>
          )}

          {serverResult && !serverLoading && (
            <div className="space-y-4">
              {/* Resumo do aporte */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'Patrimônio Atual', value: maskMoney(serverResult.total_atual) },
                  { label: 'Aporte', value: maskMoney(serverResult.aporte_mensal) },
                  { label: 'Total Pós-Aporte', value: maskMoney(serverResult.total_apos_aporte) },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-surface-elevated border border-border-subtle rounded-xl p-3 text-center">
                    <p className="text-2xs text-text-muted uppercase font-semibold mb-1">{label}</p>
                    <p className="text-sm font-semibold text-text-primary font-mono tabular-nums">{value}</p>
                  </div>
                ))}
              </div>

              {/* Tabela de sugestões */}
              <div className="flex justify-between items-center border-b border-border-subtle pb-2">
                <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
                  <Activity size={14} className="text-accent" /> Rebalanceamento com Correlação
                </h3>
                <span className="text-2xs bg-surface-input text-text-muted px-2 py-1 rounded-md border border-border-subtle tabular-nums">
                  {serverResult.sugestoes.filter(s => s.action === 'COMPRAR').length} ordens
                </span>
              </div>

              <div className="space-y-2">
                {serverResult.sugestoes.filter(s => s.action === 'COMPRAR').map(s => (
                  <div key={s.ticker} className="p-3 bg-surface-elevated border border-border-subtle rounded-xl hover:border-accent/40 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`/api/assets/icon/${encodeURIComponent(s.ticker)}?v=2`}
                          alt={`Ícone ${s.ticker}`}
                          className="w-8 h-8 rounded-full bg-surface-input object-cover"
                          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                        <div>
                          <div className="flex items-center gap-1.5">
                            <p className="font-semibold text-text-primary text-sm">{s.ticker}</p>
                            {s.ai_sentiment && (() => {
                              const sentKey = s.ai_sentiment.trim().toLowerCase();
                              return (
                                <span
                                  className={`text-2xs font-semibold uppercase px-1.5 py-0.5 rounded-md border ${
                                    sentKey === 'positivo'
                                      ? 'bg-status-success/10 text-status-success border-status-success/30'
                                      : sentKey === 'negativo'
                                      ? 'bg-status-error/10 text-status-error border-status-error/30'
                                      : 'bg-surface-input text-text-muted border-border-subtle'
                                  }`}
                                >
                                  IA: {s.ai_sentiment}
                                </span>
                              );
                            })()}
                          </div>
                          <p className="text-2xs text-text-muted">{s.category}</p>
                        </div>
                      </div>
                      <div className="text-right tabular-nums">
                        <p className="text-sm font-semibold text-status-success font-mono">{maskMoney(s.suggested_value)}</p>
                        <p className="text-2xs text-text-muted">
                          {s.lot_size > 0 ? `${s.suggested_lots} lote(s)` : 'Caixinha (R$)'}
                        </p>
                      </div>
                    </div>
                    {/* Barra de gap vs meta */}
                    <div className="mt-2 space-y-1">
                      <div className="flex justify-between text-2xs text-text-muted tabular-nums">
                        <span>Atual {s.current_pct.toFixed(1)}% → Meta {s.target_pct.toFixed(1)}%</span>
                        {s.corr_penalty > 0 && (
                          <div className="relative group/cp flex items-center gap-1 text-status-warning cursor-help">
                            <span>Penalidade corr. -{(s.corr_penalty * 100).toFixed(1)}%</span>
                            <div className="absolute bottom-full right-0 mb-1 hidden group-hover/cp:block w-48 p-2 bg-surface-card text-text-primary text-2xs rounded-xl shadow-lg border border-border-subtle z-50 font-normal leading-tight normal-case">
                              Ativo muito correlacionado aos que você já tem na carteira. O algoritmo reduz o peso recomendado para aumentar sua diversificação real.
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="h-1 bg-surface-input rounded-full overflow-hidden">
                        <div
                          className="h-full bg-accent rounded-full"
                          style={{ width: `${s.target_pct > 0 ? Math.min(100, (s.current_pct / s.target_pct) * 100) : 100}%` }}
                        />
                      </div>
                      <p className="text-2xs text-text-muted mt-0.5">{s.rationale}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Ativos acima da meta */}
              {serverResult.sugestoes.filter(s => s.action === 'MANTER').length > 0 && (
                <div className="text-2xs text-text-muted border-t border-border-subtle pt-2">
                  <p className="font-semibold text-text-muted mb-1">Acima da meta (manter):</p>
                  <div className="flex flex-wrap gap-1.5">
                    {serverResult.sugestoes.filter(s => s.action === 'MANTER').map(s => (
                      <span key={s.ticker} className="bg-surface-input border border-border-subtle rounded-md px-2 py-0.5 text-text-muted text-2xs">{s.ticker}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {amountStr !== '' && serverResult && serverResult.sugestoes.filter(s => s.action === 'COMPRAR').length === 0 && !serverLoading && parseCurrency(amountStr) > 0 && (
            <div className="text-center py-8 text-text-muted border-t border-border-subtle flex flex-col items-center gap-2">
              <AlertTriangle className="text-text-muted" size={24} />
              <p className="text-xs italic">
                Não foi possível alocar este valor.<br />
                O montante pode ser insuficiente para comprar 1 cota ou os limites de segurança foram atingidos.
              </p>
            </div>
          )}
        </div>
    </ModalShell>
  );
};
