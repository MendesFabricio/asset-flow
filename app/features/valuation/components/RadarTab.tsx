'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Building2,
  Compass,
  Filter,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import { apiCall } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { ModalShell } from '@/components/ModalShell';
import { useToast } from '@/context/ToastContext';
import { ValuationAssetData, WatchlistEntry } from '@/types';
import { ValuationPanel } from './ValuationPanel';

type StrategyMode = 'quality' | 'dividends' | 'bargain' | 'magic' | 'fiis' | 'watchlist';

interface RadarResponse {
  status: string;
  total_cached: number;
  sectors: string[];
  sync_state: { status: string; message: string };
  items: ValuationAssetData[];
}

const STRATEGIES: Array<{ id: StrategyMode; label: string; hint: string }> = [
  { id: 'quality', label: 'Melhor Qualidade', hint: 'Checklist & saúde' },
  { id: 'dividends', label: 'Radar Dividendos', hint: 'Bazin & DY' },
  { id: 'bargain', label: 'Barganha / Graham', hint: 'Maior desconto' },
  { id: 'magic', label: 'Fórmula Mágica', hint: 'EV/EBITDA + ROIC' },
  { id: 'fiis', label: 'Radar FIIs', hint: 'P/VP & DY' },
  { id: 'watchlist', label: 'Minha Watchlist', hint: 'Alvos salvos' },
];

export function RadarTab() {
  const { notify } = useToast();
  const [strategy, setStrategy] = useState<StrategyMode>('quality');
  const [assetType, setAssetType] = useState<string>('TODOS');
  const [sector, setSector] = useState<string>('TODOS');
  const [search, setSearch] = useState<string>('');
  const [onlyOutside, setOnlyOutside] = useState<boolean>(false);

  const [items, setItems] = useState<ValuationAssetData[]>([]);
  const [sectors, setSectors] = useState<string[]>([]);
  const [totalCached, setTotalCached] = useState<number>(0);
  const [watchlist, setWatchlist] = useState<WatchlistEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  const [customTicker, setCustomTicker] = useState<string>('');
  const [searchingCustom, setSearchingCustom] = useState<boolean>(false);
  const [inspectedAsset, setInspectedAsset] = useState<{ ticker: string; asset_type?: string } | null>(null);

  const loadWatchlist = useCallback(async () => {
    try {
      const res = await apiCall<{ status: string; items: WatchlistEntry[] }>('/api/valuation/watchlist');
      if (res.status === 'Sucesso') {
        setWatchlist(res.items || []);
      }
    } catch {
      // Silencioso para não bloquear o radar principal
    }
  }, []);

  const loadRadar = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        strategy: strategy === 'watchlist' ? 'quality' : strategy,
        type: assetType,
        sector,
        q: search.trim(),
        only_outside: String(onlyOutside),
      });
      const res = await apiCall<RadarResponse>(`/api/valuation/radar?${params.toString()}`);
      if (res.status === 'Sucesso') {
        setItems(res.items || []);
        setSectors(res.sectors || []);
        setTotalCached(res.total_cached || 0);
        if (res.sync_state?.status === 'processing') {
          setRefreshing(true);
        }
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Erro ao carregar Radar B3.', 'error');
    } finally {
      setLoading(false);
    }
  }, [strategy, assetType, sector, search, onlyOutside, notify]);

  useEffect(() => {
    loadRadar();
  }, [loadRadar]);

  useEffect(() => {
    loadWatchlist();
  }, [loadWatchlist]);

  useEffect(() => {
    if (!refreshing) return;
    const interval = setInterval(async () => {
      try {
        const res = await apiCall<RadarResponse>('/api/valuation/radar');
        if (res.sync_state?.status !== 'processing') {
          setRefreshing(false);
          loadRadar();
          loadWatchlist();
          if (res.sync_state?.status === 'success') {
            notify(res.sync_state.message || 'Radar B3 atualizado!', 'success');
          }
        }
      } catch {
        setRefreshing(false);
      }
    }, 3500);
    return () => clearInterval(interval);
  }, [refreshing, loadRadar, loadWatchlist, notify]);

  const handleRefreshScreener = async () => {
    setRefreshing(true);
    try {
      await apiCall('/api/valuation/radar/refresh', { method: 'POST', body: JSON.stringify({}) });
      notify('Varredura da B3 iniciada em segundo plano (~20s)...', 'info');
    } catch (err) {
      setRefreshing(false);
      notify(err instanceof Error ? err.message : 'Erro ao atualizar Radar B3.', 'error');
    }
  };

  const watchlistTickers = useMemo(() => new Set(watchlist.map((w) => w.ticker)), [watchlist]);

  const toggleWatchlist = async (ticker: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const isSaved = watchlistTickers.has(ticker);
    try {
      if (isSaved) {
        await apiCall(`/api/valuation/watchlist/${encodeURIComponent(ticker)}`, { method: 'DELETE' });
        notify(`${ticker} removido da Watchlist.`, 'info');
      } else {
        await apiCall('/api/valuation/watchlist', {
          method: 'POST',
          body: JSON.stringify({ ticker, desired_bazin_dy: ticker.endsWith('11') ? 8.0 : 6.0 }),
        });
        notify(`${ticker} adicionado à Watchlist!`, 'success');
      }
      await loadWatchlist();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Erro ao atualizar Watchlist.', 'error');
    }
  };

  const handleInspectCustomTicker = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = customTicker.trim().toUpperCase().replace('.SA', '');
    if (!clean) return;
    setSearchingCustom(true);
    try {
      const res = await apiCall<{ status: string; data?: ValuationAssetData; msg?: string }>(
        `/api/valuation/asset/${encodeURIComponent(clean)}`,
        { timeout: 35000 }
      );
      if (res.status === 'Sucesso' && res.data) {
        setInspectedAsset({ ticker: res.data.ticker, asset_type: res.data.asset_type });
        setCustomTicker('');
        loadRadar();
      } else {
        notify(res.msg || `Ticker '${clean}' não encontrado.`, 'error');
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : `Falha ao buscar ${clean}.`, 'error');
    } finally {
      setSearchingCustom(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Cabeçalho + Ações */}
      <div className="bg-surface-card border border-border-subtle rounded-2xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Compass size={18} className="text-accent" />
            <h2 className="text-base font-extrabold text-text-primary tracking-tight">
              Radar de Oportunidades B3 &amp; Watchlist
            </h2>
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-accent-soft text-accent">
              {totalCached} ativos em cache
            </span>
          </div>
          <p className="text-xs text-text-muted">
            Triagem automática por Preço Teto (Bazin), Graham, DCF, Fórmula Mágica (Greenblatt) e Checklist Fundamentalista.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <form onSubmit={handleInspectCustomTicker} className="flex items-center gap-1.5">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                type="text"
                aria-label="Analisar ticker B3 no Radar"
                value={customTicker}
                onChange={(e) => setCustomTicker(e.target.value)}
                placeholder="Analisar ticker B3 (ex: WEGE3)"
                className="pl-8 pr-3 py-2 rounded-lg bg-surface-input border border-border-subtle text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent w-48"
              />
            </div>
            <button
              type="submit"
              disabled={searchingCustom || !customTicker.trim()}
              className="px-3 py-2 rounded-lg bg-surface-elevated border border-border-subtle text-xs font-bold text-text-primary hover:border-accent disabled:opacity-50 flex items-center gap-1.5"
            >
              {searchingCustom ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
              Consultar
            </button>
          </form>

          <button
            type="button"
            onClick={handleRefreshScreener}
            disabled={refreshing}
            className="px-3.5 py-2 rounded-lg bg-accent text-white text-xs font-bold hover:opacity-90 disabled:opacity-60 flex items-center gap-1.5 transition-all"
          >
            <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
            {refreshing ? 'Varrendo B3...' : 'Atualizar Radar B3'}
          </button>
        </div>
      </div>

      {/* Estratégias */}
      <div className="flex flex-wrap gap-2">
        {STRATEGIES.map((s) => {
          const active = strategy === s.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setStrategy(s.id)}
              className={`px-3.5 py-2 rounded-xl border text-left transition-all flex items-center gap-2 ${
                active
                  ? 'bg-accent-soft border-accent text-accent shadow-sm'
                  : 'bg-surface-card border-border-subtle text-text-muted hover:text-text-primary'
              }`}
            >
              <span className="text-xs font-bold">{s.label}</span>
              <span className="text-[10px] opacity-75 hidden sm:inline">• {s.hint}</span>
            </button>
          );
        })}
      </div>

      {/* Filtros (ocultos na aba Watchlist) */}
      {strategy !== 'watchlist' && (
        <div className="bg-surface-card border border-border-subtle rounded-xl p-3.5 flex flex-wrap items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5 text-text-muted font-semibold">
            <Filter size={13} /> Filtros:
          </div>

          <input
            type="text"
            aria-label="Filtrar ticker ou nome no Radar B3"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filtrar ticker ou nome..."
            className="px-3 py-1.5 rounded-lg bg-surface-input border border-border-subtle text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent w-44"
          />

          <select
            aria-label="Filtrar por tipo de ativo"
            value={assetType}
            onChange={(e) => setAssetType(e.target.value)}
            className="px-3 py-1.5 rounded-lg bg-surface-input border border-border-subtle text-text-primary focus:outline-none focus:border-accent"
          >
            <option value="TODOS">Ações + FIIs</option>
            <option value="Ação">Somente Ações</option>
            <option value="FII">Somente FIIs</option>
          </select>

          <select
            aria-label="Filtrar por setor"
            value={sector}
            onChange={(e) => setSector(e.target.value)}
            className="px-3 py-1.5 rounded-lg bg-surface-input border border-border-subtle text-text-primary focus:outline-none focus:border-accent"
          >
            <option value="TODOS">Todos os Setores</option>
            {sectors.map((sec) => (
              <option key={sec} value={sec}>
                {sec}
              </option>
            ))}
          </select>

          <label className="flex items-center gap-2 cursor-pointer select-none text-text-primary ml-auto">
            <input
              type="checkbox"
              aria-label="Exibir apenas ativos fora da carteira"
              checked={onlyOutside}
              onChange={(e) => setOnlyOutside(e.target.checked)}
              className="accent-accent"
            />
            <span>Apenas fora da carteira</span>
          </label>
        </div>
      )}

      {/* Conteúdo Principal */}
      {strategy === 'watchlist' ? (
        <div className="bg-surface-card border border-border-subtle rounded-2xl overflow-hidden">
          {watchlist.length === 0 ? (
            <div className="p-10 text-center space-y-2 text-text-muted text-sm">
              <Star size={28} className="mx-auto text-status-warning opacity-70" />
              <p className="font-semibold text-text-primary">Sua Watchlist está vazia</p>
              <p className="text-xs">
                Clique na estrela de qualquer ativo no Radar B3 ou consulte um ticker acima para monitorar oportunidades.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-surface-elevated text-text-muted uppercase text-[10px] tracking-wider border-b border-border-subtle">
                  <tr>
                    <th scope="col" className="px-4 py-3">Ativo</th>
                    <th scope="col" className="px-4 py-3 text-right">Cotação</th>
                    <th scope="col" className="px-4 py-3 text-right">DY Desejado</th>
                    <th scope="col" className="px-4 py-3 text-right">Preço Teto Alvo</th>
                    <th scope="col" className="px-4 py-3 text-right">Margem</th>
                    <th scope="col" className="px-4 py-3 text-right">Qualidade</th>
                    <th scope="col" className="px-4 py-3 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {watchlist.map((w) => {
                    const m = w.market || {};
                    const discount = w.discount_pct;
                    return (
                      <tr
                        key={w.id}
                        onClick={() => setInspectedAsset({ ticker: w.ticker, asset_type: m.asset_type })}
                        className="hover:bg-surface-elevated cursor-pointer transition-colors"
                      >
                        <td className="px-4 py-3">
                          <div className="font-bold text-text-primary">{w.ticker}</div>
                          <div className="text-[10px] text-text-muted">{m.name || m.sector || 'B3'}</div>
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-semibold text-text-primary">
                          {m.price ? formatMoney(m.price) : 'N/D'}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-text-muted">
                          {w.desired_bazin_dy.toFixed(1)}%
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-text-primary">
                          {w.effective_target_price ? formatMoney(w.effective_target_price) : 'N/D'}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-bold">
                          {discount !== null && discount !== undefined ? (
                            <span className={discount >= 0 ? 'text-status-success' : 'text-status-error'}>
                              {discount > 0 ? '+' : ''}
                              {discount.toFixed(1)}%
                            </span>
                          ) : (
                            'N/D'
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-text-primary">
                          {m.quality_score ?? 0}/100
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            type="button"
                            onClick={(e) => toggleWatchlist(w.ticker, e)}
                            title="Remover da Watchlist"
                            className="p-1.5 rounded-lg text-text-muted hover:text-status-error hover:bg-status-error/10 transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-surface-card border border-border-subtle rounded-2xl overflow-hidden">
          {loading ? (
            <div className="p-10 text-center text-xs text-text-muted flex items-center justify-center gap-2">
              <Loader2 size={16} className="animate-spin text-accent" />
              Carregando Radar B3...
            </div>
          ) : items.length === 0 ? (
            <div className="p-10 text-center space-y-3">
              <Sparkles size={28} className="mx-auto text-accent opacity-80" />
              <div className="space-y-1">
                <p className="text-sm font-bold text-text-primary">
                  {totalCached === 0 ? 'Cache do Radar B3 ainda vazio' : 'Nenhum ativo encontrado com esses filtros'}
                </p>
                <p className="text-xs text-text-muted">
                  {totalCached === 0
                    ? 'Clique em "Atualizar Radar B3" para buscar preços-teto, múltiplos e checklist dos ~107 papéis líquidos da Bolsa.'
                    : 'Limpe os filtros ou digite qualquer ticker B3 no campo "Consultar" acima.'}
                </p>
              </div>
              {totalCached === 0 && (
                <button
                  type="button"
                  onClick={handleRefreshScreener}
                  className="px-4 py-2 rounded-lg bg-accent text-white text-xs font-bold inline-flex items-center gap-1.5"
                >
                  <RefreshCw size={13} /> Popular Radar Agora
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-surface-elevated text-text-muted uppercase text-[10px] tracking-wider border-b border-border-subtle sticky top-0 z-10">
                  <tr>
                    <th scope="col" className="px-4 py-3">Ativo</th>
                    <th scope="col" className="px-4 py-3 text-right">Preço</th>
                    <th scope="col" className="px-4 py-3 text-right">DY 12m</th>
                    <th scope="col" className="px-4 py-3 text-right">Teto Bazin</th>
                    <th scope="col" className="px-4 py-3 text-right">V.I. Graham / P/VP</th>
                    <th scope="col" className="px-4 py-3 text-right">ROE / Magic</th>
                    <th scope="col" className="px-4 py-3 text-right">Qualidade</th>
                    <th scope="col" className="px-4 py-3 text-center w-12">Obs.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {items.map((item) => {
                    const isFav = watchlistTickers.has(item.ticker);
                    const mgBazin = item.margin_bazin_pct;
                    const q = item.quality_score || 0;
                    const qBarCls =
                      q >= 75 ? 'bg-status-success' : q >= 50 ? 'bg-status-warning' : 'bg-status-error';

                    return (
                      <tr
                        key={item.ticker}
                        onClick={() => setInspectedAsset({ ticker: item.ticker, asset_type: item.asset_type })}
                        className="hover:bg-surface-elevated cursor-pointer transition-colors"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-text-primary">{item.ticker}</span>
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-surface-input text-text-muted border border-border-subtle font-semibold">
                              {item.asset_type === 'FII' ? <Building2 size={10} className="inline mr-0.5" /> : <TrendingUp size={10} className="inline mr-0.5" />}
                              {item.asset_type}
                            </span>
                            {item.in_portfolio && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-accent-soft text-accent font-bold">
                                Em carteira
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-text-muted truncate max-w-[200px]">
                            {item.name} • {item.sector}
                          </div>
                        </td>

                        <td className="px-4 py-3 text-right font-mono font-semibold text-text-primary whitespace-nowrap">
                          <div>{formatMoney(item.price)}</div>
                          {item.change_percent !== null && (
                            <div className={`text-[10px] ${item.change_percent >= 0 ? 'text-status-success' : 'text-status-error'}`}>
                              {item.change_percent > 0 ? '+' : ''}
                              {item.change_percent.toFixed(2)}%
                            </div>
                          )}
                        </td>

                        <td className="px-4 py-3 text-right font-mono font-bold text-status-success whitespace-nowrap">
                          {item.dy_12m !== null ? `${item.dy_12m.toFixed(2)}%` : 'N/D'}
                        </td>

                        <td className="px-4 py-3 text-right font-mono whitespace-nowrap">
                          <div className="font-semibold text-text-primary">
                            {item.bazin_price ? formatMoney(item.bazin_price) : 'N/D'}
                          </div>
                          {mgBazin !== null && mgBazin !== undefined && (
                            <div className={`text-[10px] font-bold ${mgBazin >= 0 ? 'text-status-success' : 'text-status-error'}`}>
                              {mgBazin > 0 ? '+' : ''}
                              {mgBazin.toFixed(1)}%
                            </div>
                          )}
                        </td>

                        <td className="px-4 py-3 text-right font-mono whitespace-nowrap">
                          {item.asset_type === 'FII' ? (
                            <span className={`font-bold ${(item.pvp || 9) <= 1.0 ? 'text-status-success' : 'text-text-primary'}`}>
                              {item.pvp ? `${item.pvp.toFixed(2)}x` : 'N/D'}
                            </span>
                          ) : (
                            <>
                              <div className="font-semibold text-text-primary">
                                {item.graham_price ? formatMoney(item.graham_price) : 'N/D'}
                              </div>
                              {item.margin_graham_pct !== null && item.margin_graham_pct !== undefined && (
                                <div className={`text-[10px] font-bold ${item.margin_graham_pct >= 0 ? 'text-status-success' : 'text-status-error'}`}>
                                  {item.margin_graham_pct > 0 ? '+' : ''}
                                  {item.margin_graham_pct.toFixed(0)}%
                                </div>
                              )}
                            </>
                          )}
                        </td>

                        <td className="px-4 py-3 text-right font-mono whitespace-nowrap">
                          <div className="text-text-primary font-semibold">
                            {item.roe !== null ? `ROE ${item.roe.toFixed(1)}%` : item.pl !== null ? `P/L ${item.pl.toFixed(1)}x` : 'N/D'}
                          </div>
                          {item.magic_score !== null && (
                            <div className="text-[10px] text-accent font-bold">
                              Magic: {item.magic_score.toFixed(0)} pts
                            </div>
                          )}
                        </td>

                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <div className="flex flex-col items-end gap-1">
                            <span className="font-mono font-bold text-text-primary">{q}/100</span>
                            <div className="w-16 h-1.5 rounded-full bg-surface-input overflow-hidden">
                              <div className={`h-full ${qBarCls}`} style={{ width: `${Math.max(4, q)}%` }} />
                            </div>
                          </div>
                        </td>

                        <td className="px-4 py-3 text-center">
                          <button
                            type="button"
                            onClick={(e) => toggleWatchlist(item.ticker, e)}
                            title={isFav ? 'Remover da Watchlist' : 'Adicionar à Watchlist'}
                            className={`p-1.5 rounded-lg transition-colors ${
                              isFav ? 'text-status-warning bg-status-warning/10' : 'text-text-muted hover:text-status-warning'
                            }`}
                          >
                            <Star size={14} fill={isFav ? 'currentColor' : 'none'} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modal de Inspeção Detalhada de Ativo do Radar */}
      {inspectedAsset && (
        <ModalShell
          onClose={() => setInspectedAsset(null)}
          title={`Valuation & Checklist — ${inspectedAsset.ticker}`}
          subtitle={inspectedAsset.asset_type || 'B3'}
          icon={<ShieldCheck size={20} />}
          maxWidth="2xl"
        >
          <ValuationPanel ticker={inspectedAsset.ticker} assetType={inspectedAsset.asset_type} />
        </ModalShell>
      )}
    </div>
  );
}
