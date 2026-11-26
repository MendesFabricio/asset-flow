import { Asset } from '@/types';

export interface EmissionRecord {
  id: number;
  ticker: string;
  date: string;
  factor_pct: number;
  unit_cost: number;
  subscribed_qty: number;
  base_qty_on_date: number;
  real_rights_qty: number;
  theoretical_base_qty: number;
  theoretical_rights_qty: number;
  missed_qty: number;
  theoretical_cost: number;
  source: string;
  title: string;
  link: string;
}

export interface AssetEmissionSummary {
  ticker: string;
  category: string;
  current_qty: number;
  theoretical_qty: number;
  missed_total_qty: number;
  total_theoretical_cost: number;
  est_monthly_div_per_share?: number;
  est_monthly_income?: number;
  first_buy_date: string | null;
  emissions: EmissionRecord[];
}

export interface CorporateActionGlobalModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  assets: Asset[];
  initialData?: {
    ticker?: string;
    type?: string;
    date?: string;
  };
}

export function mapB3TypeToActionType(b3Type: string): string {
  const t = b3Type.toLowerCase();
  if (t.includes('desdobramento') || t.includes('split')) return 'SPLIT';
  if (t.includes('grupamento') || t.includes('inplit')) return 'INPLIT';
  if (t.includes('bonifica')) return 'BONUS';
  if (t.includes('cisão') || t.includes('spinoff') || t.includes('spin-off')) return 'SPIN_OFF';
  if (t.includes('mudança') || t.includes('incorporação')) return 'TICKER_CHANGE';
  if (t.includes('amortiza')) return 'AMORTIZATION';
  return 'SPLIT';
}

export function computeSimulatedImpact(params: {
  selectedAsset: Asset | undefined;
  actionType: string;
  ticker: string;
  factor: string;
  percent: string;
  unitCost: string;
  newTicker: string;
  costPercent: string;
}): string | null {
  const { selectedAsset, actionType, ticker, factor, percent, unitCost, newTicker, costPercent } = params;
  if (!selectedAsset) return null;
  const oldQ = Number(selectedAsset.qtd);
  const oldPm = Number(selectedAsset.pm);

  if (actionType === 'SPLIT') {
    const f = Number(factor);
    if (f > 0) return `A posição passará de ${oldQ} para ${oldQ * f} cotas. O PM cairá para ${(oldPm / f).toFixed(2)}.`;
  } else if (actionType === 'INPLIT') {
    const f = Number(factor);
    if (f > 0) return `A posição passará de ${oldQ} para ${(oldQ / f).toFixed(2)} cotas. O PM subirá para ${(oldPm * f).toFixed(2)}.`;
  } else if (actionType === 'BONUS') {
    const p = Number(percent);
    const c = Number(unitCost);
    const add = oldQ * (p / 100);
    const nq = oldQ + add;
    if (nq > 0) {
      const npm = ((oldQ * oldPm) + (add * c)) / nq;
      return `Você receberá ${add.toFixed(2)} novas cotas. A posição será de ${nq.toFixed(2)} cotas com PM de ${npm.toFixed(2)}.`;
    }
  } else if (actionType === 'SPIN_OFF') {
    const cp = Number(costPercent);
    if (cp > 0 && newTicker) {
      const drop = oldPm * (cp / 100);
      return `O PM de ${ticker} cairá ${cp}% (para ${(oldPm - drop).toFixed(2)}). Você receberá o ativo ${newTicker} com PM de ${drop.toFixed(2)}.`;
    }
  } else if (actionType === 'TICKER_CHANGE') {
    return `A posição de ${ticker} será encerrada (sem impostos) e transferida para ${newTicker || '___'}.`;
  } else if (actionType === 'AMORTIZATION') {
    const c = Number(unitCost);
    if (c > 0) {
      return `Você receberá R$ ${c.toFixed(2)} por cota. O PM cairá de R$ ${oldPm.toFixed(2)} para R$ ${Math.max(0, oldPm - c).toFixed(2)}. A quantidade de cotas não muda.`;
    }
  }
  return null;
}
