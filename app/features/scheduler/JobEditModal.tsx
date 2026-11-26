'use client';

import { ScheduledJob, JOB_META, CRON_PRESETS, INTERVAL_PRESETS } from './schedulerConfig';

interface JobEditModalProps {
  job: ScheduledJob;
  jobType: 'cron' | 'interval';
  cronExpression: string;
  intervalMinutes: string;
  error: string;
  saving: boolean;
  onChangeJobType: (type: 'cron' | 'interval') => void;
  onChangeCron: (value: string) => void;
  onChangeInterval: (value: string) => void;
  onToggleActive: (active: boolean) => void;
  onSave: () => void;
  onClose: () => void;
}

export function JobEditModal({
  job,
  jobType,
  cronExpression,
  intervalMinutes,
  error,
  saving,
  onChangeJobType,
  onChangeCron,
  onChangeInterval,
  onToggleActive,
  onSave,
  onClose,
}: JobEditModalProps) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-surface-card border border-border-subtle rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl">
        <div>
          <h2 className="text-lg font-bold text-text-primary">Editar Agendamento</h2>
          <p className="text-xs font-semibold text-accent mt-0.5">
            {JOB_META[job.name]?.title || job.name}
          </p>
          <p className="text-[11px] font-mono text-text-muted">{job.name}</p>
        </div>

        <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-surface border border-border-subtle">
          <button
            type="button"
            onClick={() => onChangeJobType('interval')}
            className={`py-1.5 rounded-lg text-xs font-bold transition-colors ${
              jobType === 'interval' ? 'bg-accent text-white' : 'text-text-muted hover:text-text-primary'
            }`}
          >
            Intervalo (min)
          </button>
          <button
            type="button"
            onClick={() => onChangeJobType('cron')}
            className={`py-1.5 rounded-lg text-xs font-bold transition-colors ${
              jobType === 'cron' ? 'bg-accent text-white' : 'text-text-muted hover:text-text-primary'
            }`}
          >
            Cron (Horário)
          </button>
        </div>

        {jobType === 'cron' ? (
          <div className="space-y-2">
            <label className="block text-[11px] font-bold text-text-muted uppercase tracking-wider">
              Expressão Cron (5 campos)
            </label>
            <input
              type="text"
              value={cronExpression}
              onChange={(e) => onChangeCron(e.target.value)}
              placeholder="0 8 * * *"
              className="w-full px-3 py-2 rounded-xl bg-surface-input border border-border-subtle text-text-primary font-mono text-sm focus:outline-none focus:border-accent"
            />
            <div className="flex flex-wrap gap-1.5 pt-1">
              {CRON_PRESETS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => onChangeCron(p.value)}
                  className="px-2 py-1 rounded-lg text-[10px] font-bold bg-surface border border-border-subtle text-text-muted hover:text-text-primary hover:border-accent/50"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <label className="block text-[11px] font-bold text-text-muted uppercase tracking-wider">
              Intervalo (minutos)
            </label>
            <input
              type="number"
              value={intervalMinutes}
              onChange={(e) => onChangeInterval(e.target.value)}
              min="1"
              className="w-full px-3 py-2 rounded-xl bg-surface-input border border-border-subtle text-text-primary font-mono text-sm focus:outline-none focus:border-accent"
            />
            <div className="flex flex-wrap gap-1.5 pt-1">
              {INTERVAL_PRESETS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => onChangeInterval(String(p.value))}
                  className="px-2 py-1 rounded-lg text-[10px] font-bold bg-surface border border-border-subtle text-text-muted hover:text-text-primary hover:border-accent/50"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <label className="flex items-center gap-2 cursor-pointer pt-1">
          <input
            type="checkbox"
            checked={job.is_active}
            onChange={(e) => onToggleActive(e.target.checked)}
            className="w-4 h-4 rounded border-border-subtle bg-surface-input text-accent"
          />
          <span className="text-xs font-semibold text-text-primary">Job ativo no agendador</span>
        </label>

        {error && (
          <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-status-error">
            {error}
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="flex-1 px-4 py-2 rounded-xl bg-accent text-white text-xs font-bold hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-surface-elevated border border-border-subtle text-text-primary text-xs font-bold hover:bg-surface transition-colors"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
