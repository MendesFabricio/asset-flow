'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { RefreshCw, Server, Search } from 'lucide-react';
import { apiCall } from '@/lib/api';
import { useToast } from '@/context/ToastContext';
import { SubPageHeader } from '@/components/ui/SubPageHeader';
import {
  ScheduledJob,
  WorkerHealth,
  JobCategory,
  JOB_META,
  CATEGORY_FILTERS,
} from './schedulerConfig';
import { JobCard } from './JobCard';
import { JobEditModal } from './JobEditModal';

export function SchedulerPage() {
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

  const summary = useMemo(() => ({
    total: jobs.length,
    activeCount: jobs.filter((j) => j.is_active).length,
    okCount: jobs.filter((j) => j.last_run_status === 'success').length,
    runningCount: jobs.filter((j) => j.last_run_status === 'running').length,
    errorCount: jobs.filter((j) => j.last_run_status === 'error').length,
  }), [jobs]);

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
            <span className="text-lg font-mono font-bold text-status-success mt-1 block">{summary.okCount}</span>
            <span className="text-[10px] text-text-muted">Concluídos sem falhas</span>
          </div>

          <div className="p-3.5 rounded-xl bg-surface-card border border-border-subtle">
            <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted block">Em Execução / Erros</span>
            <div className="flex items-baseline gap-3 mt-1">
              <span className="text-lg font-mono font-bold text-status-warning">{summary.runningCount} exec.</span>
              <span className={`text-lg font-mono font-bold ${summary.errorCount > 0 ? 'text-status-error' : 'text-text-muted'}`}>
                {summary.errorCount} erro(s)
              </span>
            </div>
            <span className="text-[10px] text-text-muted">Monitoramento contínuo</span>
          </div>
        </div>

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

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {filteredJobs.map((job) => (
            <JobCard key={job.id} job={job} onRunNow={handleRunNow} onEdit={handleEdit} onToggle={handleToggle} />
          ))}
        </div>

        {filteredJobs.length === 0 && (
          <div className="text-center text-text-muted py-12 bg-surface-card rounded-2xl border border-border-subtle">
            Nenhum job encontrado para esse filtro.
          </div>
        )}
      </div>

      {editingJob && (
        <JobEditModal
          job={editingJob}
          jobType={editJobType}
          cronExpression={cronExpression}
          intervalMinutes={intervalMinutes}
          error={editError}
          saving={saving}
          onChangeJobType={(t) => {
            setEditJobType(t);
            setEditError('');
          }}
          onChangeCron={setCronExpression}
          onChangeInterval={setIntervalMinutes}
          onToggleActive={(active) => setEditingJob({ ...editingJob, is_active: active })}
          onSave={handleSave}
          onClose={() => setEditingJob(null)}
        />
      )}
    </div>
  );
}
