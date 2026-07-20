'use client';

import dynamic from 'next/dynamic';
import { memo } from 'react';
import { BarChart3, Percent, PiggyBank, Target } from 'lucide-react';
import { StatCard } from '@/components/StatCard';
import { RiskRadarSkeleton, CategorySummarySkeleton } from '@/components/ui/Skeletons';
import { formatMoney } from '@/lib/format';
import { Asset } from '@/types';

const PortfolioDonutChart = dynamic(
  () => import('@/components/PortfolioDonutChart').then((mod) => mod.PortfolioDonutChart),
  { ssr: false, loading: () => <RiskRadarSkeleton /> }
);
const CategorySummary = dynamic(
  () => import('@/components/CategorySummary').then((mod) => mod.CategorySummary),
  { ssr: false, loading: () => <CategorySummarySkeleton /> }
);

interface PortfolioMetrics {
  yocMedio: number;
  totalInvestido: number;
  lucroTotal: number;
  variacaoDiariaTotal: number;
  topCompras: Asset[];
  money: (val: number) => string;
}

interface SummaryDashboardProps {
  metrics: PortfolioMetrics;
  isHidden: boolean;
  ativos: Asset[];
  categorias: { name: string; meta: number }[];
  onOpenRadar: () => void;
  onUpdate: () => void;
}

export const SummaryDashboard = memo(function SummaryDashboard({
  metrics,
  isHidden,
  ativos,
  categorias,
  onOpenRadar,
  onUpdate,
}: SummaryDashboardProps) {
  const top = metrics.topCompras[0];

  return (
    <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Yield on Cost Médio"
          value={isHidden ? '•••' : metrics.yocMedio.toFixed(2) + '%'}
          subtext="Anual Est."
          icon={Percent}
          colorClass="text-purple-400"
        />
        <StatCard
          title="Total Investido"
          value={metrics.money(metrics.totalInvestido)}
          subtext="Custo de Aquisição"
          icon={PiggyBank}
          colorClass="text-blue-400"
        />
        <StatCard
          title="Lucro / Prejuízo"
          value={isHidden ? '••••••' : (metrics.lucroTotal > 0 ? '+' : '') + formatMoney(metrics.lucroTotal)}
          subtext="Total Histórico"
          icon={BarChart3}
          colorClass={metrics.lucroTotal >= 0 ? 'text-green-400' : 'text-red-400'}
          dailyResult={metrics.variacaoDiariaTotal}
        />
        <StatCard
          title="Top Insight"
          type="insight"
          colorClass="text-indigo-400"
          icon={Target}
          value={top ? top.ticker : '--'}
          badge={top ? top.recomendacao : undefined}
          marquee={top ? top.motivo : undefined}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 min-h-[525px]">
        <div className="h-full w-full">
          <PortfolioDonutChart ativos={ativos} onOpenRadar={onOpenRadar} />
        </div>
        <div className="lg:col-span-2 h-full w-full">
          <CategorySummary ativos={ativos} categorias={categorias} onUpdate={onUpdate} />
        </div>
      </div>
    </div>
  );
});
