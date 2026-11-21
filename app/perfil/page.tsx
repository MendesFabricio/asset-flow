'use client';

import { useState, useEffect, useCallback } from 'react';
import { SubPageHeader } from '@/components/ui/SubPageHeader';
import { apiCall } from '../lib/api';
import { useToast } from '../context/ToastContext';

interface ProfileData {
  id: number;
  username: string;
  created_at: string | null;
}

export default function ProfilePage() {
  const { notify } = useToast();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [username, setUsername] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const loadProfile = useCallback(async () => {
    try {
      const data = await apiCall<{ status: string; data: ProfileData }>('/api/auth/profile');
      if (data.status === 'Sucesso') {
        setProfile(data.data);
        setUsername(data.data.username);
      }
    } catch (err) {
      const e = err as Error;
      const text = e.message || 'Erro ao carregar perfil.';
      console.error('Erro ao carregar perfil:', e);
      setMessage({ type: 'error', text });
      notify(text, 'error');
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const data = await apiCall<{ status: string; msg: string }>('/api/auth/profile', {
        method: 'PUT',
        body: JSON.stringify({ username }),
      });
      if (data.status === 'Sucesso') {
        setMessage({ type: 'success', text: data.msg });
        await loadProfile();
      }
    } catch (err) {
      const e = err as Error;
      setMessage({ type: 'error', text: e.message || 'Erro ao atualizar perfil.' });
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'As senhas não coincidem.' });
      return;
    }

    if (newPassword.length < 8) {
      setMessage({ type: 'error', text: 'A nova senha deve ter pelo menos 8 caracteres.' });
      return;
    }

    setSaving(true);
    try {
      const data = await apiCall<{ status: string; msg: string }>('/api/auth/profile/password', {
        method: 'PUT',
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        }),
      });
      if (data.status === 'Sucesso') {
        setMessage({ type: 'success', text: data.msg });
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      }
    } catch (err) {
      const e = err as Error;
      setMessage({ type: 'error', text: e.message || 'Erro ao alterar senha.' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-surface text-text-primary font-sans flex items-center justify-center">
        <div className="text-text-muted">Carregando perfil...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface text-text-primary font-sans">
      <SubPageHeader />
      <div className="max-w-2xl mx-auto p-4 md:p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-text-primary mb-2">Meu Perfil</h1>
          <p className="text-text-muted text-sm">
            Gerencie suas informações de conta e segurança.
          </p>
        </div>

        {message && (
          <div className={`mb-6 p-4 rounded-xl border ${message.type === 'success'
              ? 'bg-status-success/10 border-status-success/30 text-status-success'
              : 'bg-status-error/10 border-status-error/30 text-status-error'
            }`}>
            <div className="flex items-center gap-2">
              {message.type === 'success' ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
              <span className="text-sm font-medium">{message.text}</span>
            </div>
          </div>
        )}

        <div className="space-y-6">
          <form onSubmit={handleUpdateProfile} className="bg-surface-card border border-border-subtle rounded-xl p-6">
            <h2 className="text-lg font-semibold text-text-primary mb-4">Informações Básicas</h2>

            <div className="space-y-4">
              <div>
                <label htmlFor="profile-username" className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1">
                  Nome de usuário
                </label>
                <input
                  id="profile-username"
                  type="text"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-surface-input border border-border-subtle text-text-primary text-sm focus:outline-none focus:border-accent"
                />
              </div>

              {profile?.created_at && (
                <div>
                  <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1">
                    Conta criada em
                  </label>
                  <div className="text-sm text-text-muted tabular-nums">
                    {new Date(profile.created_at).toLocaleDateString('pt-BR', {
                      day: '2-digit',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="mt-6">
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-semibold hover:bg-accent/90 disabled:opacity-50 transition-colors"
              >
                {saving ? 'Salvando...' : 'Salvar alterações'}
              </button>
            </div>
          </form>

          <form onSubmit={handleChangePassword} className="bg-surface-card border border-border-subtle rounded-xl p-6">
            <h2 className="text-lg font-semibold text-text-primary mb-4">Alterar Senha</h2>

            <div className="space-y-4">
              <div>
                <label htmlFor="current-password" className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1">
                  Senha atual
                </label>
                <input
                  id="current-password"
                  type="password"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-surface-input border border-border-subtle text-text-primary text-sm focus:outline-none focus:border-accent"
                />
              </div>

              <div>
                <label htmlFor="new-password" className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1">
                  Nova senha
                </label>
                <input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-surface-input border border-border-subtle text-text-primary text-sm focus:outline-none focus:border-accent"
                />
              </div>

              <div>
                <label htmlFor="confirm-password" className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1">
                  Confirmar nova senha
                </label>
                <input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-surface-input border border-border-subtle text-text-primary text-sm focus:outline-none focus:border-accent"
                />
              </div>
            </div>

            <div className="mt-6">
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 rounded-lg bg-status-success text-white text-sm font-semibold hover:bg-status-success/90 disabled:opacity-50 transition-colors"
              >
                {saving ? 'Alterando...' : 'Alterar senha'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
