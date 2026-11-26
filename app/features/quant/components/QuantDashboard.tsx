'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, BarChart3, HelpCircle, Target, TrendingUp } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { useToast } from '@/context/ToastContext';
import { useModalStore } from '@/store/modalStore';
import type { Asset } from '@/types';
import { useQuantData } from '../hooks/useQuantData';
import { useDcaSimulation } from '../hooks/useDcaSimulation';
import { useQuantReports } from '../hooks/useQuantReports';
import { QuantReportsTab } from './QuantReportsTab';
import { QuantOptimizationTab } from './dashboard/QuantOptimizationTab';
import { QuantSimulationsTab } from './dashboard/QuantSimulationsTab';
import { QuantPerformanceTab } from './dashboard/QuantPerformanceTab';
import { QuantAdvancedMetrics } from './dashboard/QuantAdvancedMetrics';

export const QuantDashboard = React.memo(function QuantDashboard({ ativos }: { ativos?: Asset[] }) {
  const { notify } = useToast();
  const [activeTab, setActiveTab] = useState<'action' | 'advanced'>('action');
  const [advancedView, setAdvancedView] = useState<'simulations' | 'optimization' | 'metrics' | 'reports'>('simulations');
  const [riskAversion, setRiskAversion] = useState(3.0);

  const {
    frontierData,
    rebalanceData,
    attributionData,
    kellyData,
    momentumData,
    sharpeRollingData,
    exposureData,
    markowitz,
    riskParity,
    currentAlloc,
    selectedOptimalPt,
    loading,
    optLoading,
    error,
  } = useQuantData(riskAversion, ativos, activeTab === 'action' ? 'performance' : 'optimization');

  const {
    fearGreedData,
    reportsList,
    loadingReports,
    generatingReport,
    fetchReportsAndFG,
    handleGenerateReport,
  } = useQuantReports(notify);

  const {
    ticker: dcaTicker,
    setTicker: setDcaTicker,
    initialAmount: dcaInitialAmount,
    setInitialAmount: setDcaInitialAmount,
    monthlyContribution: dcaMonthlyContribution,
    setMonthlyContribution: setDcaMonthlyContribution,
    result: dcaResult,
    loading: dcaLoading,
    error: dcaError,
    runSimulation: runDcaSimulation,
  } = useDcaSimulation(rebalanceData?.data?.[0]?.ticker);

  useEffect(() => {
    if (activeTab === 'advanced') {
      fetchReportsAndFG();
    }
  }, [activeTab, fetchReportsAndFG]);

  const tabs = useMemo(
    () =>
      [
        { id: 'action', label: 'Diagnóstico & Ação', icon: <Activity size={14} /> },
        { id: 'advanced', label: 'Simuladores & Avançado', icon: <TrendingUp size={14} /> },
      ] as const,
    []
  );

  if (loading) {
    return (
      <div className="flex flex-col gap-6 w-full animate-pulse p-6">
        <div className="h-20 bg-surface-card/40 rounded-2xl border border-border-subtle" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="h-64 bg-surface-card/40 rounded-2xl border border-border-subtle col-span-2" />
          <div className="h-64 bg-surface-card/40 rounded-2xl border border-border-subtle" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="flex flex-col items-center justify-center p-12 text-center bg-surface-card border-border-subtle min-h-[400px] m-6">
        <AlertTriangle className="text-status-warning mb-4" size={48} />
        <h3 className="font-bold text-text-primary text-lg">Houve um problema de carregamento</h3>
        <p className="text-text-secondary text-sm mt-2 max-w-md">{error}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-6 px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm font-medium transition"
        >
          Tentar Novamente
        </button>
      </Card>
    );
  }

  const actionsToTakeCount = rebalanceData?.data?.filter((a) => a.status !== 'NORMAL').length || 0;

  return (
    <div className="flex flex-col gap-6 w-full p-6 text-text-secondary">
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 bg-surface-card p-4 rounded-2xl border border-border-subtle">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1 bg-gradient-to-tr from-emerald-500/10 to-teal-500/10 rounded border border-emerald-500/20 text-status-success">
              <BarChart3 size={18} />
            </span>
            <h2 className="text-lg font-bold text-text-primary uppercase tracking-wider">
              Análise Quantitativa Avançada (Pro)
            </h2>
          </div>
          <p className="text-xs text-text-muted mt-1">
            Modelos matemáticos integrados, dimensionamento de risco por probabilidade e fronteira eficiente.
          </p>

          <div className="flex flex-wrap gap-4 mt-3">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-surface-elevated rounded-lg border border-border-subtle">
              <span className={`w-2 h-2 rounded-full ${actionsToTakeCount > 0 ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`} />
              <span className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-1.5">
                Ações a Tomar: <span className="text-text-primary ml-1">{actionsToTakeCount}</span>
                <div className="relative group/tt flex items-center cursor-pointer normal-case">
                  <HelpCircle size={12} className="text-text-muted hover:text-accent transition-colors" />
                  <div className="absolute top-full mt-2 hidden group-hover/tt:block w-48 p-2 bg-surface-elevated text-text-secondary text-[10px] rounded shadow-xl border border-border-subtle z-50 font-normal text-left">
                    Ativos que saíram da banda de tolerância e exigem sua atenção no rebalanceamento.
                  </div>
                </div>
              </span>
            </div>
            {attributionData && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-surface-elevated rounded-lg border border-border-subtle">
                <Target size={14} className="text-accent" />
                <span className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-1.5">
                  Beta da Carteira: <span className="text-text-primary ml-1">{attributionData.portfolio_beta.toFixed(2)}</span>
                  <div className="relative group/tt flex items-center cursor-pointer normal-case">
                    <HelpCircle size={12} className="text-text-muted hover:text-accent transition-colors" />
                    <div className="absolute top-full mt-2 hidden group-hover/tt:block w-48 p-2 bg-surface-elevated text-text-secondary text-[10px] rounded shadow-xl border border-border-subtle z-50 font-normal text-left">
                      Mede a sensibilidade da carteira ao mercado. Beta = 1 acompanha o mercado. Beta &lt; 1 é mais defensivo.
                    </div>
                  </div>
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="w-full xl:w-auto p-1 bg-surface rounded-xl border border-border-subtle shadow-inner">
          <div className="grid grid-cols-2 gap-1">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all duration-300 ${
                    isActive
                      ? 'bg-surface-elevated text-accent shadow-md ring-1 ring-border-subtle'
                      : 'text-text-muted hover:text-text-primary hover:bg-surface-elevated/40'
                  }`}
                >
                  {tab.icon}
                  <span className="text-center">{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {activeTab === 'action' && (
        <div className="space-y-6">
          {/* Resumo Direto: O que fazer agora na carteira */}
          <Card className="bg-surface-card border-border-subtle p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div>
                <h3 className="text-sm font-bold text-text-primary flex items-center gap-2">
                  <Target size={15} className="text-accent" />
                  O que fazer agora na carteira
                </h3>
                <p className="text-xs text-text-muted">
                  Ativos que saíram da banda de tolerância em relação às suas metas.
                </p>
              </div>
              <span className="text-[11px] font-mono font-bold px-2.5 py-1 rounded-lg bg-surface-elevated border border-border-subtle text-text-secondary">
                {actionsToTakeCount} ajuste(s) recomendado(s)
              </span>
            </div>

            {actionsToTakeCount === 0 ? (
              <div className="px-3 py-2.5 rounded-xl bg-status-success/10 border border-status-success/30 text-xs font-medium text-status-success">
                Carteira equilibrada dentro das metas definidas — nenhum rebalanceamento urgente necessário.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {rebalanceData!.data
                  .filter((a) => a.status !== 'NORMAL')
                  .slice(0, 6)
                  .map((item) => {
                    const isBuy = item.status === 'SUBALOCADO';
                    return (
                      <button
                        key={item.ticker}
                        type="button"
                        onClick={() => useModalStore.getState().setSmartModalOpen(true)}
                        className="p-3 rounded-xl bg-surface-elevated border border-border-subtle hover:border-accent/50 flex items-center justify-between gap-2 text-left transition-colors"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-black text-sm text-text-primary">{item.ticker}</span>
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                isBuy
                                  ? 'text-status-success bg-status-success/10 border-status-success/30'
                                  : 'text-status-warning bg-status-warning/10 border-status-warning/30'
                              }`}
                            >
                              {isBuy ? 'COMPRAR' : 'REDUZIR'}
                            </span>
                          </div>
                          <p className="text-[11px] text-text-muted mt-1">
                            Atual {item.weight_pct.toFixed(1)}% · Meta {item.target_pct.toFixed(1)}%
                          </p>
                        </div>
                        <div className="text-right">
                          <span className={`font-mono text-xs font-bold block ${isBuy ? 'text-status-success' : 'text-status-warning'}`}>
                            {item.deviation_pct > 0 ? '+' : ''}
                            {item.deviation_pct.toFixed(1)}%
                          </span>
                          <span className="text-[10px] text-accent font-semibold">
                            {isBuy ? 'Aportar →' : 'Ajustar →'}
                          </span>
                        </div>
                      </button>
                    );
                  })}
              </div>
            )}
          </Card>

          <QuantPerformanceTab
            loading={loading}
            momentumData={momentumData}
            exposureData={exposureData}
          />
        </div>
      )}

      {activeTab === 'advanced' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-1.5">
            {([
              { id: 'simulations', label: 'DCA & Monte Carlo' },
              { id: 'optimization', label: 'Otimização & Fronteira' },
              { id: 'metrics', label: 'Kelly, Sharpe & Alpha' },
              { id: 'reports', label: 'Termômetro & Relatórios' },
            ] as const).map((sub) => {
              const active = advancedView === sub.id;
              return (
                <button
                  key={sub.id}
                  type="button"
                  onClick={() => setAdvancedView(sub.id)}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-bold transition-colors ${
                    active
                      ? 'bg-accent-soft border-accent/40 text-accent'
                      : 'bg-surface-card border-border-subtle text-text-muted hover:text-text-primary'
                  }`}
                >
                  {sub.label}
                </button>
              );
            })}
          </div>

          {advancedView === 'simulations' && (
            <QuantSimulationsTab
              ativos={ativos}
              dcaTicker={dcaTicker}
              setDcaTicker={setDcaTicker}
              dcaInitialAmount={dcaInitialAmount}
              setDcaInitialAmount={setDcaInitialAmount}
              dcaMonthlyContribution={dcaMonthlyContribution}
              setDcaMonthlyContribution={setDcaMonthlyContribution}
              dcaResult={dcaResult}
              dcaLoading={dcaLoading}
              dcaError={dcaError}
              runDcaSimulation={runDcaSimulation}
            />
          )}
          {advancedView === 'optimization' && (
            <QuantOptimizationTab
              ativos={ativos}
              optLoading={optLoading}
              frontierData={frontierData}
              rebalanceData={rebalanceData}
              selectedOptimalPt={selectedOptimalPt}
              riskAversion={riskAversion}
              onChangeRiskAversion={setRiskAversion}
              markowitz={markowitz}
              riskParity={riskParity}
              currentAlloc={currentAlloc}
            />
          )}
          {advancedView === 'metrics' && (
            <QuantAdvancedMetrics
              loading={loading}
              kellyData={kellyData}
              sharpeRollingData={sharpeRollingData}
              attributionData={attributionData}
            />
          )}
          {advancedView === 'reports' && (
            <QuantReportsTab
              fearGreedData={fearGreedData}
              reportsList={reportsList}
              loadingReports={loadingReports}
              generatingReport={generatingReport}
              onGenerateReport={handleGenerateReport}
            />
          )}
        </div>
      )}
    </div>
  );
});
