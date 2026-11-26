export interface RiskMetrics {
  status: string;
  msg?: string;
  benchmark: string;
  periodo: string;
  n_pregoes: number;
  taxa_livre_risco_pct: number;
  beta: number;
  alpha_anual_pct: number;
  sharpe_12m: number;
  sortino_12m: number;
  calmar_ratio: number;
  retorno_anual_pct: number;
  retorno_benchmark_pct: number;
  volatilidade_anual_pct: number;
  max_drawdown_pct: number;
  var_95_daily_pct: number;
  var_95_monthly_pct: number;
  cvar_95_daily_pct: number;
  cvar_95_monthly_pct: number;
  tracking_error_pct: number;
  drawdown_chart: { date: string; drawdown: number }[];
  sectors_alloc?: {
    sector: string;
    value: number;
    percent: number;
    assets?: { ticker: string; value: number; percent: number }[];
  }[];
  leverage_ratio?: number;
  leveraged_assets?: { ticker: string; leverage: number; value: number }[];
  usd_exposure_pct?: number;
  usd_assets?: { ticker: string; value: number }[];
  usd_hedge_suggestion?: string;
  upside_capture_pct?: number;
  downside_capture_pct?: number;
  fii_credit_map?: {
    ticker: string;
    category?: string;
    rating: string;
    duration: number | null;
    indexers: Record<string, number>;
    p_vp?: string | null;
    alavancagem?: string | null;
    caixa_pct?: string | null;
    has_report_pdf?: boolean;
  }[];
  interpretacao: {
    beta: string;
    sharpe: string;
    drawdown: string;
    alpha: string;
  };
}

export function colorByValue(v: number, goodPositive = true): string {
  if (goodPositive) return v > 0 ? 'text-status-success' : v < 0 ? 'text-status-error' : 'text-text-muted';
  return v > 0 ? 'text-status-error' : v < 0 ? 'text-status-success' : 'text-text-muted';
}
