'use client';

import {
  Plus,
  CheckCircle,
  User,
  Wallet,
  Settings,
  TrendingUp,
  AlertCircle,
  DollarSign,
} from 'lucide-react';

interface ReceivablesHeaderAndKpisProps {
  overdueItemsCount: number;
  fechamentoDia: string;
  headerTotalLent: number;
  headerTotalReceived: number;
  headerTotalPending: number;
  headerTotalOverdue: number;
  money: (v: number) => string;
  onOpenConfig: () => void;
  onOpenNewDebtor: () => void;
  onOpenNewLoan: () => void;
}

export function ReceivablesHeaderAndKpis({
  overdueItemsCount,
  fechamentoDia,
  headerTotalLent,
  headerTotalReceived,
  headerTotalPending,
  headerTotalOverdue,
  money,
  onOpenConfig,
  onOpenNewDebtor,
  onOpenNewLoan,
}: ReceivablesHeaderAndKpisProps) {
  return (
    <>
      {overdueItemsCount > 0 && (
        <div className="bg-red-500/10 border border-red-500/30 px-3.5 py-2.5 rounded-xl flex items-center justify-between shadow-lg backdrop-blur-md">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="text-status-error shrink-0" size={16} />
            <p className="text-xs text-status-error">
              <span className="font-bold">Atenção ao Inadimplemento:</span> Você possui {overdueItemsCount} parcelas em atraso na carteira de reembolsos.
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-surface-card backdrop-blur-md px-4 py-3 rounded-xl border border-border-subtle">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2 bg-accent-soft text-accent rounded-lg border border-accent/20 shrink-0">
            <Wallet size={17} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-bold tracking-tight text-text-primary">Reembolsos</h2>
              <span className="text-[10px] text-text-muted bg-surface-elevated border border-border-subtle px-2 py-0.5 rounded-md font-medium">
                Fechamento Dia {fechamentoDia}
              </span>
            </div>
            <p className="text-xs text-text-muted truncate">Empréstimos, faturas virtuais e fluxos de caixa a receber.</p>
          </div>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
          <button
            type="button"
            onClick={onOpenConfig}
            className="p-2 bg-surface-elevated hover:bg-surface-input text-text-secondary hover:text-text-primary rounded-lg border border-border-subtle transition-all"
            title="Configurações de Fechamento e Vencimento"
          >
            <Settings size={15} />
          </button>
          <button
            type="button"
            onClick={onOpenNewDebtor}
            className="flex-1 sm:flex-initial bg-surface-elevated hover:bg-surface-input text-text-primary px-3 py-1.5 rounded-lg border border-border-subtle flex items-center justify-center gap-1.5 text-xs font-bold transition-all"
          >
            <User size={14} /> Novo Devedor
          </button>
          <button
            type="button"
            onClick={onOpenNewLoan}
            className="flex-1 sm:flex-initial bg-accent hover:bg-accent-hover text-white px-3 py-1.5 rounded-lg flex items-center justify-center gap-1.5 text-xs font-bold shadow-lg transition-all"
          >
            <Plus size={14} /> Novo Empréstimo
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-surface-card backdrop-blur-md p-3.5 rounded-xl border border-border-subtle flex items-center gap-3">
          <div className="p-2 bg-accent-soft text-accent rounded-lg border border-accent/20">
            <DollarSign size={18} />
          </div>
          <div>
            <span className="text-[10px] text-text-muted uppercase font-bold tracking-wider">Total Emprestado</span>
            <p className="text-lg font-bold font-mono text-text-primary mt-0.5">{money(headerTotalLent)}</p>
          </div>
        </div>

        <div className="bg-surface-card backdrop-blur-md p-3.5 rounded-xl border border-border-subtle flex items-center gap-3">
          <div className="p-2 bg-emerald-500/10 text-status-success rounded-lg border border-emerald-500/20">
            <CheckCircle size={18} />
          </div>
          <div>
            <span className="text-[10px] text-text-muted uppercase font-bold tracking-wider">Total Recebido</span>
            <p className="text-lg font-bold font-mono text-status-success mt-0.5">{money(headerTotalReceived)}</p>
          </div>
        </div>

        <div className="bg-surface-card backdrop-blur-md p-3.5 rounded-xl border border-border-subtle flex items-center gap-3">
          <div className="p-2 bg-yellow-500/10 text-status-warning rounded-lg border border-yellow-500/20">
            <TrendingUp size={18} />
          </div>
          <div>
            <span className="text-[10px] text-text-muted uppercase font-bold tracking-wider">Saldo Pendente</span>
            <p className="text-lg font-bold font-mono text-status-warning mt-0.5">{money(headerTotalPending)}</p>
          </div>
        </div>

        <div className="bg-surface-card backdrop-blur-md p-3.5 rounded-xl border border-border-subtle flex items-center gap-3">
          <div className="p-2 bg-red-500/10 text-status-error rounded-lg border border-red-500/20">
            <AlertCircle size={18} />
          </div>
          <div>
            <span className="text-[10px] text-text-muted uppercase font-bold tracking-wider">Montante Atrasado</span>
            <p className="text-lg font-bold font-mono text-status-error mt-0.5">{money(headerTotalOverdue)}</p>
          </div>
        </div>
      </div>
    </>
  );
}
