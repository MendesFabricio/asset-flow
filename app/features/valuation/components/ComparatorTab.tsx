'use client';

import { useCallback, useEffect, useState } from 'react';
import { GitCompare, Loader2, Plus, X, Award } from 'lucide-react';
import { apiCall } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { Asset, ValuationAssetData } from '@/types';
import { useToast } from '@/context/ToastContext';

interface ComparatorTabProps {
  ativos?: Asset[];
}

interface CompareRowSpec {
  label: string;
  render: (a: ValuationAssetData) => string;
  scoreValue?: (a: ValuationAssetData) => number | null;
  preferLower?: boolean;
}

const COMPARE_ROWS: CompareRowSpec[] = [
  { label: 'Setor', render: (a) => a.sector || 'Outros' },
  { label: 'Cotação Atual', render: (a) => formatMoney(a.price) },
  {
    label: 'Dividend Yield (12m)',
    render: (a) => (a.dy_12m !== null ? `${a.dy_12m.toFixed(2)}%` : 'N/D'),
    scoreValue: (a) => a.dy_12m,
  },
  {
    label: 'Preço Teto Bazin',
    render: (a) => (a.bazin_price ? formatMoney(a.bazin_price) : 'N/D'),
  },
  {
    label: 'Margem Bazin (%)',
    render: (a) => (a.margin_bazin_pct !== null ? `${a.margin_bazin_pct > 0 ? '+' : ''}${a.margin_bazin_pct.toFixed(1)}%` : 'N/D'),
    scoreValue: (a) => a.margin_bazin_pct,
  },
  {
    label: 'V.I. Graham',
    render: (a) => (a.graham_price ? formatMoney(a.graham_price) : 'N/D'),
  },
  {
    label: 'DCF / FCD (5a)',
    render: (a) => (a.dcf_price ? formatMoney(a.dcf_price) : 'N/D'),
  },
  {
    label: 'P/L',
    render: (a) => (a.pl !== null ? `${a.pl.toFixed(1)}x` : 'N/D'),
    scoreValue: (a) => (a.pl && a.pl > 0 ? a.pl : null),
    preferLower: true,
  },
  {
    label: 'P/VP',
    render: (a) => (a.pvp !== null ? `${a.pvp.toFixed(2)}x` : 'N/D'),
    scoreValue: (a) => (a.pvp && a.pvp > 0 ? a.pvp : null),
    preferLower: true,
  },
  {
    label: 'ROE',
    render: (a) => (a.roe !== null ? `${a.roe.toFixed(1)}%` : 'N/D'),
    scoreValue: (a) => a.roe,
  },
  {
    label: 'Margem Líquida',
    render: (a) => (a.net_margin !== null ? `${a.net_margin.toFixed(1)}%` : 'N/D'),
    scoreValue: (a) => a.net_margin,
  },
  {
    label: 'Dív. Líq / EBITDA',
    render: (a) => (a.debt_to_ebitda !== null ? `${a.debt_to_ebitda.toFixed(2)}x` : 'N/D'),
    scoreValue: (a) => a.debt_to_ebitda,
    preferLower: true,
  },
  {
    label: 'Fórmula Mágica (pts)',
    render: (a) => (a.magic_score !== null ? `${a.magic_score.toFixed(0)}/100` : 'N/D'),
    scoreValue: (a) => a.magic_score,
  },
  {
    label: 'Score Qualidade',
    render: (a) => `${a.quality_score}/100`,
    scoreValue: (a) => a.quality_score,
  },
];

export function ComparatorTab({ ativos = [] }: ComparatorTabProps) {
  const { notify } = useToast();
  const portfolioDefaults = ativos
    .filter((a) => a.tipo === 'Ação' || a.tipo === 'FII')
    .slice(0, 3)
    .map((a) => a.ticker);

  const [selectedTickers, setSelectedTickers] = useState<string[]>(
    portfolioDefaults.length >= 2 ? portfolioDefaults : ['BBSE3', 'ITUB3', 'PETR4']
  );
  const [tickerInput, setTickerInput] = useState('');
  const [items, setItems] = useState<ValuationAssetData[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchComparison = useCallback(async (tickers: string[]) => {
    if (tickers.length === 0) {
      setItems([]);
      return;
    }
    setLoading(true);
    try {
      const res = await apiCall<{ status: string; items: ValuationAssetData[]; msg?: string }>(
        `/api/valuation/compare?tickers=${encodeURIComponent(tickers.join(','))}`,
        { timeout: 45000 }
      );
      if (res.status === 'Sucesso') {
        setItems(res.items || []);
      } else {
        notify(res.msg || 'Não foi possível comparar os ativos.', 'error');
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Erro ao comparar ativos.', 'error');
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    fetchComparison(selectedTickers);
  }, [selectedTickers, fetchComparison]);

  const handleAddTicker = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = tickerInput.trim().toUpperCase().replace('.SA', '');
    if (!clean) return;
    if (selectedTickers.includes(clean)) {
      setTickerInput('');
      return;
    }
    if (selectedTickers.length >= 4) {
      notify('Você pode comparar até 4 ativos por vez.', 'info');
      return;
    }
    setSelectedTickers((prev) => [...prev, clean]);
    setTickerInput('');
  };

  const handleRemoveTicker = (ticker: string) => {
    setSelectedTickers((prev) => prev.filter((t) => t !== ticker));
  };

  const portfolioSuggestions = ativos
    .filter((a) => (a.tipo === 'Ação' || a.tipo === 'FII') && !selectedTickers.includes(a.ticker))
    .slice(0, 6);

  return (
    <div className="space-y-6">
      <div className="bg-surface-card border border-border-subtle rounded-2xl p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <GitCompare size={18} className="text-accent" />
              <h2 className="text-base font-extrabold text-text-primary">Comparador Fundamentalista Lado a Lado</h2>
            </div>
            <p className="text-xs text-text-muted">
              Compare até 4 Ações ou FIIs da B3 em Preço Teto, Graham, DCF, múltiplos e Score de Qualidade.
            </p>
          </div>

          <form onSubmit={handleAddTicker} className="flex items-center gap-2">
            <input
              type="text"
              value={tickerInput}
              onChange={(e) => setTickerInput(e.target.value)}
              placeholder="Adicionar ticker (ex: HGLG11)"
              className="px-3 py-2 rounded-lg bg-surface-input border border-border-subtle text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent w-48"
            />
            <button
              type="submit"
              disabled={!tickerInput.trim() || selectedTickers.length >= 4}
              className="px-3 py-2 rounded-lg bg-accent text-white text-xs font-bold hover:opacity-90 disabled:opacity-50 flex items-center gap-1"
            >
              <Plus size={13} /> Comparar
            </button>
          </form>
        </div>

        {/* Chips selecionados + Sugestões */}
        <div className="flex flex-wrap items-center gap-2">
          {selectedTickers.map((t) => (
            <span
              key={t}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-accent-soft text-accent text-xs font-bold border border-accent/30"
            >
              {t}
              <button
                type="button"
                onClick={() => handleRemoveTicker(t)}
                aria-label={`Remover ${t}`}
                className="hover:text-status-error transition-colors"
              >
                <X size={12} />
              </button>
            </span>
          ))}

          {portfolioSuggestions.length > 0 && selectedTickers.length < 4 && (
            <div className="flex items-center gap-1.5 ml-auto flex-wrap">
              <span className="text-[10px] uppercase tracking-wider text-text-muted font-bold">Da carteira:</span>
              {portfolioSuggestions.map((a) => (
                <button
                  key={a.ticker}
                  type="button"
                  onClick={() => setSelectedTickers((prev) => [...prev, a.ticker])}
                  className="text-[11px] px-2 py-0.5 rounded-full bg-surface-elevated border border-border-subtle text-text-muted hover:text-text-primary hover:border-accent"
                >
                  + {a.ticker}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Tabela comparativa */}
      <div className="bg-surface-card border border-border-subtle rounded-2xl overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-xs text-text-muted flex items-center justify-center gap-2">
            <Loader2 size={16} className="animate-spin text-accent" />
            Buscando indicadores para comparação...
          </div>
        ) : items.length === 0 ? (
          <div className="p-10 text-center text-xs text-text-muted">
            Adicione ao menos 1 ativo acima para iniciar a comparação.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-elevated border-b border-border-subtle">
                <tr>
                  <th className="px-4 py-3 text-[10px] uppercase tracking-wider text-text-muted w-48">Indicador</th>
                  {items.map((it) => (
                    <th key={it.ticker} className="px-4 py-3 text-right">
                      <div className="font-extrabold text-sm text-text-primary">{it.ticker}</div>
                      <div className="text-[10px] font-normal text-text-muted truncate max-w-[160px] ml-auto">
                        {it.name}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {COMPARE_ROWS.map((row) => {
                  let bestTicker: string | null = null;
                  if (row.scoreValue && items.length > 1) {
                    const scored = items
                      .map((a) => ({ ticker: a.ticker, v: row.scoreValue!(a) }))
                      .filter((x): x is { ticker: string; v: number } => x.v !== null && x.v !== undefined);
                    if (scored.length > 1) {
                      scored.sort((a, b) => (row.preferLower ? a.v - b.v : b.v - a.v));
                      if (scored[0].v !== scored[1].v) {
                        bestTicker = scored[0].ticker;
                      }
                    }
                  }

                  return (
                    <tr key={row.label} className="hover:bg-surface-elevated/60">
                      <td className="px-4 py-2.5 font-semibold text-text-muted">{row.label}</td>
                      {items.map((it) => {
                        const isBest = bestTicker === it.ticker;
                        return (
                          <td
                            key={it.ticker}
                            className={`px-4 py-2.5 text-right font-mono ${
                              isBest ? 'font-extrabold text-status-success bg-status-success/5' : 'text-text-primary'
                            }`}
                          >
                            <span className="inline-flex items-center gap-1 justify-end">
                              {isBest && <Award size={12} className="text-status-success" />}
                              {row.render(it)}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
