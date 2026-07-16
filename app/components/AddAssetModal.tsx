'use client';
import { Fragment, useState } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { X, Plus, Search, AlertCircle } from 'lucide-react';
import { apiCall } from '../utils/apiClient';
// Importação dos componentes do seu novo UI Kit
import { Card } from './ui/Card';
import { Badge } from './ui/Badge';
import { ModalShell } from './ModalShell';

interface AddAssetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const AddAssetModal = ({ isOpen, onClose, onSuccess }: AddAssetModalProps) => {
  const initialState = {
    ticker: '',
    type: 'Ação',
    quantity: 0,
    average_price: 0,
    target_percent: 0
  };

  const [formData, setFormData] = useState(initialState);
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setError(null); // Limpa o estado de erro ao interagir com o formulário
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSave = async () => {
    // 1. Sanitização estrita do Ticker (remove espaços e força caixa alta)
    const sanitizedTicker = formData.ticker.trim().toUpperCase();

    if (!sanitizedTicker) {
      setError("O Ticker é obrigatório.");
      return;
    }

    // 2. Conversão e validação numérica rigorosa contra valores zerados, negativos ou NaN
    const parsedQuantity = Number(formData.quantity);
    const parsedAveragePrice = Number(formData.average_price);

    if (isNaN(parsedQuantity) || parsedQuantity <= 0 || isNaN(parsedAveragePrice) || parsedAveragePrice <= 0) {
      setError("Quantidade e Preço Médio devem ser maiores que zero.");
      return;
    }

    setValidating(true);
    setError(null);

    try {
      // 3. Validação do Ticker higienizado no Yahoo Finance via Backend
      const valData = await apiCall<{ valid: boolean; ticker: string }>('/api/validate_ticker', {
        method: 'POST',
        body: JSON.stringify({ ticker: sanitizedTicker })
      });

      if (!valData.valid) {
        setError(`Ticker "${sanitizedTicker}" não encontrado no Yahoo Finance.`);
        setValidating(false);
        return;
      }

      // 4. Envia os dados limpos e tipados para o Banco de Dados
      setLoading(true);
      const saveData = await apiCall<{ status: string; msg?: string }>('/api/add_asset', {
        method: 'POST',
        body: JSON.stringify({
          ticker: valData.ticker.trim().toUpperCase(), // Garante formatação vinda do backend
          category: formData.type,
          qtd: parsedQuantity,
          pm: parsedAveragePrice,
          meta: Number(formData.target_percent)
        }),
      });

      if (saveData.status === 'Sucesso') {
        setFormData(initialState);
        onSuccess();
        onClose();
      } else {
        setError(saveData.msg || "Erro ao salvar o ativo.");
      }

    } catch (err: any) {
      setError(err.message || "Erro de conexão com o servidor.");
    } finally {
      setLoading(false);
      setValidating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <ModalShell
      onClose={onClose}
      title="Adicionar Ativo"
      icon={<Plus size={18} />}
      maxWidth="md"
    >
      {/* Feedback de Erro Estilizado */}
      {error && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-2 text-red-400 text-xs font-medium animate-in fade-in zoom-in-95">
          <AlertCircle size={14} />
          {error}
        </div>
      )}

      <div className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Ticker</label>
          <div className="relative">
            <input
              name="ticker"
              autoComplete="off"
              type="text"
              placeholder="Ex: PETR4, AAPL, HGLG11..."
              value={formData.ticker}
              onChange={(e) => setFormData({ ...formData, ticker: e.target.value.toUpperCase() })}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white placeholder:text-slate-600 focus:ring-2 focus:ring-blue-500 outline-none font-mono uppercase transition-colors autofill:shadow-[0_0_0_30px_#020617_inset] autofill:text-fill-white"
            />
            <Search size={16} className="absolute right-3 top-3 text-slate-600" />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Tipo</label>
          <select
            name="type"
            value={formData.type}
            onChange={handleChange}
            className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white focus:ring-2 focus:ring-blue-500 outline-none appearance-none cursor-pointer"
          >
            <option value="Ação">Ação</option>
            <option value="FII">Fundo Imobiliário (FII)</option>
            <option value="Internacional">Internacional</option>
            <option value="Cripto">Criptomoeda</option>
            <option value="Renda Fixa">Renda Fixa</option>
            <option value="Reserva">Reserva Financeira</option>
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Quantidade</label>
            <input name="quantity" type="number" step="0.000001" value={formData.quantity} onChange={handleChange} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white font-mono focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Preço Médio (R$)</label>
            <input name="average_price" type="number" step="0.01" value={formData.average_price} onChange={handleChange} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white font-mono focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex justify-between">
            <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Meta Inicial (%)</label>
            <Badge label={`${formData.target_percent}%`} variant="blue" />
          </div>
          <input
            name="target_percent" type="range" min="0" max="100" step="1"
            value={formData.target_percent}
            onChange={(e) => setFormData({ ...formData, target_percent: Number(e.target.value) })}
            className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
          />
        </div>
      </div>

      <div className="mt-8 flex justify-end gap-3">
        <button onClick={onClose} className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-white rounded-lg transition-colors">
          Cancelar
        </button>
        <button
          onClick={handleSave}
          disabled={loading || validating || !formData.ticker}
          className="inline-flex justify-center items-center gap-2 rounded-lg bg-blue-600 px-6 py-2 text-xs font-bold text-white hover:bg-blue-500 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-blue-900/20"
        >
          {validating ? (
            <>
              <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              Verificando...
            </>
          ) : loading ? (
            'Salvando...'
          ) : (
            'Adicionar Ativo'
          )}
        </button>
      </div>
    </ModalShell>
  );
};
