'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Compass, Loader2, Plus, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import { apiCall } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { ModalShell } from '@/components/ModalShell';
import { usePrivacy } from '@/context/PrivacyContext';
import { useToast } from '@/context/ToastContext';
import { ValuationAssetData, WatchlistEntry } from '@/types';
import { ValuationPanel } from './ValuationPanel';
import { SignalsBookView } from './SignalsBookView';
import { RadarResponse, STRATEGIES, StrategyMode } from './radar/types';
import { RadarFiltersBar } from './radar/RadarFiltersBar';
import { WatchlistTable } from './radar/WatchlistTable';
import { RadarOpportunitiesTable } from './radar/RadarOpportunitiesTable';

export function RadarTab() {
  const { notify } = useToast();
  const { isHidden } = usePrivacy();
  const money = (val: number) => (isHidden ? 'R$ •••••' : formatMoney(val));
  const [strategy, setStrategy] = useState<StrategyMode>('signals');
  const [exploreStrategy, setExploreStrategy] = useState<'quality' | 'dividends' | 'bargain' | 'magic' | 'fiis'>('quality');
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
      if (res.status === 'Sucesso') setWatchlist(res.items || []);
    } catch {}
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
        if (res.sync_state?.status === 'processing') setRefreshing(true);
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Erro ao carregar Radar B3.', 'error');
    } finally {
      setLoading(false);
    }
  }, [strategy, assetType, sector, search, onlyOutside, notify]);

  useEffect(() => {
    if (strategy !== 'signals') loadRadar();
  }, [strategy, loadRadar]);

  useEffect(() => {
    loadWatchlist();
  }, [loadWatchlist]);

  useEffect(() => {
    if (!refreshing) return;
    const interval = setInterval(async () => {
      if (typeof document !== 'undefined' && document.hidden) return;
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
                className="pl-8 pr-3 py-2 rounded-lg bg-surface-input border border-border-subtle text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent w-56 sm:w-64"
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

      <div className="flex flex-wrap gap-2">
        {[
          { id: 'signals' as const, label: 'Oportunidades (Sinais)', hint: 'Onde comprar agora' },
          { id: exploreStrategy, label: 'Explorar Mercado', hint: 'Ranking de ações e FIIs' },
          { id: 'watchlist' as const, label: 'Minha Watchlist', hint: 'Alvos salvos' },
        ].map((tab, idx) => {
          const isExploreTab = idx === 1;
          const active = isExploreTab ? strategy !== 'signals' && strategy !== 'watchlist' : strategy === tab.id;
          return (
            <button
              key={tab.label}
              type="button"
              onClick={() => setStrategy(isExploreTab ? exploreStrategy : tab.id)}
              className={`px-4 py-2.5 rounded-xl border text-left transition-all flex items-center gap-2 ${
                active
                  ? 'bg-accent-soft border-accent text-accent shadow-sm'
                  : 'bg-surface-card border-border-subtle text-text-muted hover:text-text-primary'
              }`}
            >
              <span className="text-xs font-bold">{tab.label}</span>
              <span className="text-[10px] opacity-75 hidden sm:inline">• {tab.hint}</span>
            </button>
          );
        })}
      </div>

      {strategy !== 'watchlist' && strategy !== 'signals' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-semibold text-text-muted mr-1">Critério:</span>
            {STRATEGIES.filter((s) => s.id !== 'watchlist' && s.id !== 'signals').map((s) => {
              const active = strategy === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    const next = s.id as 'quality' | 'dividends' | 'bargain' | 'magic' | 'fiis';
                    setExploreStrategy(next);
                    setStrategy(next);
                  }}
                  className={`px-3 py-1 rounded-lg border text-[11px] font-bold transition-colors ${
                    active
                      ? 'bg-accent-soft border-accent/40 text-accent'
                      : 'bg-surface-card border-border-subtle text-text-muted hover:text-text-primary'
                  }`}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
          <RadarFiltersBar
            search={search}
            assetType={assetType}
            sector={sector}
            sectors={sectors}
            onlyOutside={onlyOutside}
            onSearchChange={setSearch}
            onAssetTypeChange={setAssetType}
            onSectorChange={setSector}
            onOnlyOutsideChange={setOnlyOutside}
          />
        </div>
      )}

      {strategy === 'signals' ? (
        <SignalsBookView onSelectTicker={(tkr) => setInspectedAsset({ ticker: tkr })} />
      ) : strategy === 'watchlist' ? (
        <WatchlistTable
          watchlist={watchlist}
          money={money}
          onSelectAsset={(ticker, asset_type) => setInspectedAsset({ ticker, asset_type })}
          onRemove={toggleWatchlist}
        />
      ) : (
        <RadarOpportunitiesTable
          loading={loading}
          totalCached={totalCached}
          items={items}
          watchlistTickers={watchlistTickers}
          money={money}
          onRefresh={handleRefreshScreener}
          onSelectAsset={(ticker, asset_type) => setInspectedAsset({ ticker, asset_type })}
          onToggleWatchlist={toggleWatchlist}
        />
      )}

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
