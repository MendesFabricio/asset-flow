'use client';
import { useState, useEffect } from 'react';
import { X, Save, Calculator, Trash2, DollarSign, Info, Plus, Minus } from 'lucide-react';
import { Asset } from '../types';
import { apiCall } from '../utils/apiClient';

interface EditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  ativo: Asset | null;
  allAssets?: Asset[];
}

type EditFormField = 'quantity' | 'average_price' | 'target_percent' | 'manual_dy' | 'manual_lpa' | 'manual_vpa' | 'manual_price';

interface InputControlProps {
  label: string;
  value: number;
  field: EditFormField;
  step: number;
  precision: number;
  color?: string;
  onAdjust: (field: EditFormField, delta: number, precision: number) => void;
  onChange: (field: EditFormField, value: number) => void;
}

const InputControl = ({ label, value, field, step, precision, color = "blue", onAdjust, onChange }: InputControlProps) => (
  <div className="space-y-1.5">
    <label className="text-[10px] uppercase font-bold text-slate-500 tracking-widest ml-1">{label}</label>
    <div className={`flex items-center bg-slate-950 border border-slate-800 rounded-lg overflow-hidden focus-within:ring-1 focus-within:ring-${color}-500/50 transition-all shadow-inner`}>
      <button
        type="button"
        onClick={() => onAdjust(field, -step, precision)}
        className={`p-2.5 text-${color}-500 hover:bg-${color}-500/10 transition-colors`}
      >
        <Minus size={14} />
      </button>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(field, Number(e.target.value))}
        className="w-full bg-transparent p-2 text-white outline-none font-mono text-center text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />
      <button
        type="button"
        onClick={() => onAdjust(field, step, precision)}
        className={`p-2.5 text-${color}-500 hover:bg-${color}-500/10 transition-colors`}
      >
        <Plus size={14} />
      </button>
    </div>
  </div>
);

export const EditModal = ({ isOpen, onClose, onSave, ativo, allAssets = [] }: EditModalProps) => {
  const [formData, setFormData] = useState({
    quantity: 0,
    average_price: 0,
    target_percent: 0,
    manual_dy: 0,
    manual_lpa: 0,
    manual_vpa: 0,
    manual_price: 0
  });

  const [loading, setLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Lógica de mercado
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

  useEffect(() => {
    if (ativo && isOpen) {
      setFormData({
        quantity: ativo.qtd || 0,
        average_price: ativo.pm || 0,
        target_percent: ativo.meta || 0,
        manual_dy: Number(((ativo.manual_dy || 0) * 100).toFixed(2)),
        manual_lpa: ativo.manual_lpa || 0,
        manual_vpa: ativo.manual_vpa || 0,
        manual_price: Number(ativo.preco_atual) || 0
      });
      setShowDeleteConfirm(false);
    }
  }, [ativo, isOpen]);

  // Funções de manipulação de estado passadas para o InputControl
  const handleAdjustValue = (field: keyof typeof formData, delta: number, precision = 2) => {
    setFormData(prev => {
      const newVal = Number((prev[field] + delta).toFixed(precision));
      return { ...prev, [field]: Math.max(0, newVal) };
    });
  };

  const handleInputChange = (field: EditFormField, value: number) => {
    const sanitizedValue = Math.max(0, isNaN(value) ? 0 : value);
    setFormData(prev => ({ ...prev, [field]: sanitizedValue }));
  };

  const maxLimit = (() => {
    if (!ativo) return 100;
    const totalOcupado = allAssets
      .filter((a) => a.tipo === ativo.tipo && a.ticker !== ativo.ticker)
      .reduce((acc, a) => acc + (a.meta || 0), 0);
    return Math.max(0, 100 - totalOcupado);
  })();

  const handleSave = async () => {
    if (!ativo) return;
    setLoading(true);
    try {
      const payload = {
        ticker: ativo.ticker,
        qtd: Number(formData.quantity),
        pm: Number(formData.average_price),
        meta: Number(formData.target_percent),
        dy: Number(formData.manual_dy) / 100,
        lpa: Number(formData.manual_lpa),
        vpa: Number(formData.manual_vpa),
        current_price: Number(formData.manual_price)
      };

      await apiCall('/api/update_asset', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

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

  if (!isOpen || !ativo) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-300">
      <div className="bg-[#0f172a] w-full max-w-md rounded-2xl border border-slate-800 shadow-2xl overflow-hidden animate-in zoom-in-95">
        <div className="bg-slate-900/50 p-5 border-b border-slate-800 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-600/10 flex items-center justify-center text-blue-400 font-bold border border-blue-500/20 text-lg shadow-inner">
              {ativo.ticker.substring(0, 2)}
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight uppercase">Configurar {ativo.ticker}</h2>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest leading-none">{ativo.tipo}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white p-2 hover:bg-slate-800 rounded-full transition-all">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {shouldShowManualPrice() && (
            <div className="bg-emerald-500/5 border border-emerald-500/20 p-4 rounded-xl space-y-3">
              <div className="flex items-center gap-2 text-emerald-400">
                <DollarSign size={16} />
                <span className="text-[10px] font-bold uppercase tracking-widest leading-none">Preço Manual</span>
              </div>
              <InputControl label="Preço Atual / Saldo" value={formData.manual_price} field="manual_price" step={10} precision={2} color="emerald" onAdjust={handleAdjustValue} onChange={handleInputChange} />
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <InputControl label="Quantidade" value={formData.quantity} field="quantity" step={1} precision={4} color="blue" onAdjust={handleAdjustValue} onChange={handleInputChange} />
            <InputControl label="Preço Médio" value={formData.average_price} field="average_price" step={0.5} precision={2} color="blue" onAdjust={handleAdjustValue} onChange={handleInputChange} />
          </div>

          <div className="space-y-3">
            <label className="text-[10px] uppercase font-bold text-slate-500 tracking-widest flex justify-between items-center ml-1">
              <span>Meta na Carteira</span>
              <div className="text-right flex flex-col items-end">
                <span className="text-blue-400 font-mono text-sm leading-none">{formData.target_percent}%</span>
                <span className="text-[9px] text-slate-600 font-normal tracking-normal mt-1">limite: {maxLimit.toFixed(1)}%</span>
              </div>
            </label>
            <input
              type="range" min="0" max={maxLimit} step="0.5"
              value={formData.target_percent > maxLimit ? maxLimit : formData.target_percent}
              onChange={(e) => handleInputChange('target_percent', Number(e.target.value))}
              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
            />
          </div>

          {!shouldShowManualPrice() && (
            <div className="pt-5 border-t border-slate-800/50 space-y-4">
              <div className="flex items-center gap-2 ml-1">
                <Calculator size={14} className="text-purple-400" />
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Inteligência</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <InputControl label="DY Anual %" value={formData.manual_dy} field="manual_dy" step={0.1} precision={2} color="purple" onAdjust={handleAdjustValue} onChange={handleInputChange} />
                {ativo.tipo === 'FII' && (
                  <InputControl label="VP / Cota" value={formData.manual_vpa} field="manual_vpa" step={0.5} precision={2} color="purple" onAdjust={handleAdjustValue} onChange={handleInputChange} />
                )}
                {ativo.tipo === 'Ação' && (
                  <>
                    <InputControl label="LPA (Lucro)" value={formData.manual_lpa} field="manual_lpa" step={0.5} precision={2} color="purple" onAdjust={handleAdjustValue} onChange={handleInputChange} />
                    <div className="col-span-2">
                      <InputControl label="VPA (Patrimonial)" value={formData.manual_vpa} field="manual_vpa" step={0.5} precision={2} color="purple" onAdjust={handleAdjustValue} onChange={handleInputChange} />
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="bg-slate-900/80 p-5 border-t border-slate-800 flex justify-between items-center">
          {showDeleteConfirm ? (
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-rose-500 uppercase tracking-widest animate-pulse">Confirmar?</span>
              <button
                type="button"
                onClick={handleDelete}
                disabled={loading}
                className="bg-rose-600 hover:bg-rose-500 text-white px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all"
              >
                Sim
              </button>
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all"
              >
                Não
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={loading}
              className="text-rose-500 hover:text-rose-400 p-2.5 hover:bg-rose-500/10 rounded-xl transition-all flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest disabled:opacity-50"
            >
              <Trash2 size={16} />
              <span>Excluir</span>
            </button>
          )}
          <div className="flex gap-4">
            <button type="button" onClick={onClose} className="px-5 py-2.5 text-[10px] font-bold text-slate-500 hover:text-white uppercase tracking-widest">Cancelar</button>
            <button type="button" onClick={handleSave} disabled={loading} className="px-6 py-2.5 text-[10px] font-bold bg-blue-600 hover:bg-blue-500 text-white rounded-xl flex items-center gap-2 shadow-lg shadow-blue-900/20 uppercase tracking-widest disabled:opacity-50">
              {loading ? 'Salvando...' : <><Save size={14} /> Atualizar</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
