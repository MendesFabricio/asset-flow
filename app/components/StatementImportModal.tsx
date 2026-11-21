'use client';

import React, { useState, useEffect } from 'react';
import { 
  X, Upload, FileText, CheckCircle, AlertCircle, 
  Calendar, CreditCard, Loader2, ArrowLeft,
  CheckSquare, Square
} from 'lucide-react';
import { formatMoney } from '../lib/format';
import { apiCall } from '../lib/api';
import { usePrivacy } from '../context/PrivacyContext';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';
import { useChartPalette } from '../lib/chartPalette';
import { CHART_PALETTE_SERIES } from '../lib/colors';

interface CardItem {
  id: number;
  name: string;
  limit: number;
  closing_day: number;
  due_day: number;
}

interface ParsedTransaction {
  id: number;
  date: string;
  description: string;
  value: number;
  type: string;
  category: string;
  raw_type: string;
  signed_value: number;
}

interface ParsedData {
  period: string;
  summary: {
    saldo_inicial: number;
    rendimento_liquido: number;
    total_entradas: number;
    total_saidas: number;
    saldo_final: number;
  };
  breakdown: {
    total_debito: number;
    total_credito_pago: number;
    total_pix_enviado: number;
    total_pix_recebido: number;
  };
  transactions: ParsedTransaction[];
  detected_month?: string;
  detected_month_label?: string;
}

interface TransactionRow extends ParsedTransaction {
  selected: boolean;
  installments_count: number;
}

interface StatementImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  cards: CardItem[];
  preSelectedCardId?: number | null;
  onSuccess: () => void;
}

export function StatementImportModal({
  isOpen,
  onClose,
  cards,
  preSelectedCardId,
  onSuccess
}: StatementImportModalProps) {
  const { isHidden } = usePrivacy();
  const money = (val: number) => (isHidden ? 'R$ •••••' : formatMoney(val));
  const [selectedCardId, setSelectedCardId] = useState<number | ''>('');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const palette = useChartPalette();
  const [parsedData, setParsedData] = useState<ParsedData | null>(null);
  const [rows, setRows] = useState<TransactionRow[]>([]);
  const [referenceMonth, setReferenceMonth] = useState<string>('');

  useEffect(() => {
    if (!isOpen) return;
    setSelectedCardId((prev) => {
      if (preSelectedCardId && cards.some((c) => c.id === preSelectedCardId)) {
        return preSelectedCardId;
      }
      if (cards.length > 0 && !prev) {
        return cards[0].id;
      }
      return prev;
    });
  }, [isOpen, preSelectedCardId, cards]);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setErrorMsg(null);
    }
  };

  const handleParseFile = async () => {
    if (!file) {
      setErrorMsg('Por favor, selecione um arquivo (PDF, Excel, Word ou CSV).');
      return;
    }
    if (!selectedCardId) {
      setErrorMsg('Por favor, selecione o cartão de destino.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const json = await apiCall<{ status: string; msg?: string; data: ParsedData }>('/api/statements/parse', {
        method: 'POST',
        body: formData,
      });

      if (json.status === 'Erro') {
        throw new Error(json.msg || 'Erro ao processar arquivo.');
      }

      const data: ParsedData = json.data;
      setParsedData(data);
      if (data.detected_month) {
        setReferenceMonth(data.detected_month);
      } else {
        setReferenceMonth('09/2025');
      }

      // Inicializa linhas: por padrão pré-seleciona saídas e gastos normais, desmarca pagamentos de fatura e recebimentos
      const initialRows: TransactionRow[] = data.transactions.map(tx => ({
        ...tx,
        // Ignora pagamento de fatura ou entradas/pix_in por padrão, seleciona gastos
        selected: tx.type !== 'credito_pago' && tx.signed_value < 0,
        installments_count: 1
      }));
      setRows(initialRows);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Falha ao analisar o arquivo. Verifique o formato.');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleSelectAll = () => {
    const allSelected = rows.every(r => r.selected);
    setRows(rows.map(r => ({ ...r, selected: !allSelected })));
  };

  const handleToggleRow = (id: number) => {
    setRows(rows.map(r => r.id === id ? { ...r, selected: !r.selected } : r));
  };

  const handleInstallmentChange = (id: number, val: number) => {
    setRows(rows.map(r => r.id === id ? { ...r, installments_count: val } : r));
  };

  const handleDescriptionChange = (id: number, desc: string) => {
    setRows(rows.map(r => r.id === id ? { ...r, description: desc } : r));
  };

  const handleConfirmImport = async () => {
    const selectedRows = rows.filter(r => r.selected);
    if (selectedRows.length === 0) {
      setErrorMsg('Nenhuma transação selecionada para importação.');
      return;
    }
    if (!selectedCardId) {
      setErrorMsg('Selecione um cartão.');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    try {
      const payload = {
        card_id: Number(selectedCardId),
        reference_month: referenceMonth,
        transactions: selectedRows.map(r => ({
          description: r.description,
          value: Math.abs(r.value),
          date: r.date,
          installments_count: r.installments_count
        }))
      };

      await apiCall<{ status: string; msg: string }>('/api/statements/import-batch', {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: {
          'Content-Type': 'application/json'
        }
      });

      // Limpa estados e notifica sucesso
      setParsedData(null);
      setFile(null);
      onSuccess();
      onClose();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao gravar transações.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setParsedData(null);
    setFile(null);
    setErrorMsg(null);
  };

  const selectedCount = rows.filter(r => r.selected).length;
  const selectedTotal = rows
    .filter(r => r.selected)
    .reduce((acc, r) => acc + Math.abs(r.value), 0);

  // Agrupa transações selecionadas por categoria para o gráfico de pizza Recharts
  const categoryTotals: Record<string, number> = {};
  rows.filter(r => r.selected).forEach(r => {
    const cat = r.category || 'Outros';
    categoryTotals[cat] = (categoryTotals[cat] || 0) + Math.abs(r.value);
  });
  const chartData = Object.entries(categoryTotals).map(([name, value]) => ({
    name,
    value
  }));
  const COLORS = CHART_PALETTE_SERIES;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-surface-card border border-border-subtle rounded-xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-lg overflow-hidden animate-in fade-in zoom-in-95 duration-[120ms]">
        
        {/* Header */}
        <div className="p-6 border-b border-border-subtle flex items-center justify-between bg-surface-elevated sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-accent-soft text-accent rounded-xl">
              <Upload className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-text-primary">Importar Extrato / Fatura</h2>
              <p className="text-sm text-text-muted">
                Extraia gastos do PDF (Nubank/outros), Excel ou Word de forma inteligente
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-text-muted hover:text-text-primary rounded-lg hover:bg-surface-input transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {errorMsg && (
            <div className="p-4 bg-status-error/10 border border-status-error/30 rounded-xl flex items-center gap-3 text-status-error text-sm">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {!parsedData ? (
            /* PASSO 1: UPLOAD E SELEÇÃO DE CARTÃO */
            <div className="space-y-6">
              <div className="bg-surface-elevated p-5 rounded-xl border border-border-subtle space-y-4">
                <label className="block text-sm font-semibold text-text-primary">
                  1. Selecione o Cartão de Crédito de Destino
                </label>
                <div className="relative">
                  <CreditCard className="w-5 h-5 text-text-muted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <select
                    value={selectedCardId}
                    onChange={(e) => setSelectedCardId(e.target.value ? Number(e.target.value) : '')}
                    className="w-full bg-surface-input border border-border-subtle rounded-lg pl-11 pr-4 py-3 text-text-primary focus:outline-none focus:border-accent transition-colors appearance-none"
                  >
                    <option value="">-- Escolha um cartão cadastrado --</option>
                    {cards.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} (Fechamento dia {c.closing_day} | Vencimento dia {c.due_day})
                      </option>
                    ))}
                  </select>
                </div>
                {cards.length === 0 && (
                  <p className="text-xs text-status-warning">
                    Nenhum cartão encontrado. Cadastre um cartão na aba antes de importar.
                  </p>
                )}
              </div>

              <div className="bg-surface-elevated p-5 rounded-xl border border-border-subtle space-y-4">
                <label className="block text-sm font-semibold text-text-primary">
                  2. Anexe o Arquivo de Relatório / Extrato
                </label>
                
                <div className="border-2 border-dashed border-border-subtle hover:border-accent/60 rounded-xl p-8 text-center transition-colors bg-surface relative">
                  <input
                    type="file"
                    accept=".pdf,.xlsx,.xls,.docx,.csv"
                    onChange={handleFileChange}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                  />
                  <div className="flex flex-col items-center justify-center space-y-3">
                    <div className="p-4 bg-surface-input rounded-lg text-accent">
                      <FileText className="w-8 h-8" />
                    </div>
                    <div>
                      <p className="text-text-primary font-medium">
                        {file ? file.name : 'Clique para escolher ou arraste o arquivo aqui'}
                      </p>
                      <p className="text-xs text-text-muted mt-1">
                        Suporta arquivos PDF (faturas e relatórios), Excel (.xlsx/.xls) ou Word (.docx)
                      </p>
                    </div>
                    {file && (
                      <span className="inline-flex items-center px-3 py-1 rounded-md text-xs font-medium bg-accent-soft text-accent border border-accent/30 tabular-nums">
                        Pronto para análise ({(file.size / 1024).toFixed(1)} KB)
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={handleParseFile}
                  disabled={loading || !file || !selectedCardId}
                  className="px-6 py-3.5 rounded-lg font-semibold text-white bg-accent hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Processando Relatório...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-5 h-5" />
                      <span>Analisar Arquivo</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : (
            /* PASSO 2: REVISÃO DE DESPESAS EXTRAÍDAS */
            <div className="space-y-6">
              {/* Cards de Resumo */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-surface-elevated p-4 rounded-xl border border-border-subtle">
                  <span className="text-xs text-text-muted font-medium uppercase">Período</span>
                  <p className="text-sm font-semibold text-text-primary mt-1 truncate">
                    {parsedData.period || 'Período não especificado'}
                  </p>
                </div>
                <div className="bg-surface-elevated p-4 rounded-xl border border-border-subtle">
                  <span className="text-xs text-text-muted font-medium uppercase">Total de Entradas</span>
                  <p className="text-lg font-semibold text-status-success mt-1 tabular-nums">
                    {money(parsedData.summary.total_entradas)}
                  </p>
                </div>
                <div className="bg-surface-elevated p-4 rounded-xl border border-border-subtle">
                  <span className="text-xs text-text-muted font-medium uppercase">Total de Saídas</span>
                  <p className="text-lg font-semibold text-status-error mt-1 tabular-nums">
                    {money(parsedData.summary.total_saidas)}
                  </p>
                </div>
                <div className="bg-surface-elevated p-4 rounded-xl border border-border-subtle">
                  <span className="text-xs text-text-muted font-medium uppercase">Saldo Final</span>
                  <p className="text-lg font-semibold text-accent mt-1 tabular-nums">
                    {money(parsedData.summary.saldo_final)}
                  </p>
                </div>
              </div>

              {/* Seletor de Mês e Gráfico de Pizza por Categoria */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Painel do Mês Detectado / Seletor */}
                <div className="bg-surface-elevated p-5 rounded-xl border border-border-subtle flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-2 text-accent text-xs font-semibold uppercase tracking-wider mb-2">
                      <Calendar className="w-4 h-4" /> Mês da Fatura Detectado
                    </div>
                    <p className="text-xl font-semibold text-text-primary mb-1">
                      {parsedData.detected_month_label || 'Mês de Referência'}
                    </p>
                    <p className="text-xs text-text-muted mb-4">
                      As despesas selecionadas serão vinculadas a esta fatura/competência.
                    </p>
                    <label className="block text-xs font-semibold text-text-primary mb-1">
                      Ajustar Competência (Mês/Ano):
                    </label>
                    <input
                      type="month"
                      value={
                        referenceMonth && referenceMonth.includes('/')
                          ? `${referenceMonth.split('/')[1]}-${referenceMonth.split('/')[0].padStart(2, '0')}`
                          : referenceMonth || '2025-09'
                      }
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val && val.includes('-')) {
                          const [y, m] = val.split('-');
                          setReferenceMonth(`${m}/${y}`);
                        } else {
                          setReferenceMonth(val);
                        }
                      }}
                      className="w-full bg-surface-input border border-border-subtle rounded-lg px-3 py-2 text-text-primary text-sm focus:outline-none focus:border-accent transition-colors"
                    />
                  </div>
                  <div className="mt-4 pt-3 border-t border-border-subtle text-xs text-text-muted">
                    Pessoas físicas estão unificadas na fatia <strong>Transferências/Pessoas</strong>.
                  </div>
                </div>

                {/* Gráfico de Pizza interativo Recharts */}
                <div className="lg:col-span-2 bg-surface-elevated p-5 rounded-xl border border-border-subtle flex flex-col justify-between">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
                      <span>Distribuição por Categoria (Itens Selecionados)</span>
                    </h3>
                    <span className="text-xs text-text-muted font-medium tabular-nums">
                      {selectedCount} {selectedCount === 1 ? 'item' : 'itens'} ({money(selectedTotal)})
                    </span>
                  </div>
                  {chartData.length > 0 ? (
                    <div className="h-56 w-full">
                      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                        <PieChart>
                          <Pie
                            data={chartData}
                            cx="50%"
                            cy="50%"
                            innerRadius={45}
                            outerRadius={75}
                            paddingAngle={4}
                            dataKey="value"
                          >
                            {chartData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip
                            formatter={(value) => [money(Number(value || 0)), '']}
                            contentStyle={{ backgroundColor: palette.tooltipBg, borderColor: palette.tooltipBorder, borderRadius: '0.75rem', color: palette.tooltipLabel }}
                            itemStyle={{ color: palette.tooltipLabel }}
                          />
                          <Legend 
                            layout="vertical" 
                            verticalAlign="middle" 
                            align="right"
                            wrapperStyle={{ fontSize: '12px', color: palette.axis }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="h-56 flex items-center justify-center text-text-muted text-sm">
                      Selecione itens na tabela abaixo para visualizar o gráfico por categoria
                    </div>
                  )}
                </div>
              </div>

              {/* Barra de Seleção e Ações */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-surface-elevated p-4 rounded-xl border border-border-subtle">
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleToggleSelectAll}
                    className="flex items-center gap-2 text-sm font-medium text-text-primary hover:text-accent transition-colors"
                  >
                    {rows.every(r => r.selected) ? (
                      <CheckSquare className="w-5 h-5 text-accent" />
                    ) : (
                      <Square className="w-5 h-5 text-text-muted" />
                    )}
                    <span>{rows.every(r => r.selected) ? 'Desmarcar Todos' : 'Selecionar Todos'}</span>
                  </button>
                  <span className="text-border-subtle">|</span>
                  <span className="text-sm text-text-muted tabular-nums">
                    <strong className="text-text-primary">{selectedCount}</strong> de {rows.length} itens marcados para importar
                  </span>
                </div>
                <div className="text-sm font-semibold text-accent tabular-nums">
                  Total Selecionado: {money(selectedTotal)}
                </div>
              </div>

              {/* Tabela de Transações */}
              <div className="border border-border-subtle rounded-xl overflow-hidden bg-surface">
                <div className="max-h-96 overflow-y-auto">
                  <table className="w-full text-left text-sm border-collapse">
                    <thead className="bg-surface-elevated sticky top-0 z-10 text-text-muted text-xs uppercase font-semibold border-b border-border-subtle">
                      <tr>
                        <th className="p-3.5 w-12 text-center">Sel.</th>
                        <th className="p-3.5 w-28">Data</th>
                        <th className="p-3.5">Descrição</th>
                        <th className="p-3.5 w-36">Categoria</th>
                        <th className="p-3.5 w-28">Parcelas</th>
                        <th className="p-3.5 w-32 text-right">Valor</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-subtle">
                      {rows.map((row) => (
                        <tr 
                          key={row.id} 
                          className={`hover:bg-surface-elevated transition-colors ${!row.selected ? 'opacity-50' : ''}`}
                        >
                          <td className="p-3.5 text-center">
                            <button
                              onClick={() => handleToggleRow(row.id)}
                              className="text-text-muted hover:text-accent transition-colors"
                            >
                              {row.selected ? (
                                <CheckSquare className="w-5 h-5 text-accent" />
                              ) : (
                                <Square className="w-5 h-5" />
                              )}
                            </button>
                          </td>
                          <td className="p-3.5 text-text-muted whitespace-nowrap text-xs tabular-nums">
                            {row.date}
                          </td>
                          <td className="p-3.5">
                            <input
                              type="text"
                              value={row.description}
                              onChange={(e) => handleDescriptionChange(row.id, e.target.value)}
                              className="w-full bg-transparent border border-transparent hover:border-border-subtle focus:border-accent rounded-lg px-2 py-1 text-text-primary text-sm focus:outline-none focus:bg-surface-input transition-colors"
                            />
                          </td>
                          <td className="p-3.5">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium bg-surface-input text-text-primary border border-border-subtle">
                              {row.category}
                            </span>
                          </td>
                          <td className="p-3.5">
                            <select
                              value={row.installments_count}
                              onChange={(e) => handleInstallmentChange(row.id, Number(e.target.value))}
                              disabled={!row.selected}
                              className="bg-surface-input border border-border-subtle rounded-lg px-2 py-1 text-xs text-text-primary focus:outline-none focus:border-accent transition-colors w-full"
                            >
                              {[...Array(12)].map((_, idx) => (
                                <option key={idx + 1} value={idx + 1}>
                                  {idx + 1}x {idx === 0 ? '(À vista)' : ''}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className={`p-3.5 text-right font-semibold whitespace-nowrap tabular-nums ${
                            row.signed_value < 0 ? 'text-status-error' : 'text-status-success'
                          }`}>
                            {row.signed_value < 0 ? '- ' : '+ '}
                            {money(Math.abs(row.value))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Rodapé do Passo 2 */}
              <div className="flex items-center justify-between pt-4 border-t border-border-subtle">
                <button
                  onClick={handleReset}
                  className="px-4 py-2.5 rounded-lg font-medium text-text-primary hover:bg-surface-input transition-colors flex items-center gap-2 text-sm"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Outro Arquivo</span>
                </button>
                <div className="flex items-center gap-3">
                  <button
                    onClick={onClose}
                    className="px-5 py-2.5 rounded-lg font-medium text-text-muted hover:text-text-primary hover:bg-surface-input transition-colors text-sm"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleConfirmImport}
                    disabled={submitting || selectedCount === 0}
                    className="px-6 py-2.5 rounded-lg font-semibold text-white bg-status-success hover:bg-status-success/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2 text-sm"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Gravações em Andamento...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle className="w-4 h-4" />
                        <span>Confirmar e Gravar ({selectedCount} itens)</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
