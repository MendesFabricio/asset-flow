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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <Card className="w-full max-w-sm !bg-slate-900 shadow-2xl p-6 space-y-6 border-slate-700">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-bold text-white leading-tight">Meta: {categoryName}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="p-1.5 text-slate-500 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>
        <div className="space-y-4">
          <div className="flex justify-between items-end px-1">
            <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">Ajustar Alocação</span>
            <span className="text-3xl font-bold text-blue-400 font-mono">{value}%</span>
          </div>
          <input
            type="range"
            min="0"
            max={maxValue}
            step="1"
            value={value}
            onChange={(e) => onChange(Number(e.target.value))}
            className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500 outline-none"
          />
        </div>
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-white transition-colors uppercase tracking-widest"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={loading}
            className="px-6 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white rounded-lg flex items-center gap-2 shadow-lg shadow-blue-900/20 uppercase tracking-widest"
          >
            {loading ? 'Salvando...' : <><Save size={14} /> Salvar Meta</>}
          </button>
        </div>
      </Card>
    </div>
  );
}
