'use client';
import { useState, useEffect } from 'react';
import { Save, Calculator, Trash2, DollarSign, Plus, Minus, Activity } from 'lucide-react';
import { Asset, AssetTransaction } from '@/types';
import { apiCall } from '@/lib/api';
import { ModalShell } from '@/components/ModalShell';
import { formatMoney } from '@/lib/format';

interface EditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  ativo: Asset | null;
  allAssets?: Asset[];
}

type SettingsFormField = 'target_percent' | 'manual_dy' | 'manual_lpa' | 'manual_vpa' | 'manual_price';

interface InputControlProps {
  label: string;
  value: number;
  field: SettingsFormField;
  step: number;
  precision: number;
  color?: string;
  onAdjust: (field: SettingsFormField, delta: number, precision: number) => void;
  onChange: (field: SettingsFormField, value: number) => void;
}

const InputControl = ({ label, value, field, step, precision, color = "blue", onAdjust, onChange }: InputControlProps) => {
  const colorClasses = {
    blue: { ring: "focus-within:ring-blue-500/50", text: "text-blue-500", hoverBg: "hover:bg-blue-500/10" },
    purple: { ring: "focus-within:ring-purple-500/50", text: "text-purple-500", hoverBg: "hover:bg-purple-500/10" },
    emerald: { ring: "focus-within:ring-emerald-500/50", text: "text-emerald-500", hoverBg: "hover:bg-emerald-500/10" }
  };
  const style = colorClasses[color as keyof typeof colorClasses] || colorClasses.blue;

  return (
    <div className="space-y-1.5">
      <label className="text-[10px] uppercase font-bold text-slate-500 tracking-widest ml-1">{label}</label>
      <div className={`flex items-center bg-slate-800/30 border border-slate-700/50 rounded-lg overflow-hidden focus-within:ring-1 ${style.ring} transition-all shadow-sm`}>
        <button type="button" onClick={() => onAdjust(field, -step, precision)} className={`p-2.5 ${style.text} ${style.hoverBg} transition-colors`}>
          <Minus size={14} />
        </button>
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(field, Number(e.target.value))}
          className="w-full bg-transparent p-2 text-white outline-none font-mono text-center text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
        <button type="button" onClick={() => onAdjust(field, step, precision)} className={`p-2.5 ${style.text} ${style.hoverBg} transition-colors`}>
          <Plus size={14} />
        </button>
      </div>
    </div>
  );
};

export const EditModal = ({ isOpen, onClose, onSave, ativo, allAssets = [] }: EditModalProps) => {
  const [activeTab, setActiveTab] = useState<'TRANSACTION' | 'HISTORY' | 'SETTINGS'>('TRANSACTION');
  
  // -- Transaction State --
  const [txData, setTxData] = useState({
    type: 'BUY',
    quantity: 0,
    unit_price: 0,
    date: new Date().toISOString().substring(0, 10)
  });
  const [txError, setTxError] = useState<string | null>(null);
  
  // -- History State --
  const [transactions, setTransactions] = useState<AssetTransaction[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // -- Settings State --
  const [settingsData, setSettingsData] = useState({
    target_percent: 0,
    manual_dy: 0,
    manual_lpa: 0,
    manual_vpa: 0,
    manual_price: 0
  });

  const [loading, setLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    if (ativo && isOpen) {
      // Reset states
      setActiveTab('TRANSACTION');
      setTxError(null);
      setTxData(prev => ({ 
        ...prev, 
        quantity: 0, 
        unit_price: Number(ativo.preco_atual) || 0, 
        date: new Date().toISOString().substring(0, 10) 
      }));
      
      setSettingsData({
        target_percent: ativo.meta || 0,
        manual_dy: Number(((ativo.manual_dy || 0) * 100).toFixed(2)),
        manual_lpa: ativo.manual_lpa || 0,
        manual_vpa: ativo.manual_vpa || 0,
        manual_price: Number(ativo.preco_atual) || 0
      });
      setShowDeleteConfirm(false);
    }
  }, [ativo, isOpen]);

  useEffect(() => {
    if (isOpen && ativo && activeTab === 'HISTORY') {
      setLoadingHistory(true);
      apiCall<AssetTransaction[]>(`/api/asset-transactions/${ativo.ticker}`)
        .then(data => setTransactions(data))
        .catch(err => console.error(err))
        .finally(() => setLoadingHistory(false));
    }
  }, [isOpen, ativo, activeTab]);

  // -- Settings Handlers --
  const handleAdjustValue = (field: keyof typeof settingsData, delta: number, precision = 2) => {
    setSettingsData(prev => {
      const newVal = Number((prev[field] + delta).toFixed(precision));
      return { ...prev, [field]: Math.max(0, newVal) };
    });
  };

  const handleInputChange = (field: SettingsFormField, value: number) => {
    const sanitizedValue = Math.max(0, isNaN(value) ? 0 : value);
    setSettingsData(prev => ({ ...prev, [field]: sanitizedValue }));
  };

  const isMarketTicker = (ticker: string) => {
    if (!ticker) return false;
    const t = ticker.trim().toUpperCase();
    return /^[A-Z]{4}[0-9]{1,2}$/.test(t) || /^[A-Z0-9]{4,6}11$/.test(t) || /^[A-Z]{1,4}$/.test(t);
  };

  const shouldShowManualPrice = () => {
    if (!ativo) return false;
    const ticker = ativo.ticker?.trim().toUpperCase() || "";
    const preco = Number(ativo.preco_atual);
    return !isMarketTicker(ticker) || isNaN(preco) || preco <= 0;
  };

  const maxLimit = (() => {
    if (!ativo) return 100;
    const totalOcupado = allAssets
      .filter((a) => a.tipo === ativo.tipo && a.ticker !== ativo.ticker)
      .reduce((acc, a) => acc + (a.meta || 0), 0);
    return Math.max(0, 100 - totalOcupado);
  })();

  const handleSaveSettings = async () => {
    if (!ativo) return;
    setLoading(true);
    try {
      const payload = {
        ticker: ativo.ticker,
        qtd: ativo.qtd,
        pm: ativo.pm,
        meta: Number(settingsData.target_percent),
        dy: Number(settingsData.manual_dy) / 100,
        lpa: Number(settingsData.manual_lpa),
        vpa: Number(settingsData.manual_vpa),
        current_price: Number(settingsData.manual_price)
      };

      await apiCall('/api/update_asset', { method: 'POST', body: JSON.stringify(payload) });
      onSave();
      onClose();
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!ativo) return;
    setLoading(true);
    try {
      await apiCall('/api/delete_asset', {
        method: 'POST',
        body: JSON.stringify({ id: (ativo as Asset & { id?: number }).id }),
      });
      onSave();
      onClose();
    } finally { setLoading(false); }
  };

  // -- Transaction Handlers --
  const handleTxChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setTxError(null);
    setTxData({ ...txData, [e.target.name]: e.target.value });
  };

  const handleSaveTransaction = async () => {
    const qty = Number(txData.quantity);
    const price = Number(txData.unit_price);

    if (isNaN(qty) || qty <= 0 || isNaN(price) || price <= 0) {
      setTxError("Quantidade e Preço devem ser maiores que zero.");
      return;
    }

    setLoading(true);
    try {
      await apiCall('/api/asset-transactions', {
        method: 'POST',
        body: JSON.stringify({
          ticker: ativo?.ticker,
          type: txData.type,
          quantity: qty,
          unit_price: price,
          date: new Date(txData.date).toISOString()
        })
      });
      onSave();
      onClose();
    } catch (e) {
        setTxError((e as Error).message || "Erro ao registrar transação");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !ativo) return null;

  return (
    <ModalShell
      onClose={onClose}
      title={`Gerenciar ${ativo.ticker}`}
      subtitle={ativo.tipo}
      maxWidth="md"
      zIndex={100}
      noPadding
    >
      {/* Tabs Header */}
      <div className="flex items-center gap-4 px-6 py-3 bg-slate-900 border-b border-slate-800">
        <button
          onClick={() => setActiveTab('TRANSACTION')}
          className={`text-[11px] font-bold uppercase tracking-wider transition-colors ${activeTab === 'TRANSACTION' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-slate-500 hover:text-slate-300'}`}
        >
          Nova Transação
        </button>
        <button
          onClick={() => setActiveTab('HISTORY')}
          className={`text-[11px] font-bold uppercase tracking-wider transition-colors ${activeTab === 'HISTORY' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-slate-500 hover:text-slate-300'}`}
        >
          Histórico
        </button>
        <button
          onClick={() => setActiveTab('SETTINGS')}
          className={`text-[11px] font-bold uppercase tracking-wider transition-colors ${activeTab === 'SETTINGS' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-slate-500 hover:text-slate-300'}`}
        >
          Configurações
        </button>
      </div>

      <div className="p-6">
        {/* Tab 1: Transaction */}
        {activeTab === 'TRANSACTION' && (
          <div className="space-y-4">
            {txError && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-md text-red-500 text-sm">
                {txError}
              </div>
            )}
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-sm text-slate-400">Tipo</label>
                <select
                  name="type"
                  value={txData.type}
                  onChange={handleTxChange}
                  className="w-full bg-slate-800/30 border border-slate-700/50 rounded-lg p-3 text-white focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 outline-none transition-all shadow-sm hover:bg-slate-800/40"
                >
                  <option value="BUY">Compra</option>
                  <option value="SELL">Venda</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-sm text-slate-400">Data (Opcional)</label>
                <input
                  type="date"
                  name="date"
                  value={txData.date}
                  onChange={handleTxChange}
                  className="w-full bg-slate-800/30 border border-slate-700/50 rounded-lg p-3 text-white focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 outline-none transition-all text-sm shadow-sm hover:bg-slate-800/40"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-sm text-slate-400">Quantidade</label>
                <input
                  type="number"
                  name="quantity"
                  value={txData.quantity || ''}
                  onChange={handleTxChange}
                  className="w-full bg-slate-800/30 border border-slate-700/50 rounded-lg p-3 text-white focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 outline-none transition-all shadow-sm hover:bg-slate-800/40"
                  placeholder="Ex: 100"
                  step="0.01"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm text-slate-400">Preço Un. (R$)</label>
                <input
                  type="number"
                  name="unit_price"
                  value={txData.unit_price || ''}
                  onChange={handleTxChange}
                  className="w-full bg-slate-800/30 border border-slate-700/50 rounded-lg p-3 text-white focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 outline-none transition-all shadow-sm hover:bg-slate-800/40"
                  placeholder="Ex: 15.50"
                  step="0.01"
                />
              </div>
            </div>

            <div className="mt-8 flex justify-end gap-3 pt-5 border-t border-slate-800/50">
              <button onClick={onClose} className="px-5 py-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 hover:text-white rounded-lg transition-colors">Cancelar</button>
              <button
                onClick={handleSaveTransaction}
                disabled={loading}
                className="inline-flex justify-center items-center gap-2 rounded-lg bg-blue-600 px-6 py-2.5 text-[11px] font-bold uppercase tracking-wider text-white hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-[0_2px_10px_rgba(37,99,235,0.2)]"
              >
                {loading ? 'Salvando...' : 'Salvar Transação'}
              </button>
            </div>
          </div>
        )}

        {/* Tab 2: History */}
        {activeTab === 'HISTORY' && (
          <div className="max-h-[300px] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-800">
            {loadingHistory ? (
              <div className="flex items-center justify-center text-slate-500 gap-2 py-10">
                <Activity className="animate-spin" /> Carregando...
              </div>
            ) : transactions.length > 0 ? (
              <div className="border border-slate-800/80 rounded-lg overflow-hidden shadow-sm">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900/80 text-slate-400 uppercase tracking-wider border-b border-slate-800/80">
                    <tr>
                      <th className="px-3 py-2">Data</th>
                      <th className="px-3 py-2">Tipo</th>
                      <th className="px-3 py-2 text-right">Qtd</th>
                      <th className="px-3 py-2 text-right">Preço</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {transactions.map((tx) => (
                      <tr key={tx.id} className="hover:bg-slate-800/30">
                        <td className="px-3 py-2 text-slate-300">
                          {new Date(tx.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                        </td>
                        <td className="px-3 py-2">
                          <span className={`px-1.5 py-0.5 rounded font-bold ${
                            tx.type === 'BUY' ? 'bg-emerald-500/10 text-emerald-400' :
                            tx.type === 'SELL' ? 'bg-red-500/10 text-red-400' :
                            'bg-purple-500/10 text-purple-400'
                          }`}>
                            {tx.type === 'BUY' ? 'COMPRA' : 
                             tx.type === 'SELL' ? 'VENDA' : 
                             tx.type === 'AMORTIZATION' ? 'AMORTIZAÇÃO' :
                             String(tx.type).replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right text-slate-300 font-mono">
                          {tx.quantity}
                        </td>
                        <td className="px-3 py-2 text-right text-slate-300 font-mono">
                          {formatMoney(tx.unit_price)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-10 text-slate-500 text-sm">
                Nenhuma transação encontrada.
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Settings */}
        {activeTab === 'SETTINGS' && (
          <div className="space-y-6">
            {shouldShowManualPrice() && (
              <div className="bg-emerald-500/5 border border-emerald-500/20 p-4 rounded-xl space-y-3">
                <div className="flex items-center gap-2 text-emerald-400">
                  <DollarSign size={16} />
                  <span className="text-[10px] font-bold uppercase tracking-widest leading-none">Preço Manual</span>
                </div>
                <InputControl label="Preço Atual / Saldo" value={settingsData.manual_price} field="manual_price" step={10} precision={2} color="emerald" onAdjust={handleAdjustValue} onChange={handleInputChange} />
              </div>
            )}

            <div className="space-y-3">
              <label className="text-[10px] uppercase font-bold text-slate-500 tracking-widest flex justify-between items-center ml-1">
                <span>Meta na Carteira</span>
                <div className="text-right flex flex-col items-end">
                  <span className="text-blue-400 font-mono text-sm leading-none">{settingsData.target_percent}%</span>
                  <span className="text-[9px] text-slate-600 font-normal tracking-normal mt-1">limite: {maxLimit.toFixed(1)}%</span>
                </div>
              </label>
              <input
                type="range" min="0" max={maxLimit} step="0.5"
                value={settingsData.target_percent > maxLimit ? maxLimit : settingsData.target_percent}
                onChange={(e) => handleInputChange('target_percent', Number(e.target.value))}
                className="w-full h-1.5 bg-slate-800/50 rounded-lg appearance-none cursor-pointer accent-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>

            {!shouldShowManualPrice() && (
              <div className="pt-5 border-t border-slate-800/50 space-y-4">
                <div className="flex items-center gap-2 ml-1">
                  <Calculator size={14} className="text-purple-400" />
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Inteligência</span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <InputControl label="DY Anual %" value={settingsData.manual_dy} field="manual_dy" step={0.1} precision={2} color="purple" onAdjust={handleAdjustValue} onChange={handleInputChange} />
                  {ativo.tipo === 'FII' && (
                    <InputControl label="VP / Cota" value={settingsData.manual_vpa} field="manual_vpa" step={0.5} precision={2} color="purple" onAdjust={handleAdjustValue} onChange={handleInputChange} />
                  )}
                  {ativo.tipo === 'Ação' && (
                    <>
                      <InputControl label="LPA (Lucro)" value={settingsData.manual_lpa} field="manual_lpa" step={0.5} precision={2} color="purple" onAdjust={handleAdjustValue} onChange={handleInputChange} />
                      <div className="col-span-2">
                        <InputControl label="VPA (Patrimonial)" value={settingsData.manual_vpa} field="manual_vpa" step={0.5} precision={2} color="purple" onAdjust={handleAdjustValue} onChange={handleInputChange} />
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
            
            <div className="flex justify-between items-center w-full pt-5 border-t border-slate-800/50 mt-8">
              {showDeleteConfirm ? (
                <div className="flex items-center justify-between w-full">
                  <span className="text-[10px] font-bold text-rose-500 uppercase tracking-widest animate-pulse">Tem certeza?</span>
                  <div className="flex gap-3">
                    <button type="button" onClick={() => setShowDeleteConfirm(false)} className="px-4 py-2.5 rounded-lg text-[10px] font-bold text-slate-300 bg-slate-800 hover:bg-slate-700 uppercase tracking-widest transition-all">Cancelar</button>
                    <button type="button" onClick={handleDelete} disabled={loading} className="px-4 py-2.5 rounded-lg text-[10px] font-bold text-white bg-rose-600 hover:bg-rose-500 uppercase tracking-widest transition-all flex items-center gap-2"><Trash2 size={14} /> Excluir</button>
                  </div>
                </div>
              ) : (
                <>
                  <button type="button" onClick={() => setShowDeleteConfirm(true)} disabled={loading} className="text-rose-500 hover:text-rose-400 p-2 hover:bg-rose-500/10 rounded-lg transition-all flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest disabled:opacity-50">
                    <Trash2 size={16} /> <span className="hidden sm:inline">Excluir</span>
                  </button>
                  <div className="flex gap-3">
                    <button type="button" onClick={onClose} className="px-5 py-2.5 text-[11px] font-bold text-slate-400 hover:text-white uppercase tracking-wider transition-colors">Cancelar</button>
                    <button type="button" onClick={handleSaveSettings} disabled={loading} className="inline-flex justify-center items-center gap-2 rounded-lg bg-blue-600 px-6 py-2.5 text-[11px] font-bold text-white hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-[0_2px_10px_rgba(37,99,235,0.2)] uppercase tracking-wider">
                      {loading ? 'Salvando...' : <><Save size={14} /> Atualizar</>}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </ModalShell>
  );
};
