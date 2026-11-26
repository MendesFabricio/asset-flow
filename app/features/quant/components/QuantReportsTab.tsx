'use client';

import React from 'react';
import { Brain, Download, FileText, HelpCircle } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { FearGreedData, QuantReportItem } from '../hooks/useQuantReports';

interface QuantReportsTabProps {
  fearGreedData: FearGreedData | null;
  reportsList: QuantReportItem[];
  loadingReports: boolean;
  generatingReport: boolean;
  onGenerateReport: () => void;
}

export function QuantReportsTab({
  fearGreedData,
  reportsList,
  loadingReports,
  generatingReport,
  onGenerateReport,
}: QuantReportsTabProps) {
  const score = fearGreedData?.score ?? 50;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in duration-300">
      <Card className="lg:col-span-1 flex flex-col justify-between gap-4 bg-surface-card border-border-subtle p-6">
        <div className="flex items-center gap-2 border-b border-border-subtle pb-3">
          <Brain className="text-purple-400" size={18} />
          <h3 className="font-bold text-text-primary text-sm uppercase tracking-wider flex items-center gap-2">
            Fear &amp; Greed Index Local
            <div className="relative group/tt flex items-center cursor-pointer normal-case">
              <HelpCircle size={14} className="text-text-muted hover:text-purple-400 transition-colors" />
              <div className="absolute bottom-full mb-2 hidden group-hover/tt:block w-60 p-2 bg-surface-elevated text-text-primary text-[11px] rounded shadow-xl border border-border-subtle z-50 font-normal text-left">
                Mede o humor técnico da sua própria carteira (0 = Medo Extremo / Oportunidade; 100 = Ganância Extrema / Euforia).
              </div>
            </div>
          </h3>
        </div>

        {loadingReports ? (
          <div className="flex justify-center items-center h-48 animate-pulse text-text-muted text-xs">
            Analisando sentimento da carteira...
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 text-center">
            {/* SVG Gauge */}
            <div className="relative w-36 h-20">
              <svg className="w-full h-full" viewBox="0 0 120 70">
                <path
                  d="M 10 60 A 50 50 0 0 1 110 60"
                  fill="none"
                  stroke="var(--surface-input)"
                  strokeWidth="8"
                  strokeLinecap="round"
                />
                <path
                  d="M 10 60 A 50 50 0 0 1 110 60"
                  fill="none"
                  stroke={
                    score < 25
                      ? '#ef4444'
                      : score < 45
                      ? '#f97316'
                      : score <= 55
                      ? '#eab308'
                      : score <= 75
                      ? '#84cc16'
                      : '#22c55e'
                  }
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray="157.08"
                  strokeDashoffset={157.08 - (157.08 * score) / 100}
                  className="transition-all duration-1000 ease-out"
                />
              </svg>
              <div className="absolute inset-x-0 bottom-0 flex flex-col items-center justify-end h-full">
                <span className="text-2xl font-black text-text-primary tracking-tight leading-none">
                  {score}
                </span>
                <span
                  className={`text-[10px] font-bold uppercase tracking-wider mt-1 px-1.5 py-0.5 rounded ${
                    score < 25
                      ? 'bg-red-500/10 text-red-400'
                      : score < 45
                      ? 'bg-orange-500/10 text-orange-400'
                      : score <= 55
                      ? 'bg-yellow-500/10 text-yellow-400'
                      : score <= 75
                      ? 'bg-lime-500/10 text-lime-400'
                      : 'bg-emerald-500/10 text-emerald-400'
                  }`}
                >
                  {fearGreedData?.label || 'Neutro'}
                </span>
              </div>
            </div>

            <p className="text-[11px] text-text-muted max-w-[200px] leading-relaxed mt-2">
              Índice proprietário derivado do RSI médio, do percentual acima da média 20d e da volatilidade dos seus próprios ativos.
            </p>

            <div className="w-full flex flex-col gap-2 mt-4 text-xs text-left border-t border-border-subtle pt-4">
              <div className="flex justify-between items-center py-1">
                <span className="text-text-muted">RSI Médio Ponderado:</span>
                <span className="font-bold text-text-primary">{fearGreedData?.avg_rsi || 50}/100</span>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-text-muted">Acima da Média 20d:</span>
                <span className="font-bold text-text-primary">{fearGreedData?.above_sma_pct || 0}% dos ativos</span>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-text-muted">Força de Drawdown/Retorno:</span>
                <span className="font-bold text-text-primary">{fearGreedData?.drawdown_score || 50}/100</span>
              </div>
            </div>
          </div>
        )}
      </Card>

      <Card className="lg:col-span-2 flex flex-col gap-4 bg-surface-card border-border-subtle p-6 min-h-[400px]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border-subtle pb-3">
          <div className="flex items-center gap-2">
            <FileText className="text-blue-400" size={18} />
            <h3 className="font-bold text-text-primary text-sm uppercase tracking-wider flex items-center gap-2">
              Central de Relatórios Patrimoniais (PDF)
              <div className="relative group/tt flex items-center cursor-pointer normal-case">
                <HelpCircle size={14} className="text-text-muted hover:text-blue-400 transition-colors" />
                <div className="absolute bottom-full mb-2 hidden group-hover/tt:block w-64 p-2 bg-surface-elevated text-text-primary text-[11px] rounded shadow-xl border border-border-subtle z-50 font-normal text-left">
                  Gera uma fotografia imutável em PDF da sua alocação, lucros e posições no instante atual. Ideal para prestação de contas, imposto de renda ou arquivo pessoal trimestral.
                </div>
              </div>
            </h3>
          </div>
          <button
            type="button"
            disabled={generatingReport || loadingReports}
            onClick={onGenerateReport}
            className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold uppercase tracking-wider transition disabled:opacity-40 flex items-center gap-2"
          >
            {generatingReport ? (
              <>
                <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Gerando...
              </>
            ) : (
              'Gerar Relatório Atual'
            )}
          </button>
        </div>

        {loadingReports ? (
          <div className="flex justify-center items-center h-48 animate-pulse text-text-muted text-xs">
            Carregando relatórios salvos...
          </div>
        ) : reportsList.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-text-muted h-full border border-border-subtle border-dashed rounded-xl">
            <FileText size={36} className="mb-2 opacity-40" />
            <span className="text-xs">Nenhum relatório gerado ainda.</span>
          </div>
        ) : (
          <div className="overflow-x-auto w-full">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border-subtle text-[11px] text-text-muted font-bold uppercase tracking-wider">
                  <th className="pb-3 pl-2">Relatório</th>
                  <th className="pb-3">Data de Criação</th>
                  <th className="pb-3 text-right">Tamanho</th>
                  <th className="pb-3 text-right pr-2">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle/60 text-xs">
                {reportsList.map((rep) => {
                  const cleanDate = rep.created_at
                    ? new Date(rep.created_at).toLocaleString('pt-BR', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : 'N/A';
                  const sizeKb = rep.size_bytes ? (rep.size_bytes / 1024).toFixed(1) : '0.0';
                  const repLabel = rep.filename
                    ? rep.filename.replace('relatorio_patrimonial_', 'Relatório ').replace('.pdf', '')
                    : 'Relatório Patrimonial';

                  return (
                    <tr key={rep.filename} className="hover:bg-surface-elevated/40 transition">
                      <td className="py-3 pl-2 font-bold text-text-primary flex items-center gap-2">
                        <FileText size={14} className="text-text-muted" />
                        {repLabel}
                      </td>
                      <td className="py-3 text-text-muted">{cleanDate}</td>
                      <td className="py-3 text-right text-text-muted">{sizeKb} KB</td>
                      <td className="py-3 text-right pr-2">
                        <button
                          type="button"
                          onClick={() =>
                            window.open(
                              `/api/quant/download-report?filename=${encodeURIComponent(rep.filename)}`,
                              '_blank'
                            )
                          }
                          className="px-2 py-1 bg-surface-elevated hover:bg-surface-input border border-border-subtle text-text-primary rounded text-[10px] font-bold uppercase tracking-wider transition flex items-center gap-1.5 ml-auto"
                        >
                          <Download size={10} />
                          Baixar
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
