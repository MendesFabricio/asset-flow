'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { apiCall } from '../lib/api';
import { formatMoney } from '../lib/format';

interface ScheduledJob {
  id: number;
  name: string;
  description: string;
  job_type: string;
  cron_expression: string | null;
  interval_minutes: number | null;
  is_active: boolean;
  last_run_at: string | null;
  last_run_status: string | null;
  last_run_message: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export default function AvancadoPage() {
  const [jobs, setJobs] = useState<ScheduledJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingJob, setEditingJob] = useState<ScheduledJob | null>(null);
  const [cronExpression, setCronExpression] = useState('');
  const [intervalMinutes, setIntervalMinutes] = useState('');
  const [saving, setSaving] = useState(false);

  const loadJobs = async () => {
    try {
      const data = await apiCall<{ status: string; data: ScheduledJob[] }>('/api/scheduler/jobs');
      if (data.status === 'Sucesso') {
        setJobs(data.data);
      }
    } catch (e) {
      console.error('Erro ao carregar jobs:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadJobs();
    const interval = setInterval(loadJobs, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleToggle = async (job: ScheduledJob) => {
    try {
      await apiCall(`/api/scheduler/jobs/${job.id}/toggle`, { method: 'POST' });
      await loadJobs();
    } catch (e) {
      console.error('Erro ao toggle job:', e);
    }
  };

  const handleRunNow = async (job: ScheduledJob) => {
    try {
      await apiCall(`/api/scheduler/jobs/${job.id}/run`, { method: 'POST' });
      setTimeout(loadJobs, 2000);
    } catch (e) {
      console.error('Erro ao executar job:', e);
    }
  };

  const handleEdit = (job: ScheduledJob) => {
    setEditingJob(job);
    setCronExpression(job.cron_expression || '');
    setIntervalMinutes(job.interval_minutes?.toString() || '');
  };

  const handleSave = async () => {
    if (!editingJob) return;
    setSaving(true);
    try {
      const body: any = {};
      if (editingJob.job_type === 'cron' && cronExpression) {
        body.cron_expression = cronExpression;
      } else if (editingJob.job_type === 'interval' && intervalMinutes) {
        body.interval_minutes = parseInt(intervalMinutes);
      }
      body.is_active = editingJob.is_active;

      await apiCall(`/api/scheduler/jobs/${editingJob.id}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      });
      setEditingJob(null);
      await loadJobs();
    } catch (e) {
      console.error('Erro ao salvar job:', e);
    } finally {
      setSaving(false);
    }
  };

  const getStatusColor = (status: string | null) => {
    switch (status) {
      case 'success': return 'text-green-400 bg-green-500/10';
      case 'error': return 'text-red-400 bg-red-500/10';
      case 'running': return 'text-yellow-400 bg-yellow-500/10';
      default: return 'text-slate-400 bg-slate-500/10';
    }
  };

  const getStatusLabel = (status: string | null) => {
    switch (status) {
      case 'success': return 'Sucesso';
      case 'error': return 'Erro';
      case 'running': return 'Executando';
      default: return 'Idle';
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Nunca';
    const date = new Date(dateStr);
    return date.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0b0f19] text-slate-200 font-sans flex items-center justify-center">
        <div className="text-slate-400">Carregando agendador...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0b0f19] text-slate-200 font-sans p-4 md:p-6">
      <div className="max-w-5xl mx-auto">
        <div className="mb-6">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-slate-200 transition-colors mb-4 group"
          >
            <ArrowLeft size={13} className="transition-transform group-hover:-translate-x-0.5" />
            Voltar para o Dashboard
          </Link>
          <h1 className="text-2xl font-bold text-white mb-2">Agendador de Tarefas</h1>
          <p className="text-slate-400 text-sm">
            Gerencie os jobs automáticos do sistema. Visualize o histórico de execuções e ajuste os horários.
          </p>
        </div>

        <div className="grid gap-4">
          {jobs.map((job) => (
            <div
              key={job.id}
              className={`rounded-xl border p-4 md:p-5 transition-all ${
                job.is_active
                  ? 'bg-slate-900/60 border-slate-800'
                  : 'bg-slate-900/30 border-slate-800/50 opacity-75'
              }`}
            >
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-base font-semibold text-white truncate">{job.name}</h3>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        job.is_active ? 'bg-green-500/15 text-green-400' : 'bg-slate-500/15 text-slate-400'
                      }`}
                    >
                      {job.is_active ? 'Ativo' : 'Inativo'}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${getStatusColor(job.last_run_status)}`}>
                      {getStatusLabel(job.last_run_status)}
                    </span>
                  </div>
                  <p className="text-slate-400 text-sm mb-3">{job.description}</p>
                  <div className="flex flex-wrap gap-4 text-xs text-slate-500">
                    <div>
                      <span className="text-slate-600">Tipo:</span>{' '}
                      <span className="text-slate-400">{job.job_type === 'cron' ? 'Cron' : 'Intervalo'}</span>
                    </div>
                    <div>
                      <span className="text-slate-600">Agendamento:</span>{' '}
                      <span className="text-slate-400">
                        {job.job_type === 'cron'
                          ? job.cron_expression || 'N/A'
                          : `A cada ${job.interval_minutes || 0} min`}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-600">Última execução:</span>{' '}
                      <span className="text-slate-400">{formatDate(job.last_run_at)}</span>
                    </div>
                    {job.last_run_message && (
                      <div className="truncate max-w-[300px]">
                        <span className="text-slate-600">Mensagem:</span>{' '}
                        <span className="text-slate-400">{job.last_run_message}</span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex md:flex-col gap-2 md:items-end">
                  <button
                    onClick={() => handleRunNow(job)}
                    disabled={!job.is_active}
                    className="px-3 py-1.5 rounded-lg bg-blue-500/15 text-blue-400 text-xs font-semibold hover:bg-blue-500/25 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    ▶ Executar
                  </button>
                  <button
                    onClick={() => handleEdit(job)}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700 transition-colors"
                  >
                    ✏ Editar
                  </button>
                  <button
                    onClick={() => handleToggle(job)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      job.is_active
                        ? 'bg-red-500/15 text-red-400 hover:bg-red-500/25'
                        : 'bg-green-500/15 text-green-400 hover:bg-green-500/25'
                    }`}
                  >
                    {job.is_active ? '⏸ Pausar' : '▶ Ativar'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {jobs.length === 0 && (
          <div className="text-center text-slate-500 py-12">
            Nenhum job agendado encontrado.
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {editingJob && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-md w-full">
            <h2 className="text-lg font-bold text-white mb-4">Editar Agendamento</h2>
            <p className="text-slate-400 text-sm mb-4">{editingJob.name}</p>
            
            <div className="space-y-4">
              {editingJob.job_type === 'cron' ? (
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Expressão Cron
                  </label>
                  <input
                    type="text"
                    value={cronExpression}
                    onChange={(e) => setCronExpression(e.target.value)}
                    placeholder="0 8 * * *"
                    className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-blue-500"
                  />
                  <p className="text-slate-500 text-xs mt-1">Ex: "0 8 * * *" = todos os dias às 08:00</p>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Intervalo (minutos)
                  </label>
                  <input
                    type="number"
                    value={intervalMinutes}
                    onChange={(e) => setIntervalMinutes(e.target.value)}
                    min="1"
                    className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-blue-500"
                  />
                </div>
              )}

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={editingJob.is_active}
                  onChange={(e) => setEditingJob({ ...editingJob, is_active: e.target.checked })}
                  className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-blue-500 focus:ring-blue-500"
                />
                <label htmlFor="is_active" className="text-sm text-slate-300">
                  Job ativo
                </label>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 px-4 py-2 rounded-lg bg-blue-500 text-white text-sm font-semibold hover:bg-blue-600 disabled:opacity-50 transition-colors"
              >
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
              <button
                onClick={() => setEditingJob(null)}
                className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 text-sm font-semibold hover:bg-slate-700 transition-colors"
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
