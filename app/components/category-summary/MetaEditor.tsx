import { X, Save } from 'lucide-react';
import { Card } from '@/components/ui/Card';

interface MetaEditorProps {
  categoryName: string;
  value: number;
  maxValue: number;
  loading: boolean;
  onChange: (value: number) => void;
  onSave: () => void;
  onClose: () => void;
}

export function MetaEditor({
  categoryName,
  value,
  maxValue,
  loading,
  onChange,
  onSave,
  onClose,
}: MetaEditorProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-[120ms]">
      <Card className="w-full max-w-sm bg-surface-card shadow-lg p-6 space-y-6 border-border-subtle">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold text-text-primary leading-tight">Meta: {categoryName}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="p-1.5 text-text-muted hover:text-text-primary transition-colors"
          >
            <X size={20} />
          </button>
        </div>
        <div className="space-y-4">
          <div className="flex justify-between items-end px-1">
            <span className="text-xs text-text-muted font-semibold uppercase tracking-wider">Ajustar Alocação</span>
            <span className="text-2xl font-semibold text-accent font-mono tabular-nums">{value}%</span>
          </div>
          <input
            type="range"
            min="0"
            max={maxValue}
            step="1"
            value={value}
            onChange={(e) => onChange(Number(e.target.value))}
            className="w-full h-2 bg-surface-input rounded-lg appearance-none cursor-pointer accent-accent outline-none"
          />
        </div>
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-text-muted hover:text-text-primary transition-colors uppercase tracking-wider"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={loading}
            className="px-6 py-2 text-xs font-semibold bg-accent hover:bg-accent/90 text-white rounded-lg flex items-center gap-2 transition-colors uppercase tracking-wider"
          >
            {loading ? 'Salvando...' : <><Save size={14} /> Salvar Meta</>}
          </button>
        </div>
      </Card>
    </div>
  );
}
