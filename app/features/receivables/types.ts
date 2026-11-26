import { ReceivableInstallmentItem } from '@/types';

export type ReceivablesConfirmAction =
  | { kind: 'batch' }
  | { kind: 'loan'; id: number; desc: string }
  | { kind: 'debtor'; id: number; nome: string };

export interface DebtorItem {
  id: number;
  nome: string;
  foto_url?: string;
  telefone?: string;
  observacoes?: string;
  valor_total_emprestado: number;
  valor_total_recebido: number;
  saldo_pendente: number;
  data_ultimo_pagamento?: string;
  data_primeiro_emprestimo?: string;
  data_ultimo_contato?: string;
}

export interface LoanItem {
  id: number;
  debtor_id: number;
  debtor_nome: string;
  descricao: string;
  categoria: string;
  data_emprestimo: string;
  valor_total: number;
  is_parcelado: boolean;
  total_parcelas: number;
  status: string;
  fatura_mes: string;
  observacoes?: string;
  installments: ReceivableInstallmentItem[];
}

export interface CompiledInstallment {
  loanId: number;
  loanDesc: string;
  debtorNome: string;
  categoria: string;
  installment: ReceivableInstallmentItem;
}

export interface FaturaSummary {
  fatura: string;
  total: number;
  recebido: number;
  pendente: number;
  status: string;
  items_count: number;
}

export const getErrorMessage = (err: unknown, fallback: string) =>
  err instanceof Error ? err.message : fallback;
