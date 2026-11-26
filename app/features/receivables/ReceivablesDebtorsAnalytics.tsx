'use client';

import { BarChart2, Pencil, Phone, PieChart as PieIcon, Trash2, TrendingUp, User } from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  Tooltip,
  Cell,
  PieChart,
  Pie,
} from 'recharts';
import { useChartPalette } from '@/lib/chartPalette';
import { ReceivablesDashboardData } from '@/types';
import { DebtorItem, FaturaSummary } from './types';

interface ReceivablesDebtorsAnalyticsProps {
  debtors: DebtorItem[];
  dashboard: ReceivablesDashboardData | null;
  faturasCalculated: FaturaSummary[];
  money: (v: number) => string;
  onSelectDebtor: (nome: string) => void;
  onOpenGlobalPay: (d: DebtorItem) => void;
  onOpenEditDebtor: (d: DebtorItem) => void;
  onDeleteDebtor: (id: number, nome: string) => void;
}

export function ReceivablesDebtorsAnalytics({
  debtors,
  dashboard,
  faturasCalculated,
  money,
  onSelectDebtor,
  onOpenGlobalPay,
  onOpenEditDebtor,
  onDeleteDebtor,
}: ReceivablesDebtorsAnalyticsProps) {
  const palette = useChartPalette();

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-1 space-y-3 bg-surface-card backdrop-blur-md p-4 rounded-xl border border-border-subtle">
        <h3 className="text-xs font-bold text-text-muted uppercase tracking-widest flex items-center gap-1.5">
          <User size={13} /> Perfis de Devedores
        </h3>

        <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1 scrollbar-thin">
          {debtors.length === 0 ? (
            <p className="text-xs text-text-muted text-center py-6">Nenhum devedor cadastrado.</p>
          ) : (
            debtors.map((d) => (
              <div
                key={d.id}
                className="p-3 bg-surface-elevated border border-border-subtle rounded-xl space-y-2 group transition-all relative"
              >
                <div className="flex justify-between items-start">
                  <button
                    type="button"
                    onClick={() => onSelectDebtor(d.nome)}
                    className="flex items-center gap-2 text-left hover:opacity-90"
                    title={`Filtrar lançamentos de ${d.nome}`}
                  >
                    <div className="w-8 h-8 rounded-full bg-surface-card flex items-center justify-center border border-border-subtle text-text-secondary font-bold text-xs">
                      {d.nome.substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-text-primary leading-none">{d.nome}</p>
                      {d.telefone && (
                        <span className="text-[10px] text-text-muted flex items-center gap-0.5 mt-0.5">
                          <Phone size={8} /> {d.telefone}
                        </span>
                      )}
                    </div>
                  </button>
                  <div className="flex flex-col items-end gap-1.5">
                    <span className={`text-xs font-bold font-mono ${d.saldo_pendente > 0 ? 'text-status-warning' : 'text-text-muted'}`}>
                      {money(d.saldo_pendente)}
                    </span>

                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                      {d.saldo_pendente > 0 && (
                        <button
                          type="button"
                          onClick={() => onOpenGlobalPay(d)}
                          className="bg-emerald-500/20 hover:bg-emerald-500/30 text-status-success border border-emerald-500/30 px-1.5 py-0.5 rounded text-[10px] font-bold transition-all"
                          title="Quitação em Lote / Baixa Parcial por Valor"
                        >
                          Pagar
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onOpenEditDebtor(d)}
                        className="bg-blue-500/20 hover:bg-blue-500/30 text-accent border border-blue-500/30 p-1 rounded transition-all"
                        title="Editar cadastro de devedor"
                      >
                        <Pencil size={10} />
                      </button>
                      {d.saldo_pendente === 0 && (
                        <button
                          type="button"
                          onClick={() => onDeleteDebtor(d.id, d.nome)}
                          className="bg-red-500/20 hover:bg-red-500/30 text-status-error border border-red-500/30 p-1 rounded transition-all"
                          title="Remover devedor"
                        >
                          <Trash2 size={10} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-1.5 pt-1.5 border-t border-border-subtle text-[9px] text-text-muted">
                  <div>
                    <span className="block">Total Emprestado:</span>
                    <span className="font-semibold font-mono text-text-secondary">{money(d.valor_total_emprestado)}</span>
                  </div>
                  <div>
                    <span className="block">Último Pagamento:</span>
                    <span className="font-semibold text-text-secondary truncate block font-mono">
                      {d.data_ultimo_pagamento ? d.data_ultimo_pagamento.split('T')[0] : 'Nenhum'}
                    </span>
                  </div>
                </div>
                {d.observacoes && (
                  <p className="text-[9px] text-text-muted italic bg-surface p-1.5 rounded border border-border-subtle truncate">
                    {d.observacoes}
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      <div className="lg:col-span-2 space-y-3 bg-surface-card backdrop-blur-md p-4 rounded-xl border border-border-subtle">
        <div className="flex justify-between items-center">
          <h3 className="text-xs font-bold text-text-muted uppercase tracking-widest flex items-center gap-1.5">
            <BarChart2 size={13} /> Distribuição de Receitas
          </h3>
          <span className="text-[10px] text-text-muted">Visualização Analítica</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="bg-surface-elevated p-3.5 rounded-xl border border-border-subtle h-[180px] flex flex-col justify-between">
            <p className="text-xs font-bold text-text-muted mb-1 flex items-center gap-1">
              <PieIcon size={12} /> Concentração por Categorias
            </p>
            <div className="flex-1 min-h-[125px]">
              {dashboard?.categorias && dashboard.categorias.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <PieChart>
                    <Pie
                      data={dashboard.categorias}
                      dataKey="valor"
                      nameKey="categoria"
                      cx="50%"
                      cy="50%"
                      outerRadius={46}
                      fill="#3b82f6"
                      labelLine={false}
                    >
                      {dashboard.categorias.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'][index % 5]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ backgroundColor: palette.tooltipBg, borderColor: palette.tooltipBorder }}
                      formatter={(val) => money(val as number)}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-xs text-text-muted">Sem dados.</div>
              )}
            </div>
          </div>

          <div className="bg-surface-elevated p-3.5 rounded-xl border border-border-subtle h-[180px] flex flex-col justify-between">
            <p className="text-xs font-bold text-text-muted mb-1 flex items-center gap-1">
              <TrendingUp size={12} /> Evolução de Faturas
            </p>
            <div className="flex-1 min-h-[125px]">
              {faturasCalculated.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <AreaChart data={faturasCalculated}>
                    <defs>
                      <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="colorRec" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="fatura" stroke={palette.axis} fontSize={9} />
                    <Tooltip
                      contentStyle={{ backgroundColor: palette.tooltipBg, borderColor: palette.tooltipBorder }}
                      formatter={(val) => money(val as number)}
                    />
                    <Area type="monotone" dataKey="total" name="Total Fatura" stroke="#3b82f6" fillOpacity={1} fill="url(#colorTotal)" />
                    <Area type="monotone" dataKey="recebido" name="Recebido" stroke="#10b981" fillOpacity={1} fill="url(#colorRec)" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-xs text-text-muted">Sem dados.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
