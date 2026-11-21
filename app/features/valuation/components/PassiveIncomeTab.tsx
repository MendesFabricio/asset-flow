'use client';

import { useCallback, useEffect, useState } from 'react';
import { CalendarClock, Coins, PiggyBank, Target, TrendingUp } from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { apiCall } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { usePrivacy } from '@/context/PrivacyContext';
import { PrivateValue } from '@/components/ui/PrivateValue';
import { PassiveIncomeSimulation } from '@/types';

interface PassiveIncomeTabProps {
  currentPortfolioTotal?: number;
  currentMonthlyIncome?: number;
}

export function PassiveIncomeTab({
  currentPortfolioTotal = 0,
  currentMonthlyIncome = 0,
}: PassiveIncomeTabProps) {
  const { isHidden } = usePrivacy() as { isHidden: boolean };

  const estimatedDy =
    currentPortfolioTotal > 0 && currentMonthlyIncome > 0
      ? Math.min(18, Math.max(4, Number((((currentMonthlyIncome * 12) / currentPortfolioTotal) * 100).toFixed(1))))
      : 8.5;

  const [initialPortfolio, setInitialPortfolio] = useState<number>(Math.round(currentPortfolioTotal));
  const [monthlyContribution, setMonthlyContribution] = useState<number>(1500);
  const [targetMonthlyIncome, setTargetMonthlyIncome] = useState<number>(5000);
  const [annualDyPct, setAnnualDyPct] = useState<number>(estimatedDy);
  const [annualGrowthPct, setAnnualGrowthPct] = useState<number>(4.0);
  const [reinvestDividends, setReinvestDividends] = useState<boolean>(true);
  const [maxYears, setMaxYears] = useState<number>(25);

  const [result, setResult] = useState<PassiveIncomeSimulation | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const runSimulation = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiCall<{ status: string; data: PassiveIncomeSimulation }>(
        '/api/valuation/passive-income',
        {
          method: 'POST',
          body: JSON.stringify({
            initial_portfolio: initialPortfolio,
            monthly_contribution: monthlyContribution,
            target_monthly_income: targetMonthlyIncome,
            annual_dy_pct: annualDyPct,
            annual_growth_pct: annualGrowthPct,
            reinvest_dividends: reinvestDividends,
            max_years: maxYears,
          }),
        }
      );
      if (res.status === 'Sucesso') {
        setResult(res.data);
      }
    } catch (err) {
      console.error('Erro ao simular renda passiva:', err);
    } finally {
      setLoading(false);
    }
  }, [
    initialPortfolio,
    monthlyContribution,
    targetMonthlyIncome,
    annualDyPct,
    annualGrowthPct,
    reinvestDividends,
    maxYears,
  ]);

  useEffect(() => {
    const t = setTimeout(runSimulation, 200);
    return () => clearTimeout(t);
  }, [runSimulation]);

  const timeToGoalLabel =
    result?.months_to_goal === 0
      ? 'Meta já atingida!'
      : result?.years_to_goal !== null && result?.years_to_goal !== undefined
      ? `${result.years_to_goal.toFixed(1)} anos (${result.months_to_goal} meses)`
      : `Acima de ${maxYears} anos`;

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="bg-surface-card border border-border-subtle rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <PiggyBank size={18} className="text-status-success" />
            <h2 className="text-base font-extrabold text-text-primary">
              Planejador de Renda Passiva (Efeito Bola de Neve)
            </h2>
          </div>
          <p className="text-xs text-text-muted">
            Simule em quanto tempo seus dividendos atingem sua meta mensal com aportes e reinvestimento automático.
          </p>
        </div>
        {currentPortfolioTotal > 0 && (
          <button
            type="button"
            onClick={() => {
              setInitialPortfolio(Math.round(currentPortfolioTotal));
              setAnnualDyPct(estimatedDy);
            }}
            className="px-3 py-1.5 rounded-lg bg-surface-elevated border border-border-subtle text-xs font-bold text-text-primary hover:border-accent"
          >
            Usar carteira atual ({isHidden ? '••••' : formatMoney(currentPortfolioTotal)})
          </button>
        )}
      </div>

      {/* Parâmetros + KPIs */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-4 bg-surface-card border border-border-subtle rounded-2xl p-5 space-y-4 text-xs">
          <label className="block space-y-1">
            <span className="text-text-muted font-semibold">Patrimônio Inicial (R$)</span>
            <input
              type="number"
              aria-label="Patrimônio Inicial em reais"
              min="0"
              step="1000"
              value={initialPortfolio}
              onChange={(e) => setInitialPortfolio(Math.max(0, Number(e.target.value)))}
              className="w-full px-3 py-2 rounded-lg bg-surface-input border border-border-subtle font-mono text-text-primary focus:outline-none focus:border-accent"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-text-muted font-semibold">Aporte Mensal (R$)</span>
            <input
              type="number"
              aria-label="Aporte Mensal em reais"
              min="0"
              step="100"
              value={monthlyContribution}
              onChange={(e) => setMonthlyContribution(Math.max(0, Number(e.target.value)))}
              className="w-full px-3 py-2 rounded-lg bg-surface-input border border-border-subtle font-mono text-text-primary focus:outline-none focus:border-accent"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-text-muted font-semibold">Meta de Renda Mensal (R$)</span>
            <input
              type="number"
              aria-label="Meta de Renda Mensal em reais"
              min="100"
              step="250"
              value={targetMonthlyIncome}
              onChange={(e) => setTargetMonthlyIncome(Math.max(100, Number(e.target.value)))}
              className="w-full px-3 py-2 rounded-lg bg-surface-input border border-border-subtle font-mono text-text-primary focus:outline-none focus:border-accent"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1">
              <span className="text-text-muted font-semibold">DY Anual (%)</span>
              <input
                type="number"
                aria-label="Dividend Yield Anual em percentual"
                min="1"
                max="30"
                step="0.5"
                value={annualDyPct}
                onChange={(e) => setAnnualDyPct(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg bg-surface-input border border-border-subtle font-mono text-text-primary focus:outline-none focus:border-accent"
              />
            </label>

            <label className="block space-y-1">
              <span className="text-text-muted font-semibold">Valoriz. Real (%/a)</span>
              <input
                type="number"
                aria-label="Valorização Real anual em percentual"
                min="0"
                max="20"
                step="0.5"
                value={annualGrowthPct}
                onChange={(e) => setAnnualGrowthPct(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg bg-surface-input border border-border-subtle font-mono text-text-primary focus:outline-none focus:border-accent"
              />
            </label>
          </div>

          <label className="block space-y-1">
            <div className="flex justify-between text-text-muted font-semibold">
              <span>Horizonte</span>
              <span className="font-mono text-text-primary">{maxYears} anos</span>
            </div>
            <input
              type="range"
              aria-label="Horizonte de simulação em anos"
              min="5"
              max="45"
              step="1"
              value={maxYears}
              onChange={(e) => setMaxYears(Number(e.target.value))}
              className="w-full accent-accent"
            />
          </label>

          <label className="flex items-center gap-2 cursor-pointer text-text-primary pt-1">
            <input
              type="checkbox"
              aria-label="Reinvestir 100% dos dividendos recebidos"
              checked={reinvestDividends}
              onChange={(e) => setReinvestDividends(e.target.checked)}
              className="accent-accent"
            />
            <span>Reinvestir 100% dos dividendos recebidos</span>
          </label>
        </div>

        {/* KPIs + Gráfico */}
        <div className="lg:col-span-8 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-4 rounded-xl bg-surface-card border border-border-subtle space-y-1">
              <div className="text-[10px] font-bold uppercase text-text-muted flex items-center gap-1">
                <CalendarClock size={12} className="text-accent" /> Prazo até a Meta
              </div>
              <p className="text-sm font-mono font-extrabold text-text-primary">
                {loading && !result ? '...' : timeToGoalLabel}
              </p>
            </div>

            <div className="p-4 rounded-xl bg-surface-card border border-border-subtle space-y-1">
              <div className="text-[10px] font-bold uppercase text-text-muted flex items-center gap-1">
                <Target size={12} className="text-status-warning" /> Patrimônio Alvo
              </div>
              <p className="text-sm font-mono font-extrabold text-text-primary">
                <PrivateValue value={formatMoney(result?.required_patrimony || 0)} />
              </p>
            </div>

            <div className="p-4 rounded-xl bg-surface-card border border-border-subtle space-y-1">
              <div className="text-[10px] font-bold uppercase text-text-muted flex items-center gap-1">
                <Coins size={12} className="text-status-success" /> Renda Final ({maxYears}a)
              </div>
              <p className="text-sm font-mono font-extrabold text-status-success">
                <PrivateValue value={`${formatMoney(result?.final_monthly_income || 0)}/mês`} />
              </p>
            </div>

            <div className="p-4 rounded-xl bg-surface-card border border-border-subtle space-y-1">
              <div className="text-[10px] font-bold uppercase text-text-muted flex items-center gap-1">
                <TrendingUp size={12} className="text-accent" /> Yield on Cost Final
              </div>
              <p className="text-sm font-mono font-extrabold text-accent">
                {(result?.yield_on_cost_pct || 0).toFixed(1)}% a.a.
              </p>
            </div>
          </div>

          <div className="bg-surface-card border border-border-subtle rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <h3 className="font-bold uppercase tracking-wider text-text-muted">
                Evolução da Renda Passiva Mensal (R$/mês)
              </h3>
              <span className="text-[11px] font-mono text-text-muted">
                Meta: <PrivateValue value={formatMoney(targetMonthlyIncome)} />
              </span>
            </div>

            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <AreaChart data={result?.annual_series || []} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="passiveIncomeGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                  <XAxis
                    dataKey="year"
                    tickFormatter={(v) => `Ano ${v}`}
                    stroke="var(--text-muted)"
                    fontSize={11}
                  />
                  <YAxis
                    stroke="var(--text-muted)"
                    fontSize={11}
                    tickFormatter={(v) => (isHidden ? '•••' : `R$ ${Math.round(v).toLocaleString('pt-BR')}`)}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--surface-card)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--text-primary)',
                      borderRadius: '0.75rem',
                      fontSize: '12px',
                    }}
                    formatter={(val: unknown, name: unknown) => {
                      const num = Number(val) || 0;
                      const formatted = isHidden ? 'R$ •••••' : formatMoney(num);
                      return [formatted, name === 'monthly_income' ? 'Renda Mensal' : 'Patrimônio'];
                    }}
                    labelFormatter={(lbl) => `Ano ${lbl}`}
                  />
                  <ReferenceLine
                    y={targetMonthlyIncome}
                    stroke="#f59e0b"
                    strokeDasharray="4 4"
                    label={{
                      value: isHidden ? 'Meta' : `Meta ${formatMoney(targetMonthlyIncome)}`,
                      fill: '#f59e0b',
                      fontSize: 10,
                      position: 'insideTopRight',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="monthly_income"
                    stroke="#10b981"
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#passiveIncomeGrad)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
