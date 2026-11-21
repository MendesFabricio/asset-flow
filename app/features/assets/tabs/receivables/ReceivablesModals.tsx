'use client';

import React from 'react';
import { CheckCircle, CheckSquare, Plus, Settings, User, X } from 'lucide-react';
import { ReceivableInstallmentItem } from '@/types';

export interface ReceivablesDebtorOption {
  id: number;
  nome: string;
}

export interface ReceivablesDebtorSummary {
  id: number;
  nome: string;
  saldo_pendente: number;
}

interface ReceivablesModalsProps {
  money: (val: number) => string;
  isConfigOpen: boolean;
  onCloseConfig: () => void;
  fechamentoDia: string;
  setFechamentoDia: (v: string) => void;
  vencimentoDia: string;
  setVencimentoDia: (v: string) => void;
  onSaveConfig: () => void;
  isDebtorModalOpen: boolean;
  onCloseDebtorModal: () => void;
  editingDebtorId: number | null;
  newDebtorNome: string;
  setNewDebtorNome: (v: string) => void;
  newDebtorTelefone: string;
  setNewDebtorTelefone: (v: string) => void;
  newDebtorObs: string;
  setNewDebtorObs: (v: string) => void;
  onCreateDebtor: () => void;
  isLoanModalOpen: boolean;
  onCloseLoanModal: () => void;
  editingLoanId: number | null;
  newLoanDebtorId: string;
  setNewLoanDebtorId: (v: string) => void;
  debtorOptions: ReceivablesDebtorOption[];
  newLoanCat: string;
  setNewLoanCat: (v: string) => void;
  newLoanDesc: string;
  setNewLoanDesc: (v: string) => void;
  newLoanVal: string;
  setNewLoanVal: (v: string) => void;
  newLoanDate: string;
  setNewLoanDate: (v: string) => void;
  newLoanParcelado: boolean;
  setNewLoanParcelado: (v: boolean) => void;
  newLoanTotalParc: string;
  setNewLoanTotalParc: (v: string) => void;
  newLoanObs: string;
  setNewLoanObs: (v: string) => void;
  onCreateLoan: () => void;
  isPaymentModalOpen: boolean;
  onClosePaymentModal: () => void;
  payingInstallment: ReceivableInstallmentItem | null;
  payingLoanDesc: string;
  payingValue: string;
  setPayingValue: (v: string) => void;
  payingMethod: string;
  setPayingMethod: (v: string) => void;
  onPayInstallment: () => void;
  isGlobalPayModalOpen: boolean;
  onCloseGlobalPayModal: () => void;
  globalPayDebtor: ReceivablesDebtorSummary | null;
  globalPayValue: string;
  setGlobalPayValue: (v: string) => void;
  globalPayMethod: string;
  setGlobalPayMethod: (v: string) => void;
  onPayGlobalDebtor: () => void;
}

const LOAN_CATEGORIES = ['Geral', 'Aluguel', 'Refeição', 'Viagem', 'Transporte', 'Outros'] as const;
const PAYMENT_METHODS = [
  { value: 'Pix', label: 'Pix' },
  { value: 'Dinheiro', label: 'Dinheiro' },
  { value: 'Crédito', label: 'Crédito / Boleto' },
  { value: 'Outro', label: 'Outro' },
] as const;

export function ReceivablesModals(props: ReceivablesModalsProps) {
  const {
    money,
    isConfigOpen,
    onCloseConfig,
    fechamentoDia,
    setFechamentoDia,
    vencimentoDia,
    setVencimentoDia,
    onSaveConfig,
    isDebtorModalOpen,
    onCloseDebtorModal,
    editingDebtorId,
    newDebtorNome,
    setNewDebtorNome,
    newDebtorTelefone,
    setNewDebtorTelefone,
    newDebtorObs,
    setNewDebtorObs,
    onCreateDebtor,
    isLoanModalOpen,
    onCloseLoanModal,
    editingLoanId,
    newLoanDebtorId,
    setNewLoanDebtorId,
    debtorOptions,
    newLoanCat,
    setNewLoanCat,
    newLoanDesc,
    setNewLoanDesc,
    newLoanVal,
    setNewLoanVal,
    newLoanDate,
    setNewLoanDate,
    newLoanParcelado,
    setNewLoanParcelado,
    newLoanTotalParc,
    setNewLoanTotalParc,
    newLoanObs,
    setNewLoanObs,
    onCreateLoan,
    isPaymentModalOpen,
    onClosePaymentModal,
    payingInstallment,
    payingLoanDesc,
    payingValue,
    setPayingValue,
    payingMethod,
    setPayingMethod,
    onPayInstallment,
    isGlobalPayModalOpen,
    onCloseGlobalPayModal,
    globalPayDebtor,
    globalPayValue,
    setGlobalPayValue,
    globalPayMethod,
    setGlobalPayMethod,
    onPayGlobalDebtor,
  } = props;

  return (
    <>
      {isConfigOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="bg-surface-card p-6 rounded-2xl border border-border-subtle w-full max-w-sm space-y-4 shadow-2xl animate-in zoom-in-95 relative">
            <button type="button" onClick={onCloseConfig} aria-label="Fechar" className="absolute top-4 right-4 text-text-muted hover:text-text-primary transition-colors"><X size={20} /></button>
            <h3 className="text-lg font-bold text-text-primary flex items-center gap-2"><Settings className="text-blue-500" /> Configurar Fatura</h3>
            <div className="space-y-4">
              <div>
                <label className="text-[11px] text-text-muted uppercase font-bold pl-1 mb-1 block">Dia de Fechamento</label>
                <input
                  type="number"
                  min="1"
                  max="31"
                  className="w-full bg-surface-input border border-border-subtle p-3 rounded-xl text-text-primary outline-none focus:border-accent transition-colors font-mono font-bold"
                  value={fechamentoDia}
                  onChange={e => setFechamentoDia(e.target.value)}
                />
              </div>
              <div>
                <label className="text-[11px] text-text-muted uppercase font-bold pl-1 mb-1 block">Dia de Vencimento</label>
                <input
                  type="number"
                  min="1"
                  max="31"
                  className="w-full bg-surface-input border border-border-subtle p-3 rounded-xl text-text-primary outline-none focus:border-accent transition-colors font-mono font-bold"
                  value={vencimentoDia}
                  onChange={e => setVencimentoDia(e.target.value)}
                />
              </div>
            </div>
            <button
              type="button"
              onClick={onSaveConfig}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white p-3 rounded-xl font-bold transition-all"
            >
              Salvar Configuração
            </button>
          </div>
        </div>
      )}

      {isDebtorModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="bg-surface-card p-6 rounded-2xl border border-border-subtle w-full max-w-sm space-y-4 shadow-2xl animate-in zoom-in-95 relative">
            <button type="button" onClick={onCloseDebtorModal} aria-label="Fechar" className="absolute top-4 right-4 text-text-muted hover:text-text-primary transition-colors"><X size={20} /></button>
            <h3 className="text-lg font-bold text-text-primary flex items-center gap-2">
              <User className="text-blue-500" /> {editingDebtorId ? 'Editar Devedor' : 'Cadastrar Devedor'}
            </h3>
            <div className="space-y-3">
              <div>
                <label className="text-[11px] text-text-muted uppercase font-bold pl-1 mb-1 block">Nome Completo</label>
                <input
                  type="text"
                  placeholder="Ex: Lucas, Pedro..."
                  className="w-full bg-surface-input border border-border-subtle p-3 rounded-xl text-text-primary outline-none focus:border-accent transition-colors"
                  value={newDebtorNome}
                  onChange={e => setNewDebtorNome(e.target.value)}
                />
              </div>
              <div>
                <label className="text-[11px] text-text-muted uppercase font-bold pl-1 mb-1 block">Telefone (Opcional)</label>
                <input
                  type="text"
                  placeholder="Ex: (11) 99999-9999"
                  className="w-full bg-surface-input border border-border-subtle p-3 rounded-xl text-text-primary outline-none focus:border-accent transition-colors font-mono"
                  value={newDebtorTelefone}
                  onChange={e => setNewDebtorTelefone(e.target.value)}
                />
              </div>
              <div>
                <label className="text-[11px] text-text-muted uppercase font-bold pl-1 mb-1 block">Anotações</label>
                <textarea
                  placeholder="Ex: Contato financeiro preferido..."
                  rows={2}
                  className="w-full bg-surface-input border border-border-subtle p-3 rounded-xl text-text-primary outline-none focus:border-accent transition-colors text-xs resize-none"
                  value={newDebtorObs}
                  onChange={e => setNewDebtorObs(e.target.value)}
                />
              </div>
            </div>
            <button
              type="button"
              onClick={onCreateDebtor}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white p-3 rounded-xl font-bold transition-all"
            >
              {editingDebtorId ? 'Atualizar Devedor' : 'Criar Devedor'}
            </button>
          </div>
        </div>
      )}

      {isLoanModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="bg-surface-card p-6 rounded-2xl border border-border-subtle w-full max-w-md space-y-4 shadow-2xl animate-in zoom-in-95 relative">
            <button type="button" onClick={onCloseLoanModal} aria-label="Fechar" className="absolute top-4 right-4 text-text-muted hover:text-text-primary transition-colors"><X size={20} /></button>
            <h3 className="text-lg font-bold text-text-primary flex items-center gap-2">
              <Plus className="text-blue-500" /> {editingLoanId ? 'Editar Detalhes do Empréstimo' : 'Registrar Empréstimo'}
            </h3>
            <div className="space-y-3">
              {!editingLoanId ? (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-text-muted uppercase font-bold pl-1 mb-1 block">Devedor</label>
                    <select
                      value={newLoanDebtorId}
                      onChange={e => setNewLoanDebtorId(e.target.value)}
                      className="w-full bg-surface-input border border-border-subtle p-3 rounded-xl text-text-primary outline-none focus:border-accent transition-colors text-xs cursor-pointer"
                    >
                      <option value="">Selecione...</option>
                      {debtorOptions.map(opt => (
                        <option key={opt.id} value={opt.id}>{opt.nome}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] text-text-muted uppercase font-bold pl-1 mb-1 block">Categoria</label>
                    <select
                      value={newLoanCat}
                      onChange={e => setNewLoanCat(e.target.value)}
                      className="w-full bg-surface-input border border-border-subtle p-3 rounded-xl text-text-primary outline-none focus:border-accent transition-colors text-xs cursor-pointer"
                    >
                      {LOAN_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                    </select>
                  </div>
                </div>
              ) : (
                <div>
                  <label className="text-[11px] text-text-muted uppercase font-bold pl-1 mb-1 block">Categoria</label>
                  <select
                    value={newLoanCat}
                    onChange={e => setNewLoanCat(e.target.value)}
                    className="w-full bg-surface-input border border-border-subtle p-3 rounded-xl text-text-primary outline-none focus:border-accent transition-colors text-xs cursor-pointer"
                  >
                    {LOAN_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                  </select>
                </div>
              )}

              <div>
                <label className="text-[11px] text-text-muted uppercase font-bold pl-1 mb-1 block">Descrição</label>
                <input
                  type="text"
                  placeholder="Ex: Jantar de aniversário"
                  className="w-full bg-surface-input border border-border-subtle p-3 rounded-xl text-text-primary outline-none focus:border-accent transition-colors text-xs"
                  value={newLoanDesc}
                  onChange={e => setNewLoanDesc(e.target.value)}
                />
              </div>

              {!editingLoanId && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] text-text-muted uppercase font-bold pl-1 mb-1 block">Valor Total</label>
                      <input
                        type="number"
                        placeholder="R$ 0,00"
                        className="w-full bg-surface-input border border-border-subtle p-3 rounded-xl text-text-primary outline-none focus:border-accent transition-colors font-mono font-bold"
                        value={newLoanVal}
                        onChange={e => setNewLoanVal(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-text-muted uppercase font-bold pl-1 mb-1 block">Data de Empréstimo</label>
                      <input
                        type="date"
                        className="w-full bg-surface-input border border-border-subtle p-3 rounded-xl text-text-primary outline-none focus:border-accent transition-colors font-mono"
                        value={newLoanDate}
                        onChange={e => setNewLoanDate(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="bg-surface-elevated p-3 rounded-xl border border-border-subtle space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-text-muted">Empréstimo Parcelado?</span>
                      <input
                        type="checkbox"
                        checked={newLoanParcelado}
                        onChange={e => setNewLoanParcelado(e.target.checked)}
                        className="cursor-pointer accent-blue-500 w-4 h-4"
                      />
                    </div>
                    {newLoanParcelado && (
                      <div>
                        <label className="text-[11px] text-text-muted uppercase font-bold pl-1 mb-1 block">Quantidade de Parcelas</label>
                        <input
                          type="number"
                          min="2"
                          placeholder="Qtd parcelas"
                          className="w-full bg-surface-input border border-border-subtle p-2.5 rounded-lg text-text-primary outline-none focus:border-accent transition-colors font-mono"
                          value={newLoanTotalParc}
                          onChange={e => setNewLoanTotalParc(e.target.value)}
                        />
                      </div>
                    )}
                  </div>
                </>
              )}

              <div>
                <label className="text-[11px] text-text-muted uppercase font-bold pl-1 mb-1 block">Observações / Anotações</label>
                <textarea
                  placeholder="Anotações adicionais para este empréstimo..."
                  rows={2}
                  className="w-full bg-surface-input border border-border-subtle p-3 rounded-xl text-text-primary outline-none focus:border-accent transition-colors text-xs resize-none"
                  value={newLoanObs}
                  onChange={e => setNewLoanObs(e.target.value)}
                />
              </div>
            </div>
            <button
              type="button"
              onClick={onCreateLoan}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white p-3 rounded-xl font-bold transition-all"
            >
              {editingLoanId ? 'Salvar Alterações' : 'Criar Empréstimo'}
            </button>
          </div>
        </div>
      )}

      {isPaymentModalOpen && payingInstallment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="bg-surface-card p-6 rounded-2xl border border-border-subtle w-full max-w-sm space-y-4 shadow-2xl animate-in zoom-in-95 relative">
            <button type="button" onClick={onClosePaymentModal} aria-label="Fechar" className="absolute top-4 right-4 text-text-muted hover:text-text-primary transition-colors"><X size={20} /></button>
            <h3 className="text-lg font-bold text-text-primary flex items-center gap-2"><CheckSquare className="text-emerald-500" /> Registrar Recebimento</h3>

            <div className="space-y-1.5 p-3 bg-surface-elevated rounded-xl border border-border-subtle text-xs">
              <p className="text-text-muted">Empréstimo: <span className="text-text-primary font-semibold">{payingLoanDesc}</span></p>
              <p className="text-text-muted">Parcela: <span className="text-text-primary font-mono font-semibold">#{payingInstallment.numero_parcela}</span></p>
              <p className="text-text-muted">Valor Parcela: <span className="text-status-success font-mono font-bold">{money(payingInstallment.valor_parcela)}</span></p>
              {payingInstallment.valor_pago > 0 && (
                <p className="text-text-muted">Já Recebido Parcialmente: <span className="text-text-primary font-mono">{money(payingInstallment.valor_pago)}</span></p>
              )}
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[11px] text-text-muted uppercase font-bold pl-1 mb-1 block">Valor Pago (R$)</label>
                <input
                  type="number"
                  placeholder="0,00"
                  className="w-full bg-surface-input border border-border-subtle p-3 rounded-xl text-text-primary outline-none focus:border-accent transition-colors font-mono font-bold text-lg"
                  value={payingValue}
                  onChange={e => setPayingValue(e.target.value)}
                />
                <span className="text-[10px] text-text-muted block pl-1 mt-1">Valores maiores abaterão parcelas futuras sequencialmente.</span>
              </div>

              <div>
                <label className="text-[11px] text-text-muted uppercase font-bold pl-1 mb-1 block">Forma de Pagamento</label>
                <select
                  value={payingMethod}
                  onChange={e => setPayingMethod(e.target.value)}
                  className="w-full bg-surface-input border border-border-subtle p-3 rounded-xl text-text-primary outline-none focus:border-accent transition-colors text-xs cursor-pointer"
                >
                  {PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
            </div>

            <button
              type="button"
              onClick={onPayInstallment}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white p-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2"
            >
              <CheckCircle size={16} /> Confirmar Recebimento
            </button>
          </div>
        </div>
      )}

      {isGlobalPayModalOpen && globalPayDebtor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="bg-surface-card p-6 rounded-2xl border border-border-subtle w-full max-w-sm space-y-4 shadow-2xl animate-in zoom-in-95 relative">
            <button type="button" onClick={onCloseGlobalPayModal} aria-label="Fechar" className="absolute top-4 right-4 text-text-muted hover:text-text-primary transition-colors"><X size={20} /></button>
            <h3 className="text-lg font-bold text-text-primary flex items-center gap-2"><CheckSquare className="text-emerald-500" /> Quitação / Recebimento Global</h3>

            <div className="space-y-1.5 p-3 bg-surface-elevated rounded-xl border border-border-subtle text-xs">
              <p className="text-text-muted">Devedor: <span className="text-text-primary font-semibold">{globalPayDebtor.nome}</span></p>
              <p className="text-text-muted">Saldo Devedor Total: <span className="text-status-warning font-mono font-bold">{money(globalPayDebtor.saldo_pendente)}</span></p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[11px] text-text-muted uppercase font-bold pl-1 mb-1 block">Valor Recebido (R$)</label>
                <input
                  type="number"
                  placeholder="0,00"
                  className="w-full bg-surface-input border border-border-subtle p-3 rounded-xl text-text-primary outline-none focus:border-accent transition-colors font-mono font-bold text-lg"
                  value={globalPayValue}
                  onChange={e => setGlobalPayValue(e.target.value)}
                />
                <span className="text-[10px] text-text-muted block pl-1 mt-1">Este valor quitará as parcelas em aberto mais antigas sequencialmente.</span>
              </div>

              <div>
                <label className="text-[11px] text-text-muted uppercase font-bold pl-1 mb-1 block">Forma de Pagamento</label>
                <select
                  value={globalPayMethod}
                  onChange={e => setGlobalPayMethod(e.target.value)}
                  className="w-full bg-surface-input border border-border-subtle p-3 rounded-xl text-text-primary outline-none focus:border-accent transition-colors text-xs cursor-pointer"
                >
                  {PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
            </div>

            <button
              type="button"
              onClick={onPayGlobalDebtor}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white p-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2"
            >
              <CheckCircle size={16} /> Confirmar Recebimento Lote
            </button>
          </div>
        </div>
      )}
    </>
  );
}
