// app/types.ts
export interface Alerta {
  titulo: string;
  significado: string;
  acao: string;
}

export interface Asset {
  id?: number;
  ticker: string;
  tipo: string;
  qtd: number;
  pm: number;
  meta: number;
  preco_atual: number;
  min_6m: number;
  change_percent?: number;
  
  // Valores calculados
  total_atual: number;
  total_investido: number;
  lucro_valor: number;
  lucro_pct: number;
  pct_na_categoria: number;
  falta_comprar: number;
  
  // Estratégia
  recomendacao: string;
  status: 'COMPRA_FORTE' | 'COMPRAR' | 'AGUARDAR' | 'MANTER' | 'NEUTRO' | 'EVITAR';
  score: number;
  motivo: string;
  
  // Campos Manuais e Métricas (Unificados)
  manual_dy?: number;
  manual_lpa?: number;
  manual_vpa?: number;
  
  // Spread das métricas (propriedades dinâmicas do backend)
  vi_graham?: number;
  mg_graham?: number;
  magic_number?: number;
  renda_mensal_est?: number;
  p_vp?: number;
  
  // RI Reports
  last_report_url?: string;
  last_report_at?: string;
  last_report_type?: string;
}

export interface DashboardData {
  status: string;
  dolar: number;
  resumo: {
    Total: number;
    RendaMensal: number;
    TotalInvestido: number;
    LucroTotal: number;
    [key: string]: number; 
  };
  grafico: { name: string; value: number }[];
  alertas: {
    titulo: string;
    significado: string;
    acao: string;
  }[];
  ativos: Asset[];
  categorias?: { name: string; meta: number }[];
}


// 📊 Novas Interfaces Analíticas Avançadas (Sprint 9)

export interface KellyItem {
  ticker: string;
  win_rate: number;
  win_loss_ratio: number;
  kelly_full: number;
  kelly_half_limit: number;
  kelly_quarter_limit: number;
}

export interface KellyData {
  status: string;
  data: KellyItem[];
}

export interface AlphaAttributionItem {
  ticker: string;
  weight_pct: number;
  asset_alpha_pct: number;
  weighted_alpha_pct: number;
  beta: number;
  pct_contribution: number;
}

export interface AlphaAttributionData {
  status: string;
  portfolio_alpha_pct: number;
  portfolio_beta: number;
  portfolio_return_pct: number;
  data: AlphaAttributionItem[];
}

export interface RebalanceBandItem {
  ticker: string;
  weight_pct: number;
  target_pct: number;
  deviation_pct: number;
  status: 'EXCEDENTE' | 'SUBALOCADO' | 'NORMAL';
  action_note: string;
}

export interface RebalanceBandsData {
  status: string;
  data: RebalanceBandItem[];
}

export interface DCASimulationHistoryItem {
  date: string;
  lump_sum_val: number;
  dca_val: number;
  dca_invested: number;
}

export interface DCASimulationData {
  status: string;
  ticker: string;
  lump_sum: {
    invested: number;
    final_value: number;
    profit: number;
    return_pct: number;
  };
  dca: {
    invested: number;
    final_value: number;
    profit: number;
    return_pct: number;
  };
  history: DCASimulationHistoryItem[];
}

export interface FrontierPoint {
  retorno: number;
  volatilidade: number;
  sharpe: number;
  weights: { [ticker: string]: number };
}

export interface CloudPoint {
  retorno: number;
  volatilidade: number;
  sharpe: number;
}

export interface EfficientFrontierData {
  status: string;
  frontier: FrontierPoint[];
  cloud: CloudPoint[];
  max_sharpe: FrontierPoint;
  min_vol: FrontierPoint;
}

export interface SharpeRollingData {
  status: string;
  dates: string[];
  series: { [tickerOrPortfolio: string]: number[] };
}

export interface MomentumItem {
  rank: number;
  ticker: string;
  momentum_score_pct: number;
}

export interface MomentumRankingData {
  status: string;
  data: MomentumItem[];
}
export interface CreditCardInstallmentItem {
  id: number;
  installment_number: number;
  value: number;
  due_date: string;
  status: string; // PENDING, PAID
  invoice_month: string;
}



export interface ReceivableInstallmentItem {
  id: number;
  numero_parcela: number;
  valor_parcela: number;
  data_vencimento: string;
  status: string; // ABERTA, PAGA, ATRASADA
  data_efetiva_pagamento?: string;
  observacoes?: string;
  fatura_mes: string;
  valor_pago: number;
}


export interface ReceivablesDashboardData {
  total_emprestado: number;
  total_recebido: number;
  total_pendente: number;
  total_atrasado: number;
  maior_devedor: string;
  maior_devedor_saldo: number;
  parcelas_abertas: number;
  faturas: Array<{
    fatura: string;
    total: number;
    recebido: number;
    pendente: number;
    status: string;
    items_count: number;
  }>;
  categorias: Array<{
    categoria: string;
    valor: number;
  }>;
  distribuicao_devedores: Array<{
    devedor: string;
    saldo: number;
  }>;
}
export interface CreditCardsDashboardData {
  total_limit: number;
  total_spent: number;
  total_pending: number;
  faturas: Array<{
    invoice_month: string;
    total: number;
    pending: number;
    paid: number;
    status: 'PAID' | 'PARTIAL' | 'PENDING';
  }>;
}

export interface AssetTransaction {
  id: number;
  type: 'BUY' | 'SELL';
  quantity: number;
  unit_price: number;
  total_value: number;
  date: string;
}
