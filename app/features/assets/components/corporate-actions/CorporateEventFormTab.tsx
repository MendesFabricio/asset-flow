'use client';

import { useState, useRef, useEffect } from 'react';
import { AlertCircle } from 'lucide-react';
import { Asset } from '@/types';
import { computeSimulatedImpact } from './types';

interface CorporateEventFormTabProps {
  assets: Asset[];
  ticker: string;
  date: string;
  actionType: string;
  factor: string;
  percent: string;
  unitCost: string;
  newTicker: string;
  receivedQty: string;
  costPercent: string;
  auctionValue: string;
  loading: boolean;
  onChangeTicker: (v: string) => void;
  onChangeDate: (v: string) => void;
  onChangeActionType: (v: string) => void;
  onChangeFactor: (v: string) => void;
  onChangePercent: (v: string) => void;
  onChangeUnitCost: (v: string) => void;
  onChangeNewTicker: (v: string) => void;
  onChangeReceivedQty: (v: string) => void;
  onChangeCostPercent: (v: string) => void;
  onChangeAuctionValue: (v: string) => void;
  onSubmit: () => void;
}

export function CorporateEventFormTab(props: CorporateEventFormTabProps) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedAsset = props.assets.find((a) => a.ticker === props.ticker);
  const filteredAssets = props.assets.filter((a) => a.ticker.toLowerCase().includes(props.ticker.toLowerCase()));

  const isFractional = (() => {
    if (!selectedAsset) return false;
    const oldQ = Number(selectedAsset.qtd);
    let newQ = oldQ;
    if (props.actionType === 'SPLIT') {
      const f = Number(props.factor);
      if (f > 0) newQ = oldQ * f;
    } else if (props.actionType === 'INPLIT') {
      const f = Number(props.factor);
      if (f > 0) newQ = oldQ / f;
    } else if (props.actionType === 'BONUS') {
      const p = Number(props.percent);
      newQ = oldQ + oldQ * (p / 100);
    }
    return Math.abs(newQ - Math.floor(newQ)) > 0.0001;
  })();

  const isAuctionValueMissing = isFractional && (!props.auctionValue || Number(props.auctionValue) <= 0);
  const simulatedMsg = computeSimulatedImpact({
    selectedAsset,
    actionType: props.actionType,
    ticker: props.ticker,
    factor: props.factor,
    percent: props.percent,
    unitCost: props.unitCost,
    newTicker: props.newTicker,
    costPercent: props.costPercent,
  });

  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1 relative" ref={dropdownRef}>
          <label className="text-xs font-semibold text-text-muted">Ativo Alvo</label>
          <input
            type="text"
            value={props.ticker}
            onChange={(e) => {
              props.onChangeTicker(e.target.value.toUpperCase());
              setIsDropdownOpen(true);
            }}
            onFocus={() => setIsDropdownOpen(true)}
            placeholder="Digite o ticker..."
            className="w-full bg-surface-input border border-border-subtle rounded-lg p-2.5 text-sm text-text-primary outline-none focus:border-accent transition-colors uppercase"
          />

          {isDropdownOpen && filteredAssets.length > 0 && (
            <div className="absolute z-50 w-full mt-1 bg-surface-card border border-border-subtle rounded-lg shadow-xl max-h-60 overflow-y-auto">
              {filteredAssets.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => {
                    props.onChangeTicker(a.ticker);
                    setIsDropdownOpen(false);
                  }}
                  className="w-full text-left px-4 py-2 hover:bg-surface-elevated transition-colors flex justify-between items-center"
                >
                  <span className="font-semibold text-text-primary">{a.ticker}</span>
                  <span className="text-xs text-text-muted tabular-nums">{a.qtd} cotas</span>
                </button>
              ))}
            </div>
          )}

          {props.ticker && !selectedAsset && !isDropdownOpen && (
            <p className="text-status-error text-xs mt-1">Este ativo não está na sua carteira.</p>
          )}
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold text-text-muted">Data do Evento (Ex-Date)</label>
          <input
            type="date"
            value={props.date}
            onChange={(e) => props.onChangeDate(e.target.value)}
            className="w-full bg-surface-input border border-border-subtle rounded-lg p-2.5 text-sm text-text-primary outline-none focus:border-accent transition-colors"
          />
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-semibold text-text-muted">Tipo de Evento</label>
        <select
          value={props.actionType}
          onChange={(e) => props.onChangeActionType(e.target.value)}
          className="w-full bg-surface-input border border-border-subtle rounded-lg p-2.5 text-sm text-text-primary outline-none focus:border-accent transition-colors"
        >
          <option value="SPLIT">Desdobramento (Split)</option>
          <option value="INPLIT">Grupamento (Inplit)</option>
          <option value="BONUS">Bonificação</option>
          <option value="SPIN_OFF">Cisão (Spin-off)</option>
          <option value="TICKER_CHANGE">Mudança de Ticker / Incorporação</option>
          <option value="AMORTIZATION">Amortização (Devolução de Capital)</option>
        </select>
      </div>

      <div className="p-4 rounded-xl bg-surface-elevated border border-border-subtle space-y-4">
        {(props.actionType === 'SPLIT' || props.actionType === 'INPLIT') && (
          <div className="space-y-1">
            <label className="text-xs font-semibold text-text-muted">
              {props.actionType === 'SPLIT'
                ? 'Fator Multiplicador (ex: 4 para um split 1:4)'
                : 'Fator Divisor (ex: 10 para um inplit 10:1)'}
            </label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={props.factor}
              onChange={(e) => props.onChangeFactor(e.target.value)}
              className="w-full bg-surface-input border border-border-subtle rounded-lg p-2.5 text-sm text-text-primary outline-none focus:border-accent"
            />
          </div>
        )}

        {props.actionType === 'AMORTIZATION' && (
          <div className="space-y-1">
            <label className="text-xs font-semibold text-text-muted">Valor Amortizado por Cota (R$)</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={props.unitCost}
              onChange={(e) => props.onChangeUnitCost(e.target.value)}
              placeholder="Ex: 1.50"
              className="w-full bg-surface-input border border-border-subtle rounded-lg p-2.5 text-sm text-text-primary outline-none focus:border-accent"
            />
          </div>
        )}

        {props.actionType === 'BONUS' && (
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-text-muted">Proporção Recebida (%)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={props.percent}
                onChange={(e) => props.onChangePercent(e.target.value)}
                className="w-full bg-surface-input border border-border-subtle rounded-lg p-2.5 text-sm text-text-primary outline-none focus:border-accent"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-text-muted">Custo Unitário (R$)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={props.unitCost}
                onChange={(e) => props.onChangeUnitCost(e.target.value)}
                className="w-full bg-surface-input border border-border-subtle rounded-lg p-2.5 text-sm text-text-primary outline-none focus:border-accent"
              />
            </div>
          </div>
        )}

        {props.actionType === 'SPIN_OFF' && (
          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-text-muted">Ticker Recebido (Nova Ação)</label>
              <input
                type="text"
                value={props.newTicker}
                onChange={(e) => props.onChangeNewTicker(e.target.value)}
                placeholder="Ex: XPXP31"
                className="w-full bg-surface-input border border-border-subtle rounded-lg p-2.5 text-sm text-text-primary outline-none focus:border-accent uppercase"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-text-muted">Quantidade Recebida</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={props.receivedQty}
                  onChange={(e) => props.onChangeReceivedQty(e.target.value)}
                  className="w-full bg-surface-input border border-border-subtle rounded-lg p-2.5 text-sm text-text-primary outline-none focus:border-accent"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-text-muted">Custo Transferido (%)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={props.costPercent}
                  onChange={(e) => props.onChangeCostPercent(e.target.value)}
                  className="w-full bg-surface-input border border-border-subtle rounded-lg p-2.5 text-sm text-text-primary outline-none focus:border-accent"
                />
              </div>
            </div>
          </div>
        )}

        {props.actionType === 'TICKER_CHANGE' && (
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-text-muted">Novo Ticker</label>
              <input
                type="text"
                value={props.newTicker}
                onChange={(e) => props.onChangeNewTicker(e.target.value)}
                placeholder="Ex: NTCO3"
                className="w-full bg-surface-input border border-border-subtle rounded-lg p-2.5 text-sm text-text-primary outline-none focus:border-accent uppercase"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-text-muted">Fator de Conversão</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={props.factor}
                onChange={(e) => props.onChangeFactor(e.target.value)}
                className="w-full bg-surface-input border border-border-subtle rounded-lg p-2.5 text-sm text-text-primary outline-none focus:border-accent"
              />
            </div>
          </div>
        )}

        {isFractional && (
          <div className="pt-4 border-t border-border-subtle mt-4 space-y-2">
            <label className="text-xs font-bold text-status-success flex items-center gap-2">
              <AlertCircle size={14} />
              Valor Recebido por Frações em Leilão (Obrigatório)
            </label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={props.auctionValue}
              onChange={(e) => props.onChangeAuctionValue(e.target.value)}
              placeholder="Ex: 45.20"
              className="w-full bg-surface-input border border-emerald-500/50 rounded-lg p-2.5 text-sm text-text-primary outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-500/20 transition-all"
            />
            <p className="text-[10px] text-text-muted leading-relaxed">
              Este evento gerou uma fração de cota (número quebrado). A sua corretora venderá essa fração e depositará o dinheiro na conta. Informe o valor líquido depositado para o DARF.
            </p>
          </div>
        )}
      </div>

      {simulatedMsg && (
        <div className="mt-6 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-status-success text-sm flex gap-3">
          <AlertCircle size={20} className="shrink-0 mt-0.5" />
          <div>
            <strong className="block mb-1 font-bold uppercase tracking-wide text-xs">Como ficará a sua carteira:</strong>
            <p className="leading-relaxed">{simulatedMsg}</p>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={props.onSubmit}
        disabled={props.loading || !props.ticker || !selectedAsset || isAuctionValueMissing}
        className="w-full py-3 bg-accent hover:bg-accent-hover text-white font-bold rounded-xl transition-all disabled:opacity-50 mt-6"
      >
        {props.loading ? 'Processando...' : 'Confirmar Evento Corporativo'}
      </button>
    </>
  );
}
