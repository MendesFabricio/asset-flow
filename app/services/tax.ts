import { apiCall } from '@/lib/api';

export interface TaxReportDetails {
  id: number;
  ticker: string;
  date: string;
  quantity: number;
  sale_value: number;
  cost_value: number;
  profit: number;
  is_fii: boolean;
  is_day_trade: boolean;
}

export interface TaxMonthlyReport {
  period: string;
  sales_total_stocks: number;
  is_exempt_stocks_st: boolean;
  profits: {
    stocks_st: number;
    stocks_dt: number;
    fiis: number;
  };
  taxable_profits: {
    stocks_st: number;
    stocks_dt: number;
    fiis: number;
  };
  taxes: {
    stocks_st: number;
    stocks_dt: number;
    fiis: number;
  };
  darf: {
    month_tax: number;
    previous_accumulated: number;
    total_due: number;
    darf_to_pay: number;
    next_month_accumulated: number;
  };
  accumulated_losses: {
    stocks_st: number;
    stocks_dt: number;
    fiis: number;
  };
  details: TaxReportDetails[];
}

export interface AnnualTaxReport {
  year: number;
  bens_e_direitos: {
    ticker: string;
    name: string;
    cnpj: string;
    category: string;
    quantity: number;
    total_cost: number;
    average_price: number;
    description: string;
  }[];
  rendimentos_isentos: {
    dividendos: number;
    lucro_vendas_20k: number;
    total: number;
  };
  rendimentos_exclusivos: {
    jcp: number;
    total: number;
  };
  renda_variavel: {
    month: number;
    profit_st: number;
    profit_dt: number;
    profit_fii: number;
    tax_due: number;
    irrf_st: number;
    irrf_dt: number;
    irrf_fii: number;
    is_exempt_st: boolean;
  }[];
}

export interface TaxProfile {
  accumulated_loss_stocks_st: number;
  accumulated_loss_stocks_dt: number;
  accumulated_loss_fiis: number;
  accumulated_darf_balance: number;
}

export const taxService = {
  getMonthlyTax: async (year: number, month: number): Promise<TaxMonthlyReport> => {
    return await apiCall<TaxMonthlyReport>(`/api/tax/monthly?year=${year}&month=${month}`);
  },

  getAnnualTax: async (year: number): Promise<AnnualTaxReport> => {
    return await apiCall<AnnualTaxReport>(`/api/tax/annual?year=${year}`);
  },

  getTaxProfile: async (): Promise<TaxProfile> => {
    return await apiCall<TaxProfile>('/api/tax/profile');
  },

  updateTaxProfile: async (data: Partial<TaxProfile>): Promise<{message: string}> => {
    return await apiCall<{message: string}>('/api/tax/profile', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }
};
