'use client';

import { BarChart2, FileText, User, X } from 'lucide-react';
import { formatMoney } from '@/lib/format';
import { usePrivacy } from '@/context/PrivacyContext';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ReceivablesModals } from './ReceivablesModals';
import { useReceivablesData } from './useReceivablesData';
import { ReceivablesHeaderAndKpis } from './ReceivablesHeaderAndKpis';
import { ReceivablesInstallmentsView } from './ReceivablesInstallmentsView';
import { ReceivablesDebtorsAnalytics } from './ReceivablesDebtorsAnalytics';

export const ReceivablesTab = () => {
  const { isHidden } = usePrivacy();
  const money = (v: number) => (isHidden ? 'R$ •••••' : formatMoney(v));
  const r = useReceivablesData();

  return (
    <div className="space-y-4 text-text-primary animate-in fade-in duration-300 pb-6">
      <ReceivablesHeaderAndKpis
        overdueItemsCount={r.overdueItemsCount}
        fechamentoDia={r.fechamentoDia}
        headerTotalLent={r.headerTotalLent}
        headerTotalReceived={r.headerTotalReceived}
        headerTotalPending={r.headerTotalPending}
        headerTotalOverdue={r.headerTotalOverdue}
        money={money}
        onOpenConfig={() => r.setIsConfigOpen(true)}
        onOpenNewDebtor={r.handleOpenNewDebtor}
        onOpenNewLoan={r.handleOpenNewLoan}
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => r.setActiveSubTab('lancamentos')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold transition-colors border ${
              r.activeSubTab === 'lancamentos'
                ? 'bg-accent-soft text-accent border-accent/40 shadow-sm'
                : 'bg-surface-card text-text-muted border-border-subtle hover:bg-surface-elevated hover:text-text-primary'
            }`}
          >
            <FileText size={13} />
            <span>Faturas &amp; Lançamentos</span>
            <span className="text-[10px] opacity-75 font-mono">({r.filteredInstallments.length})</span>
          </button>

          <button
            type="button"
            onClick={() => r.setActiveSubTab('analises')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold transition-colors border ${
              r.activeSubTab === 'analises'
                ? 'bg-accent-soft text-accent border-accent/40 shadow-sm'
                : 'bg-surface-card text-text-muted border-border-subtle hover:bg-surface-elevated hover:text-text-primary'
            }`}
          >
            <BarChart2 size={13} />
            <span>Devedores &amp; Análises</span>
            <span className="text-[10px] opacity-75 font-mono">({r.debtors.length})</span>
          </button>
        </div>

        {r.selectedPersonFilter !== 'Todos' && (
          <button
            type="button"
            onClick={() => r.setSelectedPersonFilter('Todos')}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-accent-soft border border-accent/30 text-accent text-xs font-semibold hover:opacity-90 transition-colors"
            title="Limpar filtro de devedor"
          >
            <User size={12} />
            <span>{r.selectedPersonFilter}</span>
            <X size={12} />
          </button>
        )}
      </div>

      {r.activeSubTab === 'lancamentos' && (
        <ReceivablesInstallmentsView
          faturasCalculated={r.faturasCalculated}
          selectedFatura={r.selectedFatura}
          onSelectFatura={r.setSelectedFatura}
          headerTotalPending={r.headerTotalPending}
          selectedStatusFilter={r.selectedStatusFilter}
          onSelectStatusFilter={r.setSelectedStatusFilter}
          selectedPersonFilter={r.selectedPersonFilter}
          onSelectPersonFilter={r.setSelectedPersonFilter}
          debtorOptions={r.debtorOptions}
          pendingSearch={r.pendingSearch}
          onSearchChange={r.handleSearchChange}
          isPending={r.isPending}
          selectedInstallments={r.selectedInstallments}
          onChangeSelectedInstallments={r.setSelectedInstallments}
          onPayBatch={() => {
            if (r.selectedInstallments.length > 0) r.setConfirmAction({ kind: 'batch' });
          }}
          filteredInstallments={r.filteredInstallments}
          loans={r.loans}
          money={money}
          onOpenPay={r.handleOpenPay}
          onOpenEditLoan={r.handleOpenEditLoan}
          onDeleteLoan={(id, desc) => r.setConfirmAction({ kind: 'loan', id, desc })}
        />
      )}

      {r.activeSubTab === 'analises' && (
        <ReceivablesDebtorsAnalytics
          debtors={r.debtors}
          dashboard={r.dashboard}
          faturasCalculated={r.faturasCalculated}
          money={money}
          onSelectDebtor={(nome) => {
            r.setSelectedPersonFilter(nome);
            r.setActiveSubTab('lancamentos');
          }}
          onOpenGlobalPay={r.handleOpenGlobalPay}
          onOpenEditDebtor={r.handleOpenEditDebtor}
          onDeleteDebtor={(id, nome) => r.setConfirmAction({ kind: 'debtor', id, nome })}
        />
      )}

      <ReceivablesModals
        money={money}
        isConfigOpen={r.isConfigOpen}
        onCloseConfig={() => r.setIsConfigOpen(false)}
        fechamentoDia={r.fechamentoDia}
        setFechamentoDia={r.setFechamentoDia}
        vencimentoDia={r.vencimentoDia}
        setVencimentoDia={r.setVencimentoDia}
        onSaveConfig={r.handleSaveConfig}
        isDebtorModalOpen={r.isDebtorModalOpen}
        onCloseDebtorModal={() => r.setIsDebtorModalOpen(false)}
        editingDebtorId={r.editingDebtorId}
        newDebtorNome={r.newDebtorNome}
        setNewDebtorNome={r.setNewDebtorNome}
        newDebtorTelefone={r.newDebtorTelefone}
        setNewDebtorTelefone={r.setNewDebtorTelefone}
        newDebtorObs={r.newDebtorObs}
        setNewDebtorObs={r.setNewDebtorObs}
        onCreateDebtor={r.handleCreateDebtor}
        isLoanModalOpen={r.isLoanModalOpen}
        onCloseLoanModal={() => r.setIsLoanModalOpen(false)}
        editingLoanId={r.editingLoanId}
        newLoanDebtorId={r.newLoanDebtorId}
        setNewLoanDebtorId={r.setNewLoanDebtorId}
        debtorOptions={r.debtorOptions}
        newLoanCat={r.newLoanCat}
        setNewLoanCat={r.setNewLoanCat}
        newLoanDesc={r.newLoanDesc}
        setNewLoanDesc={r.setNewLoanDesc}
        newLoanVal={r.newLoanVal}
        setNewLoanVal={r.setNewLoanVal}
        newLoanDate={r.newLoanDate}
        setNewLoanDate={r.setNewLoanDate}
        newLoanParcelado={r.newLoanParcelado}
        setNewLoanParcelado={r.setNewLoanParcelado}
        newLoanTotalParc={r.newLoanTotalParc}
        setNewLoanTotalParc={r.setNewLoanTotalParc}
        newLoanObs={r.newLoanObs}
        setNewLoanObs={r.setNewLoanObs}
        onCreateLoan={r.handleCreateLoan}
        isPaymentModalOpen={r.isPaymentModalOpen}
        onClosePaymentModal={() => r.setIsPaymentModalOpen(false)}
        payingInstallment={r.payingInstallment}
        payingLoanDesc={r.payingLoanDesc}
        payingValue={r.payingValue}
        setPayingValue={r.setPayingValue}
        payingMethod={r.payingMethod}
        setPayingMethod={r.setPayingMethod}
        onPayInstallment={r.handlePayInstallment}
        isGlobalPayModalOpen={r.isGlobalPayModalOpen}
        onCloseGlobalPayModal={() => r.setIsGlobalPayModalOpen(false)}
        globalPayDebtor={r.globalPayDebtor}
        globalPayValue={r.globalPayValue}
        setGlobalPayValue={r.setGlobalPayValue}
        globalPayMethod={r.globalPayMethod}
        setGlobalPayMethod={r.setGlobalPayMethod}
        onPayGlobalDebtor={r.handlePayGlobalDebtor}
      />

      <ConfirmDialog
        isOpen={r.confirmAction !== null}
        title={
          r.confirmAction?.kind === 'batch'
            ? 'Liquidar parcelas'
            : r.confirmAction?.kind === 'loan'
              ? 'Excluir empréstimo'
              : 'Excluir devedor'
        }
        message={
          r.confirmAction?.kind === 'batch'
            ? `Confirmar liquidação das ${r.selectedInstallments.length} parcelas selecionadas?`
            : r.confirmAction?.kind === 'loan'
              ? `Deseja excluir permanentemente o empréstimo "${r.confirmAction.desc}" e todas as suas parcelas?`
              : r.confirmAction?.kind === 'debtor'
                ? `Deseja excluir o perfil de "${r.confirmAction.nome}"? Todos os empréstimos ativos dele serão arquivados.`
                : ''
        }
        confirmLabel={r.confirmLoading ? 'Processando...' : r.confirmAction?.kind === 'batch' ? 'Liquidar' : 'Excluir'}
        onCancel={() => { if (!r.confirmLoading) r.setConfirmAction(null); }}
        onConfirm={r.executeConfirmAction}
      />
    </div>
  );
};
