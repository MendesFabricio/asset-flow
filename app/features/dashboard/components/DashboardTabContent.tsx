'use client';

import dynamic from 'next/dynamic';
import { ReactNode } from 'react';
import {
  HistoryChartSkeleton,
  QuantSkeleton,
  FixedIncomeSkeleton,
  ReceivablesSkeleton,
  CreditCardsSkeleton,
  ChatSkeleton,
} from '@/components/ui/Skeletons';
import { MorningBriefing } from '@/features/news/MorningBriefing';
import { SummaryDashboard } from './SummaryDashboard';
import { Asset, HistoryDataPoint } from '@/types';

const MonthlyPnLChart = dynamic(
  () => import('@/features/evolution/components/MonthlyPnLChart'),
  { ssr: false, loading: () => <div className="h-64 bg-surface-card animate-pulse rounded-xl"></div> }
);
const ReturnsKpiCards = dynamic(
  () => import('@/features/evolution/components/ReturnsKpiCards'),
  { ssr: false }
);
const PerformanceAttributionChart = dynamic(
  () => import('@/features/evolution/components/PerformanceAttributionChart'),
  { ssr: false, loading: () => <HistoryChartSkeleton /> }
);
const QuantDashboard = dynamic(
  () => import('@/features/quant/components/QuantDashboard').then((mod) => mod.QuantDashboard),
  { ssr: false, loading: () => <QuantSkeleton /> }
);
const FixedIncomeTab = dynamic(
  () => import('@/components/FixedIncomeTab').then((mod) => mod.FixedIncomeTab),
  { ssr: false, loading: () => <FixedIncomeSkeleton /> }
);
const ReceivablesTab = dynamic(
  () => import('@/features/assets/tabs/receivables/ReceivablesTab').then((mod) => mod.ReceivablesTab),
  { ssr: false, loading: () => <ReceivablesSkeleton /> }
);
const CreditCardsTab = dynamic(
  () => import('@/components/CreditCardsTab').then((mod) => mod.CreditCardsTab),
  { ssr: false, loading: () => <CreditCardsSkeleton /> }
);
const JarvisChat = dynamic(
  () => import('@/features/jarvis/JarvisChat').then((mod) => mod.JarvisChat),
  { ssr: false, loading: () => <ChatSkeleton /> }
);
const RadarTab = dynamic(
  () => import('@/features/valuation/components/RadarTab').then((mod) => mod.RadarTab),
  { ssr: false, loading: () => <QuantSkeleton /> }
);
const ComparatorTab = dynamic(
  () => import('@/features/valuation/components/ComparatorTab').then((mod) => mod.ComparatorTab),
  { ssr: false, loading: () => <QuantSkeleton /> }
);
const PassiveIncomeTab = dynamic(
  () => import('@/features/valuation/components/PassiveIncomeTab').then((mod) => mod.PassiveIncomeTab),
  { ssr: false, loading: () => <QuantSkeleton /> }
);

interface PortfolioMetrics {
  yocMedio: number;
  totalInvestido: number;
  lucroTotal: number;
  variacaoDiariaTotal: number;
  topCompras: Asset[];
  money: (val: number) => string;
}

interface DashboardTabContentProps {
  tab: string;
  metrics: PortfolioMetrics;
  isHidden: boolean;
  ativos: Asset[];
  categorias: { name: string; meta: number }[];
  history: HistoryDataPoint[];
  onOpenRadar: () => void;
  onUpdate: () => void;
}

function Section({ children }: { children: ReactNode }) {
  return <div className="animate-in fade-in duration-500 w-full">{children}</div>;
}

export function DashboardTabContent({
  tab,
  metrics,
  isHidden,
  ativos,
  categorias,
  history,
  onOpenRadar,
  onUpdate,
}: DashboardTabContentProps) {
  switch (tab) {
    case 'Resumo':
      return (
        <SummaryDashboard
          metrics={metrics}
          isHidden={isHidden}
          ativos={ativos}
          categorias={categorias}
          onOpenRadar={onOpenRadar}
          onUpdate={onUpdate}
        />
      );
    case 'Evolução':
      return (
        <div className="animate-in fade-in duration-500 w-full flex flex-col gap-6">
          <ReturnsKpiCards />
          <PerformanceAttributionChart history={history} />
          <MonthlyPnLChart />
        </div>
      );

    case 'Quantitativo':
      return (
        <Section>
          <QuantDashboard ativos={ativos} />
        </Section>
      );
    case 'Radar':
      return (
        <Section>
          <RadarTab />
        </Section>
      );
    case 'Comparador':
      return (
        <Section>
          <ComparatorTab ativos={ativos} />
        </Section>
      );
    case 'RendaPassiva': {
      const totalPortfolio = ativos.reduce((acc, a) => acc + (a.total_atual || 0), 0);
      const totalMonthlyIncome = ativos.reduce((acc, a) => acc + (a.renda_mensal_est || 0), 0);
      return (
        <Section>
          <PassiveIncomeTab
            currentPortfolioTotal={totalPortfolio}
            currentMonthlyIncome={totalMonthlyIncome}
          />
        </Section>
      );
    }
    case 'Renda Fixa':
      return (
        <Section>
          <FixedIncomeTab />
        </Section>
      );
    case 'Reembolsos':
    case 'Financeiro':
      return (
        <Section>
          <ReceivablesTab />
        </Section>
      );
    case 'Cartoes':
      return (
        <Section>
          <CreditCardsTab />
        </Section>
      );
    case 'Jarvis':
      return (
        <div className="animate-in fade-in duration-500 w-full grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1">
            <MorningBriefing />
          </div>
          <div className="lg:col-span-2">
            <JarvisChat />
          </div>
        </div>
      );
    default:
      return null;
  }
}
