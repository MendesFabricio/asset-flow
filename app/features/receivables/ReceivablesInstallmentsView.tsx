'use client';

import React from 'react';
import { CheckCircle, CheckSquare, FileText, Pencil, Trash2 } from 'lucide-react';
import { ReceivableInstallmentItem } from '@/types';
import { CompiledInstallment, FaturaSummary, LoanItem } from './types';

interface ReceivablesInstallmentsViewProps {
  faturasCalculated: FaturaSummary[];
  selectedFatura: string;
  onSelectFatura: (fatura: string) => void;
  headerTotalPending: number;
  selectedStatusFilter: string;
  onSelectStatusFilter: (status: string) => void;
  selectedPersonFilter: string;
  onSelectPersonFilter: (person: string) => void;
  debtorOptions: { id: number; nome: string }[];
  pendingSearch: string;
  onSearchChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  isPending: boolean;
  selectedInstallments: number[];
  onChangeSelectedInstallments: React.Dispatch<React.SetStateAction<number[]>>;
  onPayBatch: () => void;
  filteredInstallments: CompiledInstallment[];
  loans: LoanItem[];
  money: (v: number) => string;
  onOpenPay: (inst: ReceivableInstallmentItem, loanDesc: string) => void;
  onOpenEditLoan: (loanId: number) => void;
  onDeleteLoan: (loanId: number, loanDesc: string) => void;
}

export function ReceivablesInstallmentsView({
  faturasCalculated,
  selectedFatura,
  onSelectFatura,
  headerTotalPending,
  selectedStatusFilter,
  onSelectStatusFilter,
  selectedPersonFilter,
  onSelectPersonFilter,
  debtorOptions,
  pendingSearch,
  onSearchChange,
  isPending,
  selectedInstallments,
  onChangeSelectedInstallments,
  onPayBatch,
  filteredInstallments,
  loans,
  money,
  onOpenPay,
  onOpenEditLoan,
  onDeleteLoan,
}: ReceivablesInstallmentsViewProps) {
  const openCount = filteredInstallments.filter((i) => i.installment.status !== 'PAGA').length;

  return (
    <>
      <div className="space-y-2">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-2.5 overflow-x-auto pb-1 scrollbar-thin">
          <button
            type="button"
            onClick={() => onSelectFatura('Todas')}
            className={`p-2.5 rounded-xl border transition-all text-left flex flex-col justify-between h-[72px] ${
              selectedFatura === 'Todas'
                ? 'bg-accent-soft border-accent text-text-primary shadow-lg'
                : 'bg-surface-card border-border-subtle hover:border-border-subtle/80 text-text-muted'
            }`}
          >
            <div className="flex justify-between items-start w-full">
              <span className="text-[10px] font-bold uppercase tracking-wider">Consolidado</span>
              <span className="text-[9px] bg-surface-elevated px-1.5 py-0.5 rounded font-mono">TODAS</span>
            </div>
            <p className={`text-sm font-bold font-mono ${selectedFatura === 'Todas' ? 'text-accent' : 'text-text-primary'}`}>
              {money(headerTotalPending)}
            </p>
          </button>

          {faturasCalculated.map((fat) => {
            const isSelected = selectedFatura === fat.fatura;
            let statusColor = 'bg-surface-elevated text-text-muted border-border-subtle';
            if (fat.status === 'RECEBIDA') statusColor = 'bg-emerald-500/10 text-status-success border-emerald-500/30';
            else if (fat.status === 'RECEBIDA_PARCIALMENTE') statusColor = 'bg-yellow-500/10 text-status-warning border-yellow-500/30';
            else if (fat.status === 'FECHADA') statusColor = 'bg-red-500/10 text-status-error border-red-500/30';

            return (
              <button
                type="button"
                key={fat.fatura}
                onClick={() => onSelectFatura(fat.fatura)}
                className={`p-2.5 rounded-xl border transition-all text-left flex flex-col justify-between h-[72px] ${
                  isSelected
                    ? 'bg-accent-soft border-accent text-text-primary shadow-lg'
                    : 'bg-surface-card border-border-subtle hover:border-border-subtle/80 text-text-muted'
                }`}
              >
                <div className="flex justify-between items-start w-full gap-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider truncate">{fat.fatura}</span>
                  <span className={`text-[8px] px-1 rounded border shrink-0 font-bold ${statusColor}`}>
                    {fat.status.replaceAll('_', ' ')}
                  </span>
                </div>
                <div>
                  <p className={`text-sm font-bold font-mono leading-tight ${isSelected ? 'text-accent' : 'text-text-primary'}`}>
                    {money(fat.pendente)}
                  </p>
                  <p className="text-[9px] text-text-muted font-medium leading-tight">
                    De {money(fat.total)} ({fat.items_count}p)
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="bg-surface-card backdrop-blur-md p-4 rounded-xl border border-border-subtle space-y-3">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
            <h3 className="text-sm font-bold text-text-muted uppercase tracking-widest flex items-center gap-1.5">
              <FileText size={14} /> Detalhamento de Lançamentos
            </h3>
            <div className="flex items-center gap-2 bg-surface p-1.5 rounded-lg border border-border-subtle">
              {['Todos', 'Pendentes', 'Pagas', 'Atrasadas'].map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => onSelectStatusFilter(status)}
                  className={`px-3 py-1 rounded text-xs font-bold transition-all ${
                    selectedStatusFilter === status
                      ? 'bg-accent text-white'
                      : 'text-text-muted hover:text-text-primary'
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3 w-full lg:w-auto shrink-0">
            <select
              value={selectedPersonFilter}
              onChange={(e) => onSelectPersonFilter(e.target.value)}
              className="bg-surface-input border border-border-subtle p-2 rounded-lg text-xs font-bold outline-none text-text-secondary focus:border-accent transition-all cursor-pointer"
            >
              <option value="Todos">Filtrar: Todos</option>
              {debtorOptions.map((opt) => (
                <option key={opt.id} value={opt.nome}>
                  {opt.nome}
                </option>
              ))}
            </select>

            <div className="relative w-full lg:w-[220px]">
              <input
                type="text"
                placeholder="Buscar por descrição..."
                value={pendingSearch}
                onChange={onSearchChange}
                className="w-full bg-surface-input border border-border-subtle p-2 pl-3 rounded-lg text-xs outline-none text-text-primary focus:border-accent transition-colors"
              />
              {isPending && (
                <span className="absolute right-3 top-2.5 w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              )}
            </div>

            {selectedInstallments.length > 0 && (
              <button
                type="button"
                onClick={onPayBatch}
                className="bg-emerald-600 hover:bg-emerald-500 text-white px-3.5 py-2 rounded-lg text-xs font-bold transition-all shrink-0 flex items-center gap-1 shadow-md"
              >
                <CheckSquare size={13} /> Receber ({selectedInstallments.length})
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-border-subtle bg-surface">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-surface-elevated text-text-muted font-bold border-b border-border-subtle uppercase tracking-wider text-[10px]">
                <th className="py-2.5 px-3 w-[36px] text-center">
                  <input
                    type="checkbox"
                    checked={selectedInstallments.length > 0 && selectedInstallments.length === openCount}
                    onChange={(e) => {
                      if (e.target.checked) {
                        onChangeSelectedInstallments(
                          filteredInstallments.filter((i) => i.installment.status !== 'PAGA').map((i) => i.installment.id)
                        );
                      } else {
                        onChangeSelectedInstallments([]);
                      }
                    }}
                    className="cursor-pointer accent-blue-500"
                  />
                </th>
                <th className="py-2.5 px-3">Descrição</th>
                <th className="py-2.5 px-3">Devedor</th>
                <th className="py-2.5 px-3">Categoria</th>
                <th className="py-2.5 px-3">Parcela</th>
                <th className="py-2.5 px-3">Vencimento</th>
                <th className="py-2.5 px-3">Fatura</th>
                <th className="py-2.5 px-3 text-right">Valor</th>
                <th className="py-2.5 px-3 text-right">Pago</th>
                <th className="py-2.5 px-3 text-center">Status</th>
                <th className="py-2.5 px-3 text-center">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredInstallments.length === 0 ? (
                <tr>
                  <td colSpan={11} className="p-6 text-center text-text-muted italic">
                    Nenhum lançamento pendente encontrado para os filtros selecionados.
                  </td>
                </tr>
              ) : (
                filteredInstallments.map((item) => {
                  const isChecked = selectedInstallments.includes(item.installment.id);
                  let statusBadge = 'bg-surface-elevated text-text-muted border-border-subtle';
                  if (item.installment.status === 'PAGA') statusBadge = 'bg-emerald-500/10 text-status-success border-emerald-500/30';
                  else if (item.installment.status === 'ATRASADA') statusBadge = 'bg-red-500/10 text-status-error border-red-500/30 animate-pulse';
                  else if (item.installment.status === 'ABERTA') statusBadge = 'bg-blue-500/10 text-accent border-blue-500/30';

                  return (
                    <tr key={item.installment.id} className="border-b border-border-subtle hover:bg-surface-elevated/40 group transition-all">
                      <td className="py-2.5 px-3 text-center">
                        {item.installment.status !== 'PAGA' ? (
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              onChangeSelectedInstallments((prev) =>
                                prev.includes(item.installment.id)
                                  ? prev.filter((id) => id !== item.installment.id)
                                  : [...prev, item.installment.id]
                              );
                            }}
                            className="cursor-pointer accent-blue-500"
                          />
                        ) : (
                          <div className="w-4 h-4 mx-auto rounded flex items-center justify-center text-text-muted">
                            <CheckCircle size={10} />
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 font-medium text-text-primary max-w-[180px] truncate">{item.loanDesc}</td>
                      <td className="py-2.5 px-3 text-text-secondary font-semibold">{item.debtorNome}</td>
                      <td className="py-2.5 px-3 text-text-secondary">
                        <span className="bg-surface-elevated px-2 py-0.5 rounded border border-border-subtle text-[10px] font-medium">
                          {item.categoria}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-text-muted font-mono">
                        {item.installment.numero_parcela}/{item.loanId ? loans.find((l) => l.id === item.loanId)?.total_parcelas : 1}
                      </td>
                      <td className="py-2.5 px-3 text-text-muted font-mono">{item.installment.data_vencimento.split('T')[0]}</td>
                      <td className="py-2.5 px-3 text-text-muted font-mono font-medium">{item.installment.fatura_mes}</td>
                      <td className="py-2.5 px-3 text-right font-bold font-mono text-text-primary">{money(item.installment.valor_parcela)}</td>
                      <td className="py-2.5 px-3 text-right font-semibold font-mono text-status-success">{money(item.installment.valor_pago)}</td>
                      <td className="py-2.5 px-3 text-center">
                        <span className={`text-[9px] px-2 py-0.5 rounded border font-bold ${statusBadge}`}>
                          {item.installment.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <div className="flex items-center justify-center gap-1 opacity-75 group-hover:opacity-100 transition-all">
                          {item.installment.status !== 'PAGA' && (
                            <button
                              type="button"
                              onClick={() => onOpenPay(item.installment, item.loanDesc)}
                              className="text-text-muted hover:text-status-success p-1.5 rounded-full hover:bg-emerald-500/10 transition-colors"
                              title="Registrar recebimento"
                            >
                              <CheckCircle size={14} />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => onOpenEditLoan(item.loanId)}
                            className="text-text-muted hover:text-accent p-1.5 rounded-full hover:bg-blue-500/10 transition-colors"
                            title="Editar descrição/categoria do empréstimo"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteLoan(item.loanId, item.loanDesc)}
                            className="text-text-muted hover:text-status-error p-1.5 rounded-full hover:bg-red-500/10 transition-colors"
                            title="Excluir empréstimo"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
