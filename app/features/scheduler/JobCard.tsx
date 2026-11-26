'use client';

import {
  Play,
  Pencil,
  Pause,
  CheckCircle2,
  AlertCircle,
  Clock,
  RefreshCw,
  CalendarClock,
} from 'lucide-react';
import {
  ScheduledJob,
  JOB_META,
  formatScheduleLabel,
  formatRelativeTime,
  formatDateTime,
} from './schedulerConfig';

interface JobCardProps {
  job: ScheduledJob;
  onRunNow: (job: ScheduledJob) => void;
  onEdit: (job: ScheduledJob) => void;
  onToggle: (job: ScheduledJob) => void;
}

export function JobCard({ job, onRunNow, onEdit, onToggle }: JobCardProps) {
  const meta = JOB_META[job.name];
  const status = job.last_run_status;
  const isRunning = status === 'running';
  const isError = status === 'error';
  const isSuccess = status === 'success';

  const accentBorder = !job.is_active
    ? 'border-l-border-subtle'
    : isError
      ? 'border-l-red-500'
      : isRunning
        ? 'border-l-amber-400'
        : isSuccess
          ? 'border-l-emerald-500'
          : 'border-l-blue-500';

  const statusBadge = isError
    ? 'bg-red-500/15 text-status-error border-red-500/30'
    : isRunning
      ? 'bg-amber-500/15 text-status-warning border-amber-500/30'
      : isSuccess
        ? 'bg-emerald-500/15 text-status-success border-emerald-500/30'
        : 'bg-surface-elevated text-text-muted border-border-subtle';

  const statusLabel = isError ? 'Erro' : isRunning ? 'Executando' : isSuccess ? 'Sucesso' : 'Idle';

  return (
    <div
      className={`rounded-2xl border border-border-subtle border-l-4 ${accentBorder} p-4 md:p-5 bg-surface-card transition-all ${
        job.is_active ? '' : 'opacity-70'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-bold text-text-primary">{meta?.title || job.name}</h3>
            {meta?.catLabel && (
              <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-surface border border-border-subtle text-text-muted">
                {meta.catLabel}
              </span>
            )}
            <span
              className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded border ${
                job.is_active
                  ? 'bg-emerald-500/10 text-status-success border-emerald-500/20'
                  : 'bg-surface-elevated text-text-muted border-border-subtle'
              }`}
            >
              {job.is_active ? 'Ativo' : 'Pausado'}
            </span>
            <span className={`inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded border ${statusBadge}`}>
              {isSuccess && <CheckCircle2 size={10} />}
              {isError && <AlertCircle size={10} />}
              {isRunning && <RefreshCw size={10} className="animate-spin" />}
              {statusLabel}
            </span>
          </div>

          <p className="text-[10px] font-mono text-text-muted mt-0.5">{job.name}</p>
          <p className="text-xs text-text-muted mt-2 leading-relaxed">{job.description}</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 mt-4 p-2.5 rounded-xl bg-surface border border-border-subtle text-[11px]">
        <div>
          <span className="text-[9px] uppercase font-bold text-text-muted flex items-center gap-1">
            <Clock size={10} /> Frequência
          </span>
          <span className="font-mono font-semibold text-text-primary block mt-0.5 truncate" title={job.cron_expression || ''}>
            {formatScheduleLabel(job)}
          </span>
        </div>
        <div>
          <span className="text-[9px] uppercase font-bold text-text-muted block">Última Execução</span>
          <span className="font-mono text-text-primary block mt-0.5">{formatDateTime(job.last_run_at)}</span>
          {job.last_run_at && (
            <span className="text-[9px] text-text-muted block">{formatRelativeTime(job.last_run_at)}</span>
          )}
        </div>
        <div>
          <span className="text-[9px] uppercase font-bold text-text-muted flex items-center gap-1">
            <CalendarClock size={10} /> Próxima
          </span>
          <span className="font-mono text-text-primary block mt-0.5">
            {job.is_active ? formatDateTime(job.next_run_at) : 'Pausado'}
          </span>
          {job.is_active && job.next_run_at && (
            <span className="text-[9px] text-accent block">{formatRelativeTime(job.next_run_at, true)}</span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 mt-3 pt-3 border-t border-border-subtle">
        <span
          className={`text-[11px] truncate max-w-[260px] ${
            isError ? 'text-status-error font-medium' : 'text-text-muted'
          }`}
          title={job.last_run_message || ''}
        >
          {job.last_run_message || 'Sem mensagens'}
        </span>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onRunNow(job)}
            disabled={!job.is_active || isRunning}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-accent-soft text-accent border border-accent/25 text-[11px] font-bold hover:bg-accent/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Play size={11} /> Executar
          </button>
          <button
            type="button"
            onClick={() => onEdit(job)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-surface-elevated border border-border-subtle text-text-primary text-[11px] font-bold hover:border-accent/50 transition-colors"
          >
            <Pencil size={11} /> Editar
          </button>
          <button
            type="button"
            onClick={() => onToggle(job)}
            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition-colors ${
              job.is_active
                ? 'bg-red-500/10 text-status-error border-red-500/20 hover:bg-red-500/20'
                : 'bg-emerald-500/10 text-status-success border-emerald-500/20 hover:bg-emerald-500/20'
            }`}
          >
            {job.is_active ? <Pause size={11} /> : <Play size={11} />}
            {job.is_active ? 'Pausar' : 'Ativar'}
          </button>
        </div>
      </div>
    </div>
  );
}
