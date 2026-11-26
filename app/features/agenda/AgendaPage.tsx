'use client';

import { useState } from 'react';
import { Calendar, Percent, TrendingUp, Table, History, PiggyBank } from 'lucide-react';
import { formatMoney } from '@/lib/format';
import { Skeleton } from '@/components/ui/Skeleton';
import { SubPageHeader } from '@/components/ui/SubPageHeader';
import { usePrivacy } from '@/context/PrivacyContext';
import { PassiveIncomeTab } from '@/features/valuation/components/PassiveIncomeTab';
import { AgendaTab } from './types';
import { useAgendaData } from './useAgendaData';
import { DividendCalendarView } from './DividendCalendarView';
import { DividendAnalyticsView } from './DividendAnalyticsView';
import { DividendYocView } from './DividendYocView';
import { DividendSeasonalityView } from './DividendSeasonalityView';
import { DividendStatementView } from './DividendStatementView';

export function AgendaPage() {
  const { isHidden } = usePrivacy();
  const money = (v: number) => (isHidden ? 'R$ •••••' : formatMoney(v));
  const [activeTab, setActiveTab] = useState<AgendaTab>('calendar');
  const data = useAgendaData(activeTab);

  return (
    <div className="min-h-screen bg-surface text-text-primary font-sans">
      <SubPageHeader />
      <div className="max-w-6xl mx-auto p-4 md:p-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-text-primary tracking-tight">Proventos &amp; Renda Passiva</h1>
            <p className="text-xs text-text-muted">Mapeamento de data-com, histórico de yield e sazonalidade</p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-6 bg-surface-card p-1 rounded-2xl border border-border-subtle mb-8 max-w-5xl">
          <button
            type="button"
            onClick={() => setActiveTab('calendar')}
            className={`flex items-center justify-center gap-1.5 py-2.5 px-1 text-[10px] font-black uppercase tracking-wider rounded-xl transition-all ${
              activeTab === 'calendar' ? 'bg-blue-600 text-white shadow-md' : 'text-text-muted hover:text-text-primary'
            }`}
          >
            <Calendar size={13} /> Calendário
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('analytics')}
            className={`flex items-center justify-center gap-1.5 py-2.5 px-1 text-[10px] font-black uppercase tracking-wider rounded-xl transition-all ${
              activeTab === 'analytics' ? 'bg-indigo-600 text-white shadow-md' : 'text-text-muted hover:text-text-primary'
            }`}
          >
            <Percent size={13} /> Yield &amp; Consistência
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('yoc')}
            className={`flex items-center justify-center gap-1.5 py-2.5 px-1 text-[10px] font-black uppercase tracking-wider rounded-xl transition-all ${
              activeTab === 'yoc' ? 'bg-emerald-600 text-white shadow-md' : 'text-text-muted hover:text-text-primary'
            }`}
          >
            <TrendingUp size={13} /> Evolução YOC
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('seasonality')}
            className={`flex items-center justify-center gap-1.5 py-2.5 px-1 text-[10px] font-black uppercase tracking-wider rounded-xl transition-all ${
              activeTab === 'seasonality' ? 'bg-purple-600 text-white shadow-md' : 'text-text-muted hover:text-text-primary'
            }`}
          >
            <Table size={13} /> Sazonalidade
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('extrato')}
            className={`flex items-center justify-center gap-1.5 py-2.5 px-1 text-[10px] font-black uppercase tracking-wider rounded-xl transition-all ${
              activeTab === 'extrato' ? 'bg-cyan-600 text-white shadow-md' : 'text-text-muted hover:text-text-primary'
            }`}
          >
            <History size={13} /> Extrato Real
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('passive')}
            className={`flex items-center justify-center gap-1.5 py-2.5 px-1 text-[10px] font-black uppercase tracking-wider rounded-xl transition-all ${
              activeTab === 'passive' ? 'bg-teal-600 text-white shadow-md' : 'text-text-muted hover:text-text-primary'
            }`}
          >
            <PiggyBank size={13} /> Simulador Meta
          </button>
        </div>

        {data.loading || (data.tabLoading && (activeTab === 'analytics' || activeTab === 'yoc' || activeTab === 'seasonality')) ? (
          <div className="space-y-6">
            <Skeleton className="h-64 w-full bg-surface-card rounded-xl" />
            <Skeleton className="h-20 w-full bg-surface-card rounded-xl" />
          </div>
        ) : (
          <div className="animate-in fade-in duration-500">
            {activeTab === 'calendar' && (
              <DividendCalendarView
                monthName={data.monthName}
                currentYear={data.currentYear}
                currentMonth={data.currentMonth}
                calendarCells={data.calendarCells}
                events={data.events}
                isHidden={isHidden}
                money={money}
                getEventsForDay={data.getEventsForDay}
                onPrevMonth={data.handlePrevMonth}
                onNextMonth={data.handleNextMonth}
              />
            )}

            {activeTab === 'analytics' && <DividendAnalyticsView analytics={data.analytics} />}

            {activeTab === 'yoc' && (
              <DividendYocView
                yocHistory={data.yocHistory}
                selectedYocTicker={data.selectedYocTicker}
                selectedYocYear={data.selectedYocYear}
                isHidden={isHidden}
                money={money}
                onSelectTicker={data.setSelectedYocTicker}
                onSelectYear={data.setSelectedYocYear}
              />
            )}

            {activeTab === 'seasonality' && (
              <DividendSeasonalityView seasonality={data.seasonality} isHidden={isHidden} money={money} />
            )}

            {activeTab === 'extrato' && (
              <DividendStatementView history={data.history} isHidden={isHidden} money={money} />
            )}

            {activeTab === 'passive' && <PassiveIncomeTab />}
          </div>
        )}
      </div>
    </div>
  );
}
