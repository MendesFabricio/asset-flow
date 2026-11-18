'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  BellPlus,
  CheckCircle2,
  HelpCircle,
  RefreshCw,
  ShieldCheck,
  Sliders,
  Sparkles,
  TrendingUp,
  XCircle,
} from 'lucide-react';
import { apiCall } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { useToast } from '@/context/ToastContext';
import { ValuationAssetData } from '@/types';

interface ValuationPanelProps {
  ticker: string;
  assetType?: string;
  compact?: boolean;
}

function MarginBadge({ pct }: { pct: number | null | undefined }) {
  if (pct === null || pct === undefined) {
    return <span className="text-[10px] text-text-muted">N/D</span>;
  }
  const cls =
    pct >= 10
      ? 'bg-status-success/10 text-status-success border-status-success/30'
      : pct >= 0
      ? 'bg-accent-soft text-accent border-accent/30'
      : 'bg-status-error/10 text-status-error border-status-error/30';
  return (
    <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border ${cls}`}>
      {pct > 0 ? '+' : ''}
      {pct.toFixed(1)}%
    </span>
  );
}

function ChecklistStatusIcon({ status }: { status: 'pass' | 'warn' | 'fail' | 'unknown' }) {
  if (status === 'pass') return <CheckCircle2 size={14} className="text-status-success shrink-0" />;
  if (status === 'warn') return <AlertTriangle size={14} className="text-status-warning shrink-0" />;
  if (status === 'fail') return <XCircle size={14} className="text-status-error shrink-0" />;
  return <HelpCircle size={14} className="text-text-muted shrink-0" />;
}

export function ValuationPanel({ ticker, assetType, compact = false }: ValuationPanelProps) {
  const { notify } = useToast();
  const defaultBazin = assetType === 'FII' ? 8.0 : 6.0;
  const [bazinDy, setBazinDy] = useState<number>(defaultBazin);
  const [discountRate, setDiscountRate] = useState<number>(12.5);
  const [growthRate, setGrowthRate] = useState<number>(7.0);
  const [terminalGrowth, setTerminalGrowth] = useState<number>(3.0);
  const [showAssumptions, setShowAssumptions] = useState<boolean>(!compact);
  const [creatingAlert, setCreatingAlert] = useState<boolean>(false);

  const [data, setData] = useState<ValuationAssetData | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchValuation = useCallback(
    async (force = false) => {
      if (!ticker) return;
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          bazin_dy: String(bazinDy),
          discount_rate: String(discountRate),
          growth_rate: String(growthRate),
          terminal_growth: String(terminalGrowth),
        });
        if (force) params.set('force', 'true');
        const res = await apiCall<{ status: string; data?: ValuationAssetData; msg?: string }>(
          `/api/valuation/asset/${encodeURIComponent(ticker)}?${params.toString()}`,
          { timeout: 45000 }
        );
        if (res.status === 'Sucesso' && res.data) {
          setData(res.data);
        } else {
          setError(res.msg || 'Dados fundamentalistas indisponíveis.');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao carregar valuation.');
      } finally {
        setLoading(false);
      }
    },
    [ticker, bazinDy, discountRate, growthRate, terminalGrowth]
  );

  useEffect(() => {
    setBazinDy(assetType === 'FII' ? 8.0 : 6.0);
  }, [ticker, assetType]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchValuation(false);
    }, 180);
    return () => clearTimeout(timer);
  }, [fetchValuation]);

  if (loading && !data) {
    return (
      <div className="p-4 rounded-xl bg-surface-elevated border border-border-subtle text-xs text-text-muted flex items-center gap-2">
        <RefreshCw size={14} className="animate-spin text-accent" />
        Calculando Preço Teto, DCF e Checklist de {ticker}...
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="p-3 rounded-xl bg-status-error/10 border border-status-error/30 text-xs text-status-error flex items-center justify-between gap-2">
        <span>{error}</span>
        <button
          type="button"
          onClick={() => fetchValuation(true)}
          className="px-2.5 py-1 rounded bg-surface-card border border-border-subtle text-text-primary hover:border-accent text-[11px] font-semibold"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  if (!data) return null;

  const qualityScore = data.quality_score || 0;
  const qualityColor =
    qualityScore >= 75
      ? 'text-status-success bg-status-success'
      : qualityScore >= 50
      ? 'text-status-warning bg-status-warning'
      : 'text-status-error bg-status-error';

  const sectorAvg = data.sector_average;
  const divHist = data.dividend_history_5y || [];
  const maxDivYear = divHist.length > 0 ? Math.max(...divHist.map((d) => d.total), 0.01) : 1;

  const handleCreateBazinAlert = async () => {
    if (!data.bazin_price || data.bazin_price <= 0) return;
    setCreatingAlert(true);
    try {
      const res = await apiCall<{ status: string; message?: string }>('/api/price-alerts', {
        method: 'POST',
        body: JSON.stringify({
          ticker: data.ticker,
          target_price: data.bazin_price,
          condition: 'BELOW',
          note: `Preço Teto Bazin (${bazinDy.toFixed(1)}% DY)`,
        }),
      });
      if (res.status === 'Sucesso') {
        notify(`Alerta criado: ${data.ticker} abaixo de ${formatMoney(data.bazin_price)}!`, 'success');
      } else {
        notify(res.message || 'Não foi possível criar o alerta.', 'error');
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Erro ao criar alerta de preço teto.', 'error');
    } finally {
      setCreatingAlert(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header do Score de Qualidade + Ações */}
      <div className="p-3.5 rounded-xl bg-surface-elevated border border-border-subtle space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ShieldCheck size={16} className="text-accent shrink-0" />
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-text-primary">
                Qualidade & Valuation
              </h4>
              <p className="text-[11px] text-text-muted">
                {data.sector} • {data.asset_type}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-lg font-mono font-extrabold text-text-primary tabular-nums">
              {qualityScore}
              <span className="text-[11px] text-text-muted font-normal">/100</span>
            </span>
            <button
              type="button"
              onClick={() => setShowAssumptions((prev) => !prev)}
              title="Ajustar premissas de Preço Teto e DCF"
              className="p-1.5 rounded-lg bg-surface-input border border-border-subtle text-text-muted hover:text-text-primary hover:border-accent transition-colors"
            >
              <Sliders size={13} />
            </button>
            <button
              type="button"
              onClick={() => fetchValuation(true)}
              title="Atualizar dados do Yahoo Finance"
              className="p-1.5 rounded-lg bg-surface-input border border-border-subtle text-text-muted hover:text-text-primary hover:border-accent transition-colors"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        <div className="w-full h-2 rounded-full bg-surface-input overflow-hidden">
          <div
            className={`h-full transition-all duration-500 ${qualityColor.split(' ')[1]}`}
            style={{ width: `${Math.max(4, qualityScore)}%` }}
          />
        </div>
      </div>

      {/* Sliders interativos de Premissas */}
      {showAssumptions && (
        <div className="p-3.5 rounded-xl bg-surface-elevated border border-border-subtle grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <label className="space-y-1">
            <div className="flex justify-between text-text-muted">
              <span>DY Mínimo Bazin</span>
              <span className="font-mono font-bold text-text-primary">{bazinDy.toFixed(1)}%</span>
            </div>
            <input
              type="range"
              aria-label="DY Mínimo Bazin"
              min="4"
              max="14"
              step="0.5"
              value={bazinDy}
              onChange={(e) => setBazinDy(Number(e.target.value))}
              className="w-full accent-accent"
            />
          </label>

          <label className="space-y-1">
            <div className="flex justify-between text-text-muted">
              <span>Taxa de Desconto (Ke/WACC)</span>
              <span className="font-mono font-bold text-text-primary">{discountRate.toFixed(1)}%</span>
            </div>
            <input
              type="range"
              aria-label="Taxa de Desconto Ke/WACC"
              min="8"
              max="20"
              step="0.5"
              value={discountRate}
              onChange={(e) => setDiscountRate(Number(e.target.value))}
              className="w-full accent-accent"
            />
          </label>

          <label className="space-y-1">
            <div className="flex justify-between text-text-muted">
              <span>Crescimento 5 anos (g)</span>
              <span className="font-mono font-bold text-text-primary">{growthRate.toFixed(1)}%</span>
            </div>
            <input
              type="range"
              aria-label="Crescimento em 5 anos"
              min="0"
              max="18"
              step="0.5"
              value={growthRate}
              onChange={(e) => setGrowthRate(Number(e.target.value))}
              className="w-full accent-accent"
            />
          </label>

          <label className="space-y-1">
            <div className="flex justify-between text-text-muted">
              <span>Cresc. Perpétuo DCF</span>
              <span className="font-mono font-bold text-text-primary">{terminalGrowth.toFixed(1)}%</span>
            </div>
            <input
              type="range"
              aria-label="Crescimento Perpétuo DCF"
              min="0"
              max="7"
              step="0.5"
              value={terminalGrowth}
              onChange={(e) => setTerminalGrowth(Number(e.target.value))}
              className="w-full accent-accent"
            />
          </label>
        </div>
      )}

      {/* Grid de Preço Justo (Bazin, Graham, Gordon, DCF) */}
      <div className="grid grid-cols-2 gap-2.5">
        <div className="p-3 rounded-xl bg-surface-card border border-border-subtle space-y-1">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
              Teto Bazin ({bazinDy.toFixed(0)}%)
            </span>
            <MarginBadge pct={data.margin_bazin_pct} />
          </div>
          <p className="text-sm font-mono font-bold text-text-primary">
            {data.bazin_price ? formatMoney(data.bazin_price) : 'N/D'}
          </p>
          <div className="flex items-center justify-between gap-1">
            <p className="text-[10px] text-text-muted">
              Div./cota: {data.dividend_per_share ? formatMoney(data.dividend_per_share) : 'N/D'}
            </p>
            {data.bazin_price && (
              <button
                type="button"
                onClick={handleCreateBazinAlert}
                disabled={creatingAlert}
                title="Criar alerta quando cotação cair abaixo do Preço Teto Bazin"
                className="text-[10px] font-bold text-accent hover:underline inline-flex items-center gap-0.5 disabled:opacity-50"
              >
                <BellPlus size={11} /> Alerta
              </button>
            )}
          </div>
        </div>

        <div className="p-3 rounded-xl bg-surface-card border border-border-subtle space-y-1">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
              {data.asset_type === 'FII' ? 'P/VP Justo' : 'V.I. Graham'}
            </span>
            {data.asset_type === 'Ação' && <MarginBadge pct={data.margin_graham_pct} />}
          </div>
          <p className="text-sm font-mono font-bold text-text-primary">
            {data.asset_type === 'FII'
              ? data.vpa
                ? formatMoney(data.vpa)
                : 'N/D'
              : data.graham_price
              ? formatMoney(data.graham_price)
              : 'N/D'}
          </p>
          <p className="text-[10px] text-text-muted">
            P/VP: {data.pvp ? `${data.pvp.toFixed(2)}x` : 'N/D'}
          </p>
        </div>

        <div className="p-3 rounded-xl bg-surface-card border border-border-subtle space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted block">
            Modelo Gordon
          </span>
          <p className="text-sm font-mono font-bold text-text-primary">
            {data.gordon_price ? formatMoney(data.gordon_price) : 'N/D'}
          </p>
          <p className="text-[10px] text-text-muted">DY 12m: {data.dy_12m ? `${data.dy_12m.toFixed(2)}%` : 'N/D'}</p>
        </div>

        <div className="p-3 rounded-xl bg-surface-card border border-border-subtle space-y-1">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
              DCF / FCD (5a)
            </span>
            <MarginBadge pct={data.margin_dcf_pct} />
          </div>
          <p className="text-sm font-mono font-bold text-text-primary">
            {data.dcf_price ? formatMoney(data.dcf_price) : 'N/D'}
          </p>
          <p className="text-[10px] text-text-muted">
            {data.magic_score !== null && data.magic_score !== undefined
              ? `Fórmula Mágica: ${data.magic_score.toFixed(0)} pts`
              : `P/L: ${data.pl ? `${data.pl.toFixed(1)}x` : 'N/D'}`}
          </p>
        </div>
      </div>

      {/* Histórico Anual de Proventos (5 Anos) */}
      {divHist.length > 0 && (
        <div className="p-3.5 rounded-xl bg-surface-card border border-border-subtle space-y-2.5">
          <h5 className="text-[11px] font-bold uppercase tracking-wider text-text-muted">
            Proventos por Cota/Ação (Últimos {divHist.length} Anos)
          </h5>
          <div className="grid grid-cols-5 gap-2 items-end h-20 pt-2">
            {divHist.map((d) => {
              const pct = Math.max(12, Math.round((d.total / maxDivYear) * 100));
              return (
                <div key={d.year} className="flex flex-col items-center justify-end h-full gap-1">
                  <span className="text-[9px] font-mono text-text-primary font-semibold">
                    {formatMoney(d.total)}
                  </span>
                  <div className="w-full max-w-[28px] bg-surface-input rounded-t overflow-hidden flex items-end h-10">
                    <div
                      className="w-full bg-status-success rounded-t transition-all duration-500"
                      style={{ height: `${pct}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-mono text-text-muted">{d.year}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Checklist de Saúde Financeira */}
      {data.checklist && data.checklist.length > 0 && (
        <div className="p-3.5 rounded-xl bg-surface-card border border-border-subtle space-y-2">
          <h5 className="text-[11px] font-bold uppercase tracking-wider text-text-muted flex items-center gap-1.5">
            <Sparkles size={13} className="text-accent" />
            Checklist de Saúde Fundamentalista
          </h5>
          <div className="divide-y divide-border-subtle">
            {data.checklist.map((item) => (
              <div key={item.key} className="py-2 flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <ChecklistStatusIcon status={item.status} />
                  <div className="min-w-0">
                    <p className="font-semibold text-text-primary truncate">{item.label}</p>
                    <p className="text-[10px] text-text-muted truncate">{item.rule}</p>
                  </div>
                </div>
                <span className="font-mono font-bold text-text-primary shrink-0">{item.formatted}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Comparação com Média do Setor */}
      {sectorAvg && sectorAvg.count > 1 && (
        <div className="p-3.5 rounded-xl bg-surface-elevated border border-border-subtle space-y-2">
          <h5 className="text-[11px] font-bold uppercase tracking-wider text-text-muted flex items-center gap-1.5">
            <TrendingUp size={13} className="text-accent" />
            Ativo vs Mediana do Setor ({sectorAvg.count} pares)
          </h5>
          <div className="grid grid-cols-3 gap-2 text-[11px]">
            <div className="p-2 rounded-lg bg-surface-card border border-border-subtle text-center">
              <p className="text-text-muted">DY 12m</p>
              <p className="font-mono font-bold text-text-primary">
                {data.dy_12m !== null ? `${data.dy_12m.toFixed(1)}%` : 'N/D'}
              </p>
              <p className="text-[10px] text-text-muted">
                Setor: {sectorAvg.dy_12m !== null ? `${sectorAvg.dy_12m.toFixed(1)}%` : 'N/D'}
              </p>
            </div>
            <div className="p-2 rounded-lg bg-surface-card border border-border-subtle text-center">
              <p className="text-text-muted">{data.asset_type === 'FII' ? 'P/VP' : 'P/L'}</p>
              <p className="font-mono font-bold text-text-primary">
                {data.asset_type === 'FII'
                  ? data.pvp !== null ? `${data.pvp.toFixed(2)}x` : 'N/D'
                  : data.pl !== null ? `${data.pl.toFixed(1)}x` : 'N/D'}
              </p>
              <p className="text-[10px] text-text-muted">
                Setor:{' '}
                {data.asset_type === 'FII'
                  ? sectorAvg.pvp !== null ? `${sectorAvg.pvp.toFixed(2)}x` : 'N/D'
                  : sectorAvg.pl !== null ? `${sectorAvg.pl.toFixed(1)}x` : 'N/D'}
              </p>
            </div>
            <div className="p-2 rounded-lg bg-surface-card border border-border-subtle text-center">
              <p className="text-text-muted">{data.asset_type === 'FII' ? 'Qualidade' : 'ROE'}</p>
              <p className="font-mono font-bold text-text-primary">
                {data.asset_type === 'FII'
                  ? `${data.quality_score}/100`
                  : data.roe !== null ? `${data.roe.toFixed(1)}%` : 'N/D'}
              </p>
              <p className="text-[10px] text-text-muted">
                Setor:{' '}
                {data.asset_type === 'FII'
                  ? sectorAvg.quality_score !== null ? `${sectorAvg.quality_score.toFixed(0)}/100` : 'N/D'
                  : sectorAvg.roe !== null ? `${sectorAvg.roe.toFixed(1)}%` : 'N/D'}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
