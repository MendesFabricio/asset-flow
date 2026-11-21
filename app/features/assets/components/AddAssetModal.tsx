'use client';
import { Fragment, useState, useEffect } from 'react';
import { Plus, Search, AlertCircle } from 'lucide-react';
import { apiCall } from '@/lib/api';
// Importação dos componentes do seu novo UI Kit
import { Badge } from '@/components/ui/Badge';
import { ModalShell } from '@/components/ModalShell';

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
  
  const [cachedTickers, setCachedTickers] = useState<Array<{ ticker: string; type: string; name?: string }>>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  useEffect(() => {
    if (isOpen) {
      apiCall<Array<{ ticker: string; type: string; name?: string }>>('/api/tickers').then(data => {
        if (Array.isArray(data)) setCachedTickers(data);
      }).catch(console.error);
    }
  }, [isOpen]);

  const filteredTickers = cachedTickers.filter(t => 
    t.ticker.toLowerCase().includes(formData.ticker.toLowerCase()) || 
    (t.name || '').toLowerCase().includes(formData.ticker.toLowerCase())
  ).slice(0, 5);

  const handleSelectTicker = async (tickerObj: { ticker: string; type: string; name?: string }) => {
    setFormData(prev => ({ ...prev, ticker: tickerObj.ticker, type: tickerObj.type }));
    setShowSuggestions(false);
    setValidating(true);
    try {
      const valData = await apiCall<{ valid: boolean; ticker: string; price?: number }>('/api/validate_ticker', {
        method: 'POST',
        body: JSON.stringify({ ticker: tickerObj.ticker })
      });
      if (valData.valid && valData.price) {
        const roundedPrice = Number(Number(valData.price).toFixed(2));
        setFormData(prev => ({ ...prev, average_price: roundedPrice }));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setValidating(false);
    }
  };

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

    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro de conexão com o servidor.");
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
        <div className="mb-4 p-3 bg-status-error/10 border border-status-error/20 rounded-lg flex items-center gap-2 text-status-error text-xs font-medium">
          <AlertCircle size={14} />
          {error}
        </div>
      )}

      <div className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-2xs uppercase font-semibold text-text-muted tracking-wider">Ticker</label>
          <div className="relative">
            <input
              name="ticker"
              autoComplete="off"
              type="text"
              placeholder="Ex: PETR4, AAPL, HGLG11..."
              value={formData.ticker}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
              onChange={(e) => {
                setFormData({ ...formData, ticker: e.target.value.toUpperCase() });
                setShowSuggestions(true);
              }}
              className="w-full bg-surface-input border border-border-subtle rounded-lg p-3 text-text-primary placeholder:text-text-muted focus:border-accent outline-none font-mono uppercase transition-colors"
            />
            <Search size={16} className="absolute right-3 top-3.5 text-text-muted" />
            
            {showSuggestions && formData.ticker && filteredTickers.length > 0 && (
              <div className="absolute z-20 w-full mt-2 bg-surface-card border border-border-subtle rounded-xl shadow-lg max-h-48 overflow-y-auto divide-y divide-border-subtle">
                {filteredTickers.map((t) => (
                  <div
                    key={t.ticker}
                    onClick={() => handleSelectTicker(t)}
                    className="flex justify-between items-center p-3 hover:bg-surface-elevated cursor-pointer transition-colors"
                  >
                    <div>
                      <div className="font-mono text-sm text-text-primary font-semibold">{t.ticker}</div>
                      <div className="text-xs text-text-muted mt-0.5">{t.name}</div>
                    </div>
                    <Badge label={t.type} variant="blue" />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-2xs uppercase font-semibold text-text-muted tracking-wider">Tipo</label>
          <select
            name="type"
            value={formData.type}
            onChange={handleChange}
            className="w-full bg-surface-input border border-border-subtle rounded-lg p-3 text-text-primary focus:border-accent outline-none appearance-none cursor-pointer transition-colors"
          >
            <option value="Ação" className="bg-surface-card text-text-primary">Ação</option>
            <option value="FII" className="bg-surface-card text-text-primary">Fundo Imobiliário (FII)</option>
            <option value="Internacional" className="bg-surface-card text-text-primary">Internacional</option>
            <option value="Cripto" className="bg-surface-card text-text-primary">Criptomoeda</option>
            <option value="Renda Fixa" className="bg-surface-card text-text-primary">Renda Fixa</option>
            <option value="Reserva" className="bg-surface-card text-text-primary">Reserva Financeira</option>
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-2xs uppercase font-semibold text-text-muted tracking-wider">Quantidade</label>
            <input name="quantity" type="number" step="0.000001" value={formData.quantity} onChange={handleChange} className="w-full bg-surface-input border border-border-subtle rounded-lg p-3 text-text-primary font-mono tabular-nums focus:border-accent outline-none transition-colors" />
          </div>
          <div className="space-y-1.5">
            <label className="text-2xs uppercase font-semibold text-text-muted tracking-wider">Preço Médio / Atual</label>
            <input name="average_price" type="number" step="0.01" value={formData.average_price} onChange={handleChange} className="w-full bg-surface-input border border-border-subtle rounded-lg p-3 text-text-primary font-mono tabular-nums focus:border-accent outline-none transition-colors" />
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex justify-between">
            <label className="text-2xs uppercase font-semibold text-text-muted tracking-wider">Meta Inicial (%)</label>
            <Badge label={`${formData.target_percent}%`} variant="blue" />
          </div>
          <input
            name="target_percent" type="range" min="0" max="100" step="1"
            value={formData.target_percent}
            onChange={(e) => setFormData({ ...formData, target_percent: Number(e.target.value) })}
            className="w-full h-1.5 bg-surface-input rounded-lg appearance-none cursor-pointer accent-accent focus:outline-none"
          />
        </div>
      </div>

      <div className="mt-8 flex justify-end gap-3 border-t border-border-subtle pt-5">
        <button onClick={onClose} className="px-5 py-2.5 text-2xs font-semibold uppercase tracking-wider text-text-muted hover:text-text-primary rounded-lg transition-colors">
          Cancelar
        </button>
        <button
          onClick={handleSave}
          disabled={loading || validating || !formData.ticker}
          className="inline-flex justify-center items-center gap-2 rounded-lg bg-accent px-6 py-2.5 text-2xs font-semibold uppercase tracking-wider text-white hover:bg-accent/90 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
