'use client';
import { useState, useRef, useEffect } from 'react';
import { apiCall } from '@/lib/api';
import { ModalShell } from '@/components/ModalShell';
import { Asset } from '@/types';
import { AlertCircle } from 'lucide-react';

interface CorporateActionGlobalModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  assets: Asset[];
  initialData?: {
    ticker?: string;
    type?: string;
    date?: string;
  };
}

function mapB3TypeToActionType(b3Type: string): string {
  const t = b3Type.toLowerCase();
  if (t.includes('desdobramento') || t.includes('split')) return 'SPLIT';
  if (t.includes('grupamento') || t.includes('inplit')) return 'INPLIT';
  if (t.includes('bonifica')) return 'BONUS';
  if (t.includes('cisão') || t.includes('spinoff') || t.includes('spin-off')) return 'SPIN_OFF';
  if (t.includes('mudança') || t.includes('incorporação')) return 'TICKER_CHANGE';
  if (t.includes('amortiza')) return 'AMORTIZATION';
  return 'SPLIT';
}

export const CorporateActionGlobalModal = ({ isOpen, onClose, onSuccess, assets, initialData }: CorporateActionGlobalModalProps) => {
  const [ticker, setTicker] = useState(initialData?.ticker || '');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [actionType, setActionType] = useState(initialData?.type ? mapB3TypeToActionType(initialData.type) : 'SPLIT');
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
  
  // Generic fields
  const [date, setDate] = useState(initialData?.date || new Date().toISOString().substring(0, 10));

  useEffect(() => {
    if (isOpen && initialData) {
      if (initialData.ticker) setTicker(initialData.ticker);
      if (initialData.type) setActionType(mapB3TypeToActionType(initialData.type));
      if (initialData.date) setDate(initialData.date);
    }
  }, [isOpen, initialData]);
  const [auctionValue, setAuctionValue] = useState<string>('');
  
  // Specific fields
  const [factor, setFactor] = useState<string>('2');
  const [percent, setPercent] = useState<string>('10');
  const [unitCost, setUnitCost] = useState<string>('0');
  const [newTicker, setNewTicker] = useState('');
  const [receivedQty, setReceivedQty] = useState<string>('');
  const [costPercent, setCostPercent] = useState<string>('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const selectedAsset = assets.find(a => a.ticker === ticker);

  const handleSubmit = async () => {
    if (!ticker) {
      setError("Selecione um ativo da sua carteira.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await apiCall('/api/corporate-action', {
        method: 'POST',
        body: JSON.stringify({
          ticker,
          type: actionType,
          date: new Date(date).toISOString(),
          factor: Number(factor),
          percent: Number(percent),
          unit_cost: Number(unitCost),
          auction_value: Number(auctionValue || 0),
          new_ticker: newTicker.toUpperCase(),
          received_qty: Number(receivedQty),
          cost_percent: Number(costPercent)
        })
      });
      onSuccess();
      onClose();
    } catch (e) {
      setError((e as Error).message || "Erro ao registrar evento");
    } finally {
      setLoading(false);
    }
  };

  const filteredAssets = assets.filter(a => a.ticker.toLowerCase().includes(ticker.toLowerCase()));

  const hasFractionalShares = () => {
    if (!selectedAsset) return false;
    const oldQ = Number(selectedAsset.qtd);
    let newQ = oldQ;
    
    if (actionType === 'SPLIT') {
      const f = Number(factor);
      if (f > 0) newQ = oldQ * f;
    } else if (actionType === 'INPLIT') {
      const f = Number(factor);
      if (f > 0) newQ = oldQ / f;
    } else if (actionType === 'BONUS') {
      const p = Number(percent);
      newQ = oldQ + (oldQ * (p / 100));
    }
    
    // Check if newQ has decimal part
    return Math.abs(newQ - Math.floor(newQ)) > 0.0001;
  };

  const isFractional = hasFractionalShares();
  const isAuctionValueMissing = isFractional && (!auctionValue || Number(auctionValue) <= 0);

  const renderSimulatedImpact = () => {
    if (!selectedAsset) return null;
    const oldQ = Number(selectedAsset.qtd);
    const oldPm = Number(selectedAsset.pm);
    let msg = "";

    if (actionType === 'SPLIT') {
      const f = Number(factor);
      if (f > 0) {
        msg = `A posição passará de ${oldQ} para ${oldQ * f} cotas. O PM cairá para ${(oldPm / f).toFixed(2)}.`;
      }
    } else if (actionType === 'INPLIT') {
      const f = Number(factor);
      if (f > 0) {
        msg = `A posição passará de ${oldQ} para ${(oldQ / f).toFixed(2)} cotas. O PM subirá para ${(oldPm * f).toFixed(2)}.`;
      }
    } else if (actionType === 'BONUS') {
      const p = Number(percent);
      const c = Number(unitCost);
      const add = oldQ * (p / 100);
      const nq = oldQ + add;
      if (nq > 0) {
        const npm = ((oldQ * oldPm) + (add * c)) / nq;
        msg = `Você receberá ${add.toFixed(2)} novas cotas. A posição será de ${nq.toFixed(2)} cotas com PM de ${npm.toFixed(2)}.`;
      }
    } else if (actionType === 'SPIN_OFF') {
      const cp = Number(costPercent);
      if (cp > 0 && newTicker) {
        const drop = oldPm * (cp/100);
        msg = `O PM de ${ticker} cairá ${cp}% (para ${(oldPm - drop).toFixed(2)}). Você receberá o ativo ${newTicker} com PM de ${drop.toFixed(2)}.`;
      }
    } else if (actionType === 'TICKER_CHANGE') {
      msg = `A posição de ${ticker} será encerrada (sem impostos) e transferida para ${newTicker || '___'}.`;
    } else if (actionType === 'AMORTIZATION') {
      const c = Number(unitCost);
      if (c > 0) {
        msg = `Você receberá R$ ${c.toFixed(2)} por cota. O PM cairá de R$ ${oldPm.toFixed(2)} para R$ ${Math.max(0, oldPm - c).toFixed(2)}. A quantidade de cotas não muda.`;
      }
    }

    if (!msg) return null;
    return (
      <div className="mt-6 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm flex gap-3 shadow-lg shadow-emerald-500/5">
        <AlertCircle size={20} className="shrink-0 mt-0.5" />
        <div>
          <strong className="block mb-1 font-bold text-emerald-300 uppercase tracking-wide text-xs">Como ficará a sua carteira:</strong> 
          <p className="leading-relaxed">{msg}</p>
        </div>
      </div>
    );
  };

  return (
    <ModalShell zIndex={300} onClose={onClose} title="Eventos Corporativos" subtitle="Ajustes Estruturais de Carteira" maxWidth="lg">
      <div className="space-y-4">
        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex gap-3 text-red-400">
            <AlertCircle size={20} className="shrink-0" />
            <p className="text-sm">{error}</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1 relative" ref={dropdownRef}>
            <label className="text-xs font-semibold text-slate-400">Ativo Alvo</label>
            <input
              type="text"
              value={ticker}
              onChange={(e) => {
                setTicker(e.target.value.toUpperCase());
                setIsDropdownOpen(true);
              }}
              onFocus={() => setIsDropdownOpen(true)}
              placeholder="Digite o ticker..."
              className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500 transition-colors uppercase"
            />
            
            {isDropdownOpen && filteredAssets.length > 0 && (
              <div className="absolute z-50 w-full mt-1 bg-slate-900 border border-slate-700 rounded-lg shadow-xl max-h-60 overflow-y-auto">
                {filteredAssets.map(a => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => {
                      setTicker(a.ticker);
                      setIsDropdownOpen(false);
                    }}
                    className="w-full text-left px-4 py-2 hover:bg-slate-800 transition-colors flex justify-between items-center"
                  >
                    <span className="font-bold text-slate-200">{a.ticker}</span>
                    <span className="text-xs text-slate-400">{a.qtd} cotas</span>
                  </button>
                ))}
              </div>
            )}
            
            {ticker && !selectedAsset && !isDropdownOpen && (
              <p className="text-red-400 text-xs mt-1">Este ativo não está na sua carteira.</p>
            )}
          </div>
          
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-400">Data do Evento (Ex-Date)</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500 transition-colors"
            />
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-400">Tipo de Evento</label>
          <select
            value={actionType}
            onChange={(e) => setActionType(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500 transition-colors"
          >
            <option value="SPLIT">Desdobramento (Split)</option>
            <option value="INPLIT">Grupamento (Inplit)</option>
            <option value="BONUS">Bonificação</option>
            <option value="SPIN_OFF">Cisão (Spin-off)</option>
            <option value="TICKER_CHANGE">Mudança de Ticker / Incorporação</option>
            <option value="AMORTIZATION">Amortização (Devolução de Capital)</option>
          </select>
        </div>

        <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700/50 space-y-4">
          {(actionType === 'SPLIT' || actionType === 'INPLIT') && (
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-400">
                {actionType === 'SPLIT' ? 'Fator Multiplicador (ex: 4 para um split 1:4)' : 'Fator Divisor (ex: 10 para um inplit 10:1)'}
              </label>
              <input
                type="number" step="0.01" min="0.01"
                value={factor} onChange={(e) => setFactor(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500"
              />
            </div>
          )}
          
          {actionType === 'AMORTIZATION' && (
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-400">Valor Amortizado por Cota (R$)</label>
              <input
                type="number" step="0.01" min="0.01"
                value={unitCost} onChange={(e) => setUnitCost(e.target.value)}
                placeholder="Ex: 1.50"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500"
              />
            </div>
          )}

          {actionType === 'BONUS' && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-400">Proporção Recebida (%)</label>
                <input
                  type="number" step="0.01" min="0"
                  value={percent} onChange={(e) => setPercent(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-400">Custo Unitário (R$)</label>
                <input
                  type="number" step="0.01" min="0"
                  value={unitCost} onChange={(e) => setUnitCost(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500"
                />
              </div>
            </div>
          )}

          {actionType === 'SPIN_OFF' && (
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-400">Ticker Recebido (Nova Ação)</label>
                <input
                  type="text"
                  value={newTicker} onChange={(e) => setNewTicker(e.target.value)}
                  placeholder="Ex: XPXP31"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500 uppercase"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-400">Quantidade Recebida</label>
                  <input
                    type="number" step="0.01" min="0"
                    value={receivedQty} onChange={(e) => setReceivedQty(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-400">Custo Transferido (%)</label>
                  <input
                    type="number" step="0.01" min="0" max="100"
                    value={costPercent} onChange={(e) => setCostPercent(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500"
                  />
                </div>
              </div>
            </div>
          )}

          {actionType === 'TICKER_CHANGE' && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-400">Novo Ticker</label>
                <input
                  type="text"
                  value={newTicker} onChange={(e) => setNewTicker(e.target.value)}
                  placeholder="Ex: NTCO3"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500 uppercase"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-400">Fator de Conversão</label>
                <input
                  type="number" step="0.01" min="0.01"
                  value={factor} onChange={(e) => setFactor(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500"
                />
              </div>
            </div>
          )}
          
          {isFractional && (
            <div className="pt-4 border-t border-slate-700/50 mt-4 space-y-2">
              <label className="text-xs font-bold text-emerald-400 flex items-center gap-2">
                <AlertCircle size={14} />
                Valor Recebido por Frações em Leilão (Obrigatório)
              </label>
              <input
                type="number" step="0.01" min="0.01"
                value={auctionValue} onChange={(e) => setAuctionValue(e.target.value)}
                placeholder="Ex: 45.20"
                className="w-full bg-slate-800 border border-emerald-500/50 rounded-lg p-2.5 text-sm outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-500/20 transition-all"
              />
              <p className="text-[10px] text-slate-400 leading-relaxed">
                Este evento gerou uma fração de cota (número quebrado). A sua corretora venderá essa fração e depositará o dinheiro na conta. Informe o valor líquido depositado para o DARF.
              </p>
            </div>
          )}
        </div>

        {renderSimulatedImpact()}

        <button
          onClick={handleSubmit}
          disabled={loading || !ticker || !selectedAsset || isAuctionValueMissing}
          className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl transition-all disabled:opacity-50 mt-6 shadow-[0_4px_14px_0_rgb(37,99,235,0.39)] hover:shadow-[0_6px_20px_rgba(37,99,235,0.23)]"
        >
          {loading ? 'Processando...' : 'Confirmar Evento Corporativo'}
        </button>
      </div>
    </ModalShell>
  );
};
