'use client';

import dynamic from 'next/dynamic';
import { ReactNode } from 'react';
import {
  HistoryChartSkeleton,
  HeatmapSkeleton,
  QuantSkeleton,
  FixedIncomeSkeleton,
  ReceivablesSkeleton,
  CreditCardsSkeleton,
  ChatSkeleton,
} from '@/components/ui/Skeletons';
import { MorningBriefing } from '@/features/news/MorningBriefing';
import { SummaryDashboard } from './SummaryDashboard';
import { Asset, HistoryDataPoint } from '@/types';

const HistoryChart = dynamic(
  () => import('@/components/HistoryChart').then((mod) => mod.HistoryChart),
  { ssr: false, loading: () => <HistoryChartSkeleton /> }
);
const MonthlyPnLChart = dynamic(
  () => import('@/features/evolution/components/MonthlyPnLChart'),
  { ssr: false, loading: () => <div className="h-64 bg-slate-100 dark:bg-slate-800 animate-pulse rounded-xl"></div> }
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
          <div className="min-h-[400px]">
            <HistoryChart data={history} />
          </div>
          <MonthlyPnLChart />
        </div>
      );

    case 'Quantitativo':
      return (
        <Section>
          <QuantDashboard />
        </Section>
      );
    case 'Renda Fixa':
      return (
        <Section>
          <FixedIncomeTab />
        </Section>
      );
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
