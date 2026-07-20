import { Asset } from '@/types';

export interface GroupedAsset {
  tipo: string;
  investido: number;
  atual: number;
  variacaoPct: number;
  variacaoValor: number;
}

export interface MetaTooltipData {
  item: GroupedAsset;
  meta: number;
  pctAtual: number;
  diff: number;
  visualWidth: number;
}

export interface FinanceTooltipData {
  valor: number;
  isPositive: boolean;
}

export interface CategorySummaryProps {
  ativos: Asset[];
  categorias?: { name: string; meta: number }[];
  onUpdate: () => void;
}
