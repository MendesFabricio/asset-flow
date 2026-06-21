'use client';
import { Fragment, useState } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { X, Plus, Search, AlertCircle } from 'lucide-react';
// Importação dos componentes do seu novo UI Kit
import { Card } from './ui/Card';
import { Badge } from './ui/Badge';
import { apiCall } from '../utils/apiClient';

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
    // Validação básica no Frontend antes de chamar a API
    if (!formData.ticker.trim()) {
      setError("O Ticker é obrigatório.");
      return;
    }
    if (formData.quantity <= 0 || formData.average_price <= 0) {
      setError("Quantidade e Preço Médio devem ser maiores que zero.");
      return;
    }

    setValidating(true);
    setError(null);

    try {
      // 1. Validação do Ticker no Yahoo Finance via Backend
      const valData = await apiCall('/api/validate_ticker', {
        method: 'POST',
        body: JSON.stringify({ ticker: formData.ticker.trim() })
      });

      if (!valData.valid) {
        setError(`Ticker "${formData.ticker}" não encontrado no Yahoo Finance.`);
        setValidating(false);
        return;
      }

      // 2. Se válido, envia para criação no Banco de Dados
      setLoading(true);
      const saveData = await apiCall('/api/add_asset', {
        method: 'POST',
        body: JSON.stringify({
          ticker: valData.ticker, // Usa o ticker formatado pelo backend
          category: formData.type,
          qtd: Number(formData.quantity),
          pm: Number(formData.average_price),
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

    } catch (err) {
      setError("Erro de conexão com o servidor.");
    } finally {
      setLoading(false);
      setValidating(false);
    }
  };

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-md">
                {/* Utilização do componente Card para padronização visual */}
                <Card className="p-6 !bg-slate-900 !border-slate-800 shadow-2xl">

                  <div className="flex justify-between items-center mb-6">
                    <Dialog.Title as="h3" className="text-lg font-bold text-white flex items-center gap-2">
                      <div className="p-1.5 bg-blue-600/20 rounded-lg border border-blue-500/30">
                        <Plus size={18} className="text-blue-500" />
                      </div>
                      Adicionar Ativo
                    </Dialog.Title>
                    <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
                      <X size={20} />
                    </button>
                  </div>

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

                </Card>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
};
