'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Play,
  Pencil,
  Pause,
  CheckCircle2,
  AlertCircle,
  Clock,
  RefreshCw,
  Server,
  CalendarClock,
  Search,
} from 'lucide-react';
import { apiCall } from '../lib/api';
import { useToast } from '../context/ToastContext';
import { SubPageHeader } from '../components/ui/SubPageHeader';

interface ScheduledJob {
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

interface WorkerHealth {
  online: boolean;
  last_heartbeat: string | null;
  age_seconds: number | null;
}

type JobCategory = 'all' | 'mercado' | 'proventos' | 'ia' | 'sistema';

const JOB_META: Record<string, { title: string; category: Exclude<JobCategory, 'all'>; catLabel: string }> = {
  scheduled_update_indices: { title: 'Índices & Alertas de Preço', category: 'mercado', catLabel: 'Mercado' },
  scheduled_update_prices: { title: 'Cotações da Carteira', category: 'mercado', catLabel: 'Mercado' },
  scheduled_dividends_check: { title: 'Proventos & Data-Com', category: 'proventos', catLabel: 'Proventos' },
  scheduled_fundamentals_and_reports: { title: 'Relatórios CVM/FNet & Fundamentos', category: 'proventos', catLabel: 'Fundamentos' },
  scheduled_radar_refresh: { title: 'Radar B3 (Valuation & Sinais)', category: 'ia', catLabel: 'Valuation' },
  scheduled_daily_sentiment_analysis: { title: 'Sentimento IA dos Ativos', category: 'ia', catLabel: 'IA' },
  scheduled_morning_brief_generation: { title: 'Morning Briefing IA', category: 'ia', catLabel: 'IA' },
  scheduled_news_summary_warm: { title: 'Resumo Diário de Notícias IA', category: 'ia', catLabel: 'IA' },
  scheduled_quant_warm: { title: 'Cache Quantitativo (Risco / Monte Carlo)', category: 'sistema', catLabel: 'Sistema' },
  scheduled_daily_snapshot: { title: 'Snapshots & Evolução Mensal', category: 'sistema', catLabel: 'Sistema' },
  scheduled_database_backup: { title: 'Backup SQLite & Limpeza de Cache', category: 'sistema', catLabel: 'Backup' },
};

const CATEGORY_FILTERS: { id: JobCategory; label: string }[] = [
  { id: 'all', label: 'Todos' },
  { id: 'mercado', label: 'Mercado & Preços' },
  { id: 'proventos', label: 'Proventos & Fundamentos' },
  { id: 'ia', label: 'IA & Valuation' },
  { id: 'sistema', label: 'Sistema & Backup' },
];

const CRON_PRESETS = [
  { label: '07:00 diário', value: '0 7 * * *' },
  { label: '08:00 diário', value: '0 8 * * *' },
  { label: '08:00 e 19:00', value: '0 8,19 * * *' },
  { label: '23:30 diário', value: '30 23 * * *' },
];

const INTERVAL_PRESETS = [
  { label: '5 min', value: 5 },
  { label: '15 min', value: 15 },
  { label: '1 hora', value: 60 },
  { label: '6 horas', value: 360 },
  { label: '12 horas', value: 720 },
];

function formatScheduleLabel(job: ScheduledJob): string {
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

function formatRelativeTime(isoStr: string | null, future = false): string {
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

export default function AvancadoPage() {
  const { notify } = useToast();
  const [jobs, setJobs] = useState<ScheduledJob[]>([]);
  const [worker, setWorker] = useState<WorkerHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [categoryFilter, setCategoryFilter] = useState<JobCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [editingJob, setEditingJob] = useState<ScheduledJob | null>(null);
  const [editJobType, setEditJobType] = useState<'cron' | 'interval'>('interval');
  const [cronExpression, setCronExpression] = useState('');
  const [intervalMinutes, setIntervalMinutes] = useState('');
  const [editError, setEditError] = useState('');
  const [saving, setSaving] = useState(false);

  const loadJobs = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      const data = await apiCall<{ status: string; data: ScheduledJob[]; worker?: WorkerHealth }>('/api/scheduler/jobs');
      if (data.status === 'Sucesso') {
        setJobs(data.data || []);
        if (data.worker) setWorker(data.worker);
      }
    } catch (e) {
      console.error('Erro ao carregar jobs:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const hasRunningJob = useMemo(() => jobs.some((j) => j.last_run_status === 'running'), [jobs]);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  useEffect(() => {
    const ms = hasRunningJob ? 3000 : 30000;
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      loadJobs();
    }, ms);
    return () => clearInterval(interval);
  }, [hasRunningJob, loadJobs]);

  const handleToggle = async (job: ScheduledJob) => {
    try {
      const res = await apiCall<{ status: string; msg?: string }>(`/api/scheduler/jobs/${job.id}/toggle`, {
        method: 'POST',
      });
      if (res.status === 'Sucesso') {
        notify(res.msg || 'Status atualizado.', 'success');
        await loadJobs();
      }
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Erro ao alterar status do job.', 'error');
    }
  };

  const handleRunNow = async (job: ScheduledJob) => {
    try {
      const res = await apiCall<{ status: string; msg?: string }>(`/api/scheduler/jobs/${job.id}/run`, {
        method: 'POST',
      });
      if (res.status === 'Sucesso') {
        notify(`Execução solicitada para ${JOB_META[job.name]?.title || job.name}.`, 'info');
        await loadJobs();
      }
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Erro ao iniciar execução.', 'error');
    }
  };

  const handleEdit = (job: ScheduledJob) => {
    setEditingJob(job);
    setEditJobType(job.job_type === 'cron' ? 'cron' : 'interval');
    setCronExpression(job.cron_expression || '0 8 * * *');
    setIntervalMinutes(job.interval_minutes?.toString() || '60');
    setEditError('');
  };

  const handleSave = async () => {
    if (!editingJob) return;
    setSaving(true);
    setEditError('');
    try {
      const body: Record<string, string | number | boolean> = {
        job_type: editJobType,
        is_active: editingJob.is_active,
      };
      if (editJobType === 'cron') {
        body.cron_expression = cronExpression.trim();
      } else {
        body.interval_minutes = parseInt(intervalMinutes, 10);
      }

      const res = await apiCall<{ status: string; msg?: string }>(`/api/scheduler/jobs/${editingJob.id}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      });
      if (res.status === 'Sucesso') {
        setEditingJob(null);
        notify(res.msg || 'Agendamento atualizado.', 'success');
        await loadJobs();
      } else {
        setEditError(res.msg || 'Falha ao salvar agendamento.');
      }
    } catch (e) {
      setEditError(e instanceof Error ? e.message : 'Erro ao salvar agendamento.');
    } finally {
      setSaving(false);
    }
  };

  const summary = useMemo(() => {
    const activeCount = jobs.filter((j) => j.is_active).length;
    const okCount = jobs.filter((j) => j.last_run_status === 'success').length;
    const runningCount = jobs.filter((j) => j.last_run_status === 'running').length;
    const errorCount = jobs.filter((j) => j.last_run_status === 'error').length;
    return { total: jobs.length, activeCount, okCount, runningCount, errorCount };
  }, [jobs]);

  const filteredJobs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return jobs.filter((job) => {
      const meta = JOB_META[job.name];
      const cat = meta?.category || 'sistema';
      if (categoryFilter !== 'all' && cat !== categoryFilter) return false;
      if (!q) return true;
      const hay = `${job.name} ${meta?.title || ''} ${job.description || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [jobs, categoryFilter, searchQuery]);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Nunca';
    return new Date(dateStr).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-surface text-text-primary font-sans flex items-center justify-center">
        <div className="flex items-center gap-2 text-text-muted text-sm">
          <RefreshCw size={16} className="animate-spin text-accent" />
          Carregando agendador de tarefas...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface text-text-primary font-sans">
      <SubPageHeader />
      <div className="max-w-6xl mx-auto p-4 md:p-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-text-primary tracking-tight">Agendador de Tarefas</h1>
            <p className="text-text-muted text-xs mt-1">
              Controle de rotinas automáticas do worker, próximas execuções e histórico em tempo real
            </p>
          </div>

          <button
            type="button"
            onClick={() => loadJobs(true)}
            disabled={refreshing}
            className="self-start sm:self-auto inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-surface-card border border-border-subtle text-xs font-semibold text-text-primary hover:bg-surface-elevated transition-colors"
          >
            <RefreshCw size={13} className={refreshing || hasRunningJob ? 'animate-spin text-accent' : 'text-text-muted'} />
            {hasRunningJob ? 'Atualizando...' : 'Atualizar'}
          </button>
        </div>

        {/* Summary KPI Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="p-3.5 rounded-xl bg-surface-card border border-border-subtle">
            <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-text-muted">
              <span>Status do Worker</span>
              <Server size={13} className={worker?.online ? 'text-status-success' : 'text-status-error'} />
            </div>
            <div className="mt-1 flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${worker?.online ? 'bg-status-success animate-pulse' : 'bg-status-error'}`} />
              <span className={`text-base font-bold ${worker?.online ? 'text-status-success' : 'text-status-error'}`}>
                {worker?.online ? 'Online' : 'Offline'}
              </span>
            </div>
            <span className="text-[10px] font-mono text-text-muted">
              {worker?.age_seconds !== null && worker?.age_seconds !== undefined
                ? `Sinal há ${worker.age_seconds}s`
                : 'Sem heartbeat'}
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-surface-card border border-border-subtle">
            <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted block">Jobs Ativos</span>
            <span className="text-lg font-mono font-bold text-text-primary mt-1 block">
              {summary.activeCount} <span className="text-xs text-text-muted font-normal">/ {summary.total}</span>
            </span>
            <span className="text-[10px] text-text-muted">Agendados no APScheduler</span>
          </div>

          <div className="p-3.5 rounded-xl bg-surface-card border border-border-subtle">
            <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted block">Execuções OK</span>
            <span className="text-lg font-mono font-bold text-status-success mt-1 block">
              {summary.okCount}
            </span>
            <span className="text-[10px] text-text-muted">Concluídos sem falhas</span>
          </div>

          <div className="p-3.5 rounded-xl bg-surface-card border border-border-subtle">
            <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted block">
              Em Execução / Erros
            </span>
            <div className="flex items-baseline gap-3 mt-1">
              <span className="text-lg font-mono font-bold text-status-warning">{summary.runningCount} exec.</span>
              <span className={`text-lg font-mono font-bold ${summary.errorCount > 0 ? 'text-status-error' : 'text-text-muted'}`}>
                {summary.errorCount} erro(s)
              </span>
            </div>
            <span className="text-[10px] text-text-muted">Monitoramento contínuo</span>
          </div>
        </div>

        {/* Filters + Search */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1.5">
            {CATEGORY_FILTERS.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setCategoryFilter(cat.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${
                  categoryFilter === cat.id
                    ? 'bg-accent text-white border-accent'
                    : 'bg-surface-card border-border-subtle text-text-muted hover:text-text-primary'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          <div className="relative w-full md:w-64">
            <Search size={13} className="absolute left-3 top-2.5 text-text-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filtrar tarefa..."
              className="w-full bg-surface-card border border-border-subtle rounded-xl pl-8 pr-3 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
            />
          </div>
        </div>

        {/* Jobs Grid */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {filteredJobs.map((job) => {
            const meta = JOB_META[job.name];
            const status = job.last_run_status;
            const isRunning = status === 'running';
            const isError = status === 'error';
            const isSuccess = status === 'success';

            const accentBorder = !job.is_active
              ? 'border-l-slate-600'
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
                key={job.id}
                className={`rounded-2xl border border-border-subtle border-l-4 ${accentBorder} p-4 md:p-5 bg-surface-card transition-all ${
                  job.is_active ? '' : 'opacity-70'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-bold text-text-primary">
                        {meta?.title || job.name}
                      </h3>
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

                {/* Timings */}
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
                    <span className="font-mono text-text-primary block mt-0.5">{formatDate(job.last_run_at)}</span>
                    {job.last_run_at && (
                      <span className="text-[9px] text-text-muted block">{formatRelativeTime(job.last_run_at)}</span>
                    )}
                  </div>
                  <div>
                    <span className="text-[9px] uppercase font-bold text-text-muted flex items-center gap-1">
                      <CalendarClock size={10} /> Próxima
                    </span>
                    <span className="font-mono text-text-primary block mt-0.5">
                      {job.is_active ? formatDate(job.next_run_at) : 'Pausado'}
                    </span>
                    {job.is_active && job.next_run_at && (
                      <span className="text-[9px] text-accent block">{formatRelativeTime(job.next_run_at, true)}</span>
                    )}
                  </div>
                </div>

                {/* Footer: Message + Actions */}
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
                      onClick={() => handleRunNow(job)}
                      disabled={!job.is_active || isRunning}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-accent-soft text-accent border border-accent/25 text-[11px] font-bold hover:bg-accent/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      <Play size={11} /> Executar
                    </button>
                    <button
                      type="button"
                      onClick={() => handleEdit(job)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-surface-elevated border border-border-subtle text-text-primary text-[11px] font-bold hover:border-accent/50 transition-colors"
                    >
                      <Pencil size={11} /> Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggle(job)}
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
          })}
        </div>

        {filteredJobs.length === 0 && (
          <div className="text-center text-text-muted py-12 bg-surface-card rounded-2xl border border-border-subtle">
            Nenhum job encontrado para esse filtro.
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {editingJob && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface-card border border-border-subtle rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <div>
              <h2 className="text-lg font-bold text-text-primary">Editar Agendamento</h2>
              <p className="text-xs font-semibold text-accent mt-0.5">
                {JOB_META[editingJob.name]?.title || editingJob.name}
              </p>
              <p className="text-[11px] font-mono text-text-muted">{editingJob.name}</p>
            </div>

            <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-surface border border-border-subtle">
              <button
                type="button"
                onClick={() => { setEditJobType('interval'); setEditError(''); }}
                className={`py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  editJobType === 'interval' ? 'bg-accent text-white' : 'text-text-muted hover:text-text-primary'
                }`}
              >
                Intervalo (min)
              </button>
              <button
                type="button"
                onClick={() => { setEditJobType('cron'); setEditError(''); }}
                className={`py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  editJobType === 'cron' ? 'bg-accent text-white' : 'text-text-muted hover:text-text-primary'
                }`}
              >
                Cron (Horário)
              </button>
            </div>

            {editJobType === 'cron' ? (
              <div className="space-y-2">
                <label className="block text-[11px] font-bold text-text-muted uppercase tracking-wider">
                  Expressão Cron (5 campos)
                </label>
                <input
                  type="text"
                  value={cronExpression}
                  onChange={(e) => setCronExpression(e.target.value)}
                  placeholder="0 8 * * *"
                  className="w-full px-3 py-2 rounded-xl bg-surface-input border border-border-subtle text-text-primary font-mono text-sm focus:outline-none focus:border-accent"
                />
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {CRON_PRESETS.map((p) => (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => setCronExpression(p.value)}
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
                  onChange={(e) => setIntervalMinutes(e.target.value)}
                  min="1"
                  className="w-full px-3 py-2 rounded-xl bg-surface-input border border-border-subtle text-text-primary font-mono text-sm focus:outline-none focus:border-accent"
                />
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {INTERVAL_PRESETS.map((p) => (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => setIntervalMinutes(String(p.value))}
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
                checked={editingJob.is_active}
                onChange={(e) => setEditingJob({ ...editingJob, is_active: e.target.checked })}
                className="w-4 h-4 rounded border-border-subtle bg-surface-input text-accent"
              />
              <span className="text-xs font-semibold text-text-primary">Job ativo no agendador</span>
            </label>

            {editError && (
              <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-status-error">
                {editError}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="flex-1 px-4 py-2 rounded-xl bg-accent text-white text-xs font-bold hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
              <button
                type="button"
                onClick={() => setEditingJob(null)}
                className="px-4 py-2 rounded-xl bg-surface-elevated border border-border-subtle text-text-primary text-xs font-bold hover:bg-surface transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
