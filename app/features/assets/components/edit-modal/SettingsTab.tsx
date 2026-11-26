'use client';

import { Save, Calculator, Trash2, DollarSign, Plus, Minus } from 'lucide-react';
import { Asset } from '@/types';
import { SettingsFormField } from './helpers';

interface InputControlProps {
  label: string;
  value: number;
  field: SettingsFormField;
  step: number;
  precision: number;
  color?: 'blue' | 'purple' | 'emerald';
  onAdjust: (field: SettingsFormField, delta: number, precision: number) => void;
  onChange: (field: SettingsFormField, value: number) => void;
}

const InputControl = ({ label, value, field, step, precision, color = 'blue', onAdjust, onChange }: InputControlProps) => {
  const colorClasses = {
    blue: { ring: 'focus-within:ring-accent/50', text: 'text-accent', hoverBg: 'hover:bg-accent/10' },
    purple: { ring: 'focus-within:ring-purple-500/50', text: 'text-purple-400', hoverBg: 'hover:bg-purple-500/10' },
    emerald: { ring: 'focus-within:ring-emerald-500/50', text: 'text-status-success', hoverBg: 'hover:bg-emerald-500/10' },
  };
  const style = colorClasses[color] || colorClasses.blue;

  return (
    <div className="space-y-1.5">
      <label className="text-[10px] uppercase font-bold text-text-muted tracking-widest ml-1">{label}</label>
      <div className={`flex items-center bg-surface-elevated border border-border-subtle rounded-lg overflow-hidden focus-within:ring-1 ${style.ring} transition-all shadow-sm`}>
        <button type="button" onClick={() => onAdjust(field, -step, precision)} className={`p-2.5 ${style.text} ${style.hoverBg} transition-colors`}>
          <Minus size={14} />
        </button>
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(field, Number(e.target.value))}
          className="w-full bg-transparent p-2 text-text-primary outline-none font-mono text-center text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
        <button type="button" onClick={() => onAdjust(field, step, precision)} className={`p-2.5 ${style.text} ${style.hoverBg} transition-colors`}>
          <Plus size={14} />
        </button>
      </div>
    </div>
  );
};

interface SettingsTabProps {
  ativo: Asset;
  isReserva: boolean;
  showManualPrice: boolean;
  maxLimit: number;
  loading: boolean;
  showDeleteConfirm: boolean;
  settingsData: Record<SettingsFormField, number>;
  onAdjustValue: (field: SettingsFormField, delta: number, precision?: number) => void;
  onInputChange: (field: SettingsFormField, value: number) => void;
  onSetShowDeleteConfirm: (show: boolean) => void;
  onDelete: () => void;
  onSaveSettings: () => void;
  onClose: () => void;
}

export function SettingsTab({
  ativo,
  isReserva,
  showManualPrice,
  maxLimit,
  loading,
  showDeleteConfirm,
  settingsData,
  onAdjustValue,
  onInputChange,
  onSetShowDeleteConfirm,
  onDelete,
  onSaveSettings,
  onClose,
}: SettingsTabProps) {
  return (
    <div className="space-y-6">
      {showManualPrice && !isReserva && (
        <div className="bg-emerald-500/5 border border-emerald-500/20 p-4 rounded-xl space-y-3">
          <div className="flex items-center gap-2 text-status-success">
            <DollarSign size={16} />
            <span className="text-[10px] font-bold uppercase tracking-widest leading-none">Preço Manual</span>
          </div>
          <InputControl
            label="Preço Atual / Saldo"
            value={settingsData.manual_price}
            field="manual_price"
            step={10}
            precision={2}
            color="emerald"
            onAdjust={onAdjustValue}
            onChange={onInputChange}
          />
        </div>
      )}

      <div className="space-y-3">
        <label className="text-[10px] uppercase font-bold text-text-muted tracking-widest flex justify-between items-center ml-1">
          <span>Meta na Carteira</span>
          <div className="text-right flex flex-col items-end">
            <span className="text-accent font-mono text-sm leading-none">{settingsData.target_percent}%</span>
            <span className="text-[9px] text-text-muted font-normal tracking-normal mt-1">limite: {maxLimit.toFixed(1)}%</span>
          </div>
        </label>
        <input
          type="range"
          min="0"
          max={maxLimit}
          step="0.5"
          value={settingsData.target_percent > maxLimit ? maxLimit : settingsData.target_percent}
          onChange={(e) => onInputChange('target_percent', Number(e.target.value))}
          className="w-full h-1.5 bg-surface-elevated rounded-lg appearance-none cursor-pointer accent-blue-500 focus:outline-none focus:ring-2 focus:ring-accent/20"
        />
      </div>

      {!showManualPrice && (
        <div className="pt-5 border-t border-border-subtle space-y-4">
          <div className="flex items-center gap-2 ml-1">
            <Calculator size={14} className="text-purple-400" />
            <span className="text-[10px] font-bold text-text-secondary uppercase tracking-widest">Inteligência</span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <InputControl
              label="DY Anual %"
              value={settingsData.manual_dy}
              field="manual_dy"
              step={0.1}
              precision={2}
              color="purple"
              onAdjust={onAdjustValue}
              onChange={onInputChange}
            />
            {ativo.tipo === 'FII' && (
              <InputControl
                label="VP / Cota"
                value={settingsData.manual_vpa}
                field="manual_vpa"
                step={0.5}
                precision={2}
                color="purple"
                onAdjust={onAdjustValue}
                onChange={onInputChange}
              />
            )}
            {ativo.tipo === 'Ação' && (
              <>
                <InputControl
                  label="LPA (Lucro)"
                  value={settingsData.manual_lpa}
                  field="manual_lpa"
                  step={0.5}
                  precision={2}
                  color="purple"
                  onAdjust={onAdjustValue}
                  onChange={onInputChange}
                />
                <div className="col-span-2">
                  <InputControl
                    label="VPA (Patrimonial)"
                    value={settingsData.manual_vpa}
                    field="manual_vpa"
                    step={0.5}
                    precision={2}
                    color="purple"
                    onAdjust={onAdjustValue}
                    onChange={onInputChange}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <div className="flex justify-between items-center w-full pt-5 border-t border-border-subtle mt-8">
        {showDeleteConfirm ? (
          <div className="flex items-center justify-between w-full">
            <span className="text-[10px] font-bold text-status-error uppercase tracking-widest animate-pulse">Tem certeza?</span>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => onSetShowDeleteConfirm(false)}
                className="px-4 py-2.5 rounded-lg text-[10px] font-bold text-text-secondary bg-surface-elevated hover:bg-surface-input uppercase tracking-widest transition-all"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={onDelete}
                disabled={loading}
                className="px-4 py-2.5 rounded-lg text-[10px] font-bold text-white bg-rose-600 hover:bg-rose-500 uppercase tracking-widest transition-all flex items-center gap-2"
              >
                <Trash2 size={14} /> Excluir
              </button>
            </div>
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={() => onSetShowDeleteConfirm(true)}
              disabled={loading}
              className="text-status-error hover:opacity-80 p-2 hover:bg-status-error/10 rounded-lg transition-all flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest disabled:opacity-50"
            >
              <Trash2 size={16} /> <span className="hidden sm:inline">Excluir</span>
            </button>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 text-[11px] font-bold text-text-muted hover:text-text-primary uppercase tracking-wider transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={onSaveSettings}
                disabled={loading}
                className="inline-flex justify-center items-center gap-2 rounded-lg bg-accent px-6 py-2.5 text-[11px] font-bold text-white hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-accent/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all uppercase tracking-wider"
              >
                {loading ? 'Salvando...' : <><Save size={14} /> Atualizar</>}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
