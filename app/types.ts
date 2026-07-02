// app/types.ts

export interface AssetMetrics {
  vi_graham?: number;
  mg_graham?: number;
  magic_number?: number;
  renda_mensal_est?: number;
  p_vp?: number;
}

export interface Asset {
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
}

export interface FundamentalistData {
  ticker_info: {
    ultimo_periodo: string;
    data_base: string;
  };
  cards_indicadores: Array<{
    titulo: string;
    valor?: number;
    valor_formatado?: string;
    yoy?: number;
    qoq?: number;
    status?: 'positivo' | 'negativo';
    tipo?: string;
  }>;
  evolucao_grafico: Array<{
    label: string;
    receita: number;
    lucro: number;
  }>;
}
