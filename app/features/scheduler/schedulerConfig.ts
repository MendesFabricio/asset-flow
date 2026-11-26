export interface ScheduledJob {
  id: number;
  name: string;
  description: string;
  job_type: 'cron' | 'interval' | string;
  cron_expression: string | null;
  interval_minutes: number | null;
  is_active: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
  last_run_status: string | null;
  last_run_message: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface WorkerHealth {
  online: boolean;
  last_heartbeat: string | null;
  age_seconds: number | null;
}

export type JobCategory = 'all' | 'mercado' | 'proventos' | 'sinais' | 'sistema';

export const JOB_META: Record<string, { title: string; category: Exclude<JobCategory, 'all'>; catLabel: string }> = {
  scheduled_update_indices: { title: 'Índices & Alertas de Preço', category: 'mercado', catLabel: 'Mercado' },
  scheduled_update_prices: { title: 'Cotações da Carteira', category: 'mercado', catLabel: 'Mercado' },
  scheduled_price_history_sync: { title: 'Histórico Ajustado Total-Return', category: 'mercado', catLabel: 'Mercado' },
  scheduled_dividends_check: { title: 'Proventos & Data-Com', category: 'proventos', catLabel: 'Proventos' },
  scheduled_fundamentals_and_reports: { title: 'Relatórios CVM/FNet & Fundamentos', category: 'proventos', catLabel: 'Fundamentos' },
  scheduled_radar_refresh: { title: 'Radar B3 (Valuation & Sinais)', category: 'sinais', catLabel: 'Valuation' },
  scheduled_signal_ledger_capture: { title: 'Registro de Sinais v2 (Ledger)', category: 'sinais', catLabel: 'Sinais v2' },
  scheduled_signal_outcome_audit: { title: 'Auditoria Real & Brier Score', category: 'sinais', catLabel: 'Sinais v2' },
  scheduled_walk_forward_recalibration: { title: 'Recalibração Walk-Forward & Regime', category: 'sinais', catLabel: 'Sinais v2' },
  scheduled_quant_warm: { title: 'Cache Quantitativo (Risco / Monte Carlo)', category: 'sistema', catLabel: 'Sistema' },
  scheduled_daily_snapshot: { title: 'Snapshots & Evolução Mensal', category: 'sistema', catLabel: 'Sistema' },
  scheduled_database_backup: { title: 'Backup SQLite & Limpeza de Cache', category: 'sistema', catLabel: 'Backup' },
};

export const CATEGORY_FILTERS: { id: JobCategory; label: string }[] = [
  { id: 'all', label: 'Todos' },
  { id: 'mercado', label: 'Mercado & Preços' },
  { id: 'proventos', label: 'Proventos & Fundamentos' },
  { id: 'sinais', label: 'Sinais & Valuation' },
  { id: 'sistema', label: 'Sistema & Backup' },
];

export const CRON_PRESETS = [
  { label: '07:00 diário', value: '0 7 * * *' },
  { label: '08:00 diário', value: '0 8 * * *' },
  { label: '08:00 e 19:00', value: '0 8,19 * * *' },
  { label: '23:30 diário', value: '30 23 * * *' },
];

export const INTERVAL_PRESETS = [
  { label: '5 min', value: 5 },
  { label: '15 min', value: 15 },
  { label: '1 hora', value: 60 },
  { label: '6 horas', value: 360 },
  { label: '12 horas', value: 720 },
];

export function formatScheduleLabel(job: ScheduledJob): string {
  if (job.job_type === 'cron') {
    const expr = (job.cron_expression || '').trim();
    if (!expr) return 'Cron N/A';
    const parts = expr.split(/\s+/);
    if (parts.length === 5 && parts[2] === '*' && parts[3] === '*' && parts[4] === '*') {
      const min = parts[0].padStart(2, '0');
      const hrs = parts[1].split(',').map((h) => `${h.padStart(2, '0')}:${min}`).join(' e ');
      return `Diário às ${hrs}`;
    }
    return `Cron (${expr})`;
  }
  const mins = job.interval_minutes || 0;
  if (mins >= 60 && mins % 60 === 0) {
    const hrs = mins / 60;
    return `A cada ${hrs}h (${mins} min)`;
  }
  return `A cada ${mins} min`;
}

export function formatRelativeTime(isoStr: string | null, future = false): string {
  if (!isoStr) return '';
  const diffSec = Math.round((new Date(isoStr).getTime() - Date.now()) / 1000);
  const abs = Math.abs(diffSec);
  if (abs < 60) return future ? 'em < 1 min' : 'agora';
  const mins = Math.round(abs / 60);
  if (mins < 60) return future ? `em ${mins} min` : `há ${mins} min`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return future ? `em ${hrs}h` : `há ${hrs}h`;
  const days = Math.round(hrs / 24);
  return future ? `em ${days}d` : `há ${days}d`;
}

export function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return 'Nunca';
  return new Date(dateStr).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
