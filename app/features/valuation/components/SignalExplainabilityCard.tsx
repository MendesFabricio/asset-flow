'use client';

import React from 'react';
import { ShieldCheck, AlertTriangle, TrendingDown, BarChart3, CheckCircle2, HelpCircle, Target } from 'lucide-react';
import { formatMoney } from '@/lib/format';

export interface SignalTriggerItem {
  metric: string;
  actual: string;
  rule: string;
}

export interface SignalOpportunityV2 {
  ticker: string;
  asset_class: string;
  in_portfolio?: boolean;
  avg_daily_volume_21d?: number | null;
  setup_code: string;
  triggered: boolean;
  confidence_tier: 'ALTA_CERTEZA' | 'MODERADA' | 'BAIXA' | 'INSUFFICIENT_SAMPLE' | string;
  calibrated_prob: number;
  wilson_lb_90?: number;
  wilson_lb_95: number;
  sample_size_n: number;
  oos_sample_n: number;
  win_rate: number;
  expectancy_net: number;
  profit_factor: number | null;
  max_drawdown_mae: number;
  oos_consistency_score: number;
  entry_price?: number;
  target_price?: number;
  target_upside_pct?: number;
  risk_price?: number;
  risk_drawdown_pct?: number;
  horizon_days?: number;
  triggers: SignalTriggerItem[];
}

const SETUP_LABELS: Record<string, { title: string; summary: string }> = {
  VALUE_GRAHAM_BAZIN: {
    title: 'Ação Barata + Bons Dividendos',
    summary: 'Múltiplos descontados (P/L, P/VP ou DY) combinados com preço recuado.',
  },
  QUALITY_GARP: {
    title: 'Empresa Lucrativa com Desconto',
    summary: 'Alta rentabilidade (ROE/Qualidade) em momento de pullback técnico.',
  },
  DEEP_DISCOUNT_OVERSOLD: {
    title: 'Queda Forte (Sobrevenda)',
    summary: 'Ativo esticado abaixo da média de 20 dias com RSI deprimido.',
  },
  FII_TIJOLO_PVP_DISCOUNT: {
    title: 'FII de Tijolo Descontado (P/VP)',
    summary: 'Cota negociando abaixo do valor patrimonial com sinal de suporte.',
  },
  FII_PAPEL_SPREAD_REAL: {
    title: 'FII de Papel / Spread Atrativo',
    summary: 'Bom rendimento relativo com preço descontado na curva recente.',
  },
  ETF_TREND_PULLBACK: {
    title: 'ETF em Tendência de Alta (Recuo)',
    summary: 'Tendência primária positiva com correção temporária de curto prazo.',
  },
  INTL_FX_MEAN_REVERT: {
    title: 'Internacional Abaixo da Média',
    summary: 'Desvio relevante abaixo da média de 50 dias com espaço para reversão.',
  },
};

const TIER_BADGE: Record<string, { label: string; cls: string }> = {
  ALTA_CERTEZA: {
    label: 'ALTA CERTEZA',
    cls: 'text-status-success bg-status-success/10 border-status-success/30',
  },
  MODERADA: {
    label: 'CONFIANÇA MODERADA',
    cls: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
  },
  BAIXA: {
    label: 'BAIXA CONVICÇÃO',
    cls: 'text-status-warning bg-status-warning/10 border-status-warning/30',
  },
  INSUFFICIENT_SAMPLE: {
    label: 'EM OBSERVAÇÃO (AMOSTRA)',
    cls: 'text-text-muted bg-surface-elevated border-border-subtle',
  },
};

export function SignalExplainabilityCard({
  opportunity,
  onSelectTicker,
}: {
  opportunity: SignalOpportunityV2;
  onSelectTicker?: (ticker: string) => void;
}) {
  const badge = TIER_BADGE[opportunity.confidence_tier] || TIER_BADGE.INSUFFICIENT_SAMPLE;
  const setupMeta = SETUP_LABELS[opportunity.setup_code] || { title: opportunity.setup_code, summary: '' };
  const isSampleBlocked = opportunity.sample_size_n < 20 || opportunity.confidence_tier === 'INSUFFICIENT_SAMPLE';
  const hasPricePlan =
    opportunity.entry_price != null && opportunity.target_price != null && opportunity.risk_price != null;

  return (
    <div
      onClick={() => onSelectTicker?.(opportunity.ticker)}
      className={`bg-surface-card border border-border-subtle rounded-2xl p-4 flex flex-col gap-3 transition-colors ${
        onSelectTicker ? 'cursor-pointer hover:border-accent/50' : ''
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono font-black text-sm text-text-primary">{opportunity.ticker}</span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-surface-elevated border border-border-subtle text-text-muted">
              {opportunity.asset_class}
            </span>
            {opportunity.in_portfolio !== undefined && (
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                  opportunity.in_portfolio
                    ? 'bg-accent-soft border-accent/30 text-accent'
                    : 'bg-surface-elevated border-border-subtle text-text-secondary'
                }`}
              >
                {opportunity.in_portfolio ? 'Na Carteira' : 'Mercado'}
              </span>
            )}
          </div>
          <p className="text-xs font-bold text-text-primary mt-1">{setupMeta.title}</p>
          {setupMeta.summary && <p className="text-[11px] text-text-muted">{setupMeta.summary}</p>}
        </div>
        <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase flex items-center gap-1 ${badge.cls}`}>
          {opportunity.confidence_tier === 'ALTA_CERTEZA' ? <ShieldCheck size={11} /> : <HelpCircle size={11} />}
          {badge.label}
        </span>
      </div>

      {hasPricePlan && (
        <div className="grid grid-cols-3 gap-2 p-2.5 rounded-xl bg-surface-elevated/80 border border-border-subtle">
          <div>
            <div className="text-[10px] text-text-muted uppercase">Entrada</div>
            <div className="text-xs sm:text-sm font-mono font-bold text-text-primary">
              {formatMoney(opportunity.entry_price!)}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-text-muted uppercase flex items-center gap-1">
              <Target size={10} className="text-status-success" /> Alvo ({opportunity.horizon_days || 90}d)
            </div>
            <div className="text-xs sm:text-sm font-mono font-bold text-status-success">
              {formatMoney(opportunity.target_price!)}{' '}
              <span className="text-[10px]">(+{opportunity.target_upside_pct?.toFixed(1)}%)</span>
            </div>
          </div>
          <div>
            <div className="text-[10px] text-text-muted uppercase">Risco Típico</div>
            <div className="text-xs sm:text-sm font-mono font-bold text-status-error">
              {formatMoney(opportunity.risk_price!)}{' '}
              <span className="text-[10px]">({opportunity.risk_drawdown_pct?.toFixed(1)}%)</span>
            </div>
          </div>
        </div>
      )}

      {isSampleBlocked && (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-elevated border border-border-subtle text-[11px] text-text-muted">
          <AlertTriangle size={12} className="text-status-warning shrink-0" />
          <span>
            Selo forte bloqueado: apenas <strong>{opportunity.sample_size_n}</strong> episódio(s) independente(s) (mín. 20 / 8 OOS).
          </span>
        </div>
      )}

      {/* Métricas Estatísticas Calibradas */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="bg-surface-elevated border border-border-subtle rounded-xl p-2">
          <div className="text-[10px] text-text-muted uppercase">Chance Mín. (Wilson)</div>
          <div className="text-sm font-mono font-bold text-text-primary">
            {(opportunity.wilson_lb_95 * 100).toFixed(1)}%
          </div>
          <div className="text-[9px] text-text-muted">
            Bruto {(opportunity.win_rate * 100).toFixed(1)}% · {opportunity.sample_size_n} casos
          </div>
        </div>
        <div className="bg-surface-elevated border border-border-subtle rounded-xl p-2">
          <div className="text-[10px] text-text-muted uppercase">Prob. Esperada</div>
          <div className="text-sm font-mono font-bold text-accent">
            {(opportunity.calibrated_prob * 100).toFixed(1)}%
          </div>
          <div className="text-[9px] text-text-muted">OOS N={opportunity.oos_sample_n}</div>
        </div>
        <div className="bg-surface-elevated border border-border-subtle rounded-xl p-2">
          <div className="text-[10px] text-text-muted uppercase flex items-center gap-1">
            <BarChart3 size={10} /> Ganho Médio Líq.
          </div>
          <div className={`text-sm font-mono font-bold ${opportunity.expectancy_net > 0 ? 'text-status-success' : 'text-status-error'}`}>
            {opportunity.expectancy_net > 0 ? '+' : ''}
            {(opportunity.expectancy_net * 100).toFixed(2)}%
          </div>
          <div className="text-[9px] text-text-muted">
            PF {opportunity.profit_factor != null ? opportunity.profit_factor.toFixed(2) : '—'}
          </div>
        </div>
        <div className="bg-surface-elevated border border-border-subtle rounded-xl p-2">
          <div className="text-[10px] text-text-muted uppercase flex items-center gap-1">
            <TrendingDown size={10} /> Queda Máx. (MAE)
          </div>
          <div className="text-sm font-mono font-bold text-status-error">
            {(opportunity.max_drawdown_mae * 100).toFixed(1)}%
          </div>
          <div className="text-[9px] text-text-muted">Consist. {(opportunity.oos_consistency_score * 100).toFixed(0)}%</div>
        </div>
      </div>

      {/* Gatilhos que dispararam */}
      {opportunity.triggers && opportunity.triggers.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1 border-t border-border-subtle">
          {opportunity.triggers.map((t, idx) => (
            <span
              key={`${t.metric}-${idx}`}
              className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg bg-surface-elevated border border-border-subtle text-text-secondary font-mono"
            >
              <CheckCircle2 size={10} className="text-status-success shrink-0" />
              <strong>{t.metric}:</strong> {t.actual} ({t.rule})
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
