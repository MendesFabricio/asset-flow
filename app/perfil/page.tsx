'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { apiCall } from '../utils/apiClient';
import { useRouter } from 'next/navigation';

interface ProfileData {
  id: number;
  username: string;
  created_at: string | null;
}

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  
  const [username, setUsername] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const data = await apiCall<{ status: string; data: ProfileData }>('/api/auth/profile');
      if (data.status === 'Sucesso') {
        setProfile(data.data);
        setUsername(data.data.username);
      }
    } catch (e) {
      console.error('Erro ao carregar perfil:', e);
    } finally {
      setLoading(false);
    }
  };

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
    } catch (e: any) {
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
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message || 'Erro ao alterar senha.' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0b0f19] text-slate-200 font-sans flex items-center justify-center">
        <div className="text-slate-400">Carregando perfil...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0b0f19] text-slate-200 font-sans p-4 md:p-6">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-slate-200 transition-colors mb-4 group"
          >
            <ArrowLeft size={13} className="transition-transform group-hover:-translate-x-0.5" />
            Voltar para o Dashboard
          </Link>
          <h1 className="text-2xl font-bold text-white mb-2">Meu Perfil</h1>
          <p className="text-slate-400 text-sm">
            Gerencie suas informações de conta e segurança.
          </p>
        </div>

        {message && (
          <div className={`mb-6 p-4 rounded-xl border ${
            message.type === 'success'
              ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
              : 'bg-red-950/40 border-red-500/40 text-red-300'
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
          <form onSubmit={handleUpdateProfile} className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Informações Básicas</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  Nome de usuário
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
              
              {profile?.created_at && (
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Conta criada em
                  </label>
                  <div className="text-sm text-slate-500">
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
                className="px-4 py-2 rounded-lg bg-blue-500 text-white text-sm font-semibold hover:bg-blue-600 disabled:opacity-50 transition-colors"
              >
                {saving ? 'Salvando...' : 'Salvar alterações'}
              </button>
            </div>
          </form>

          <form onSubmit={handleChangePassword} className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Alterar Senha</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  Senha atual
                </label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  Nova senha
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  Confirmar nova senha
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div className="mt-6">
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 rounded-lg bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-600 disabled:opacity-50 transition-colors"
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
