'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, User, ArrowRight, Wallet, UserPlus } from 'lucide-react';

export default function LoginPage() {
  const [isRegistering, setIsRegistering] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    const endpoint = isRegistering ? '/api/auth/register' : '/api/auth/login';

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      let data: { success?: boolean; message?: string; user?: { username: string } } = {};
      try {
        data = await res.json();
      } catch {
        // Resposta não foi JSON (ex: página de erro HTML)
      }

      if (res.ok && data.success) {
        if (isRegistering) {
          setSuccess('Conta criada com sucesso! Faça login.');
          setIsRegistering(false);
          setPassword('');
          setLoading(false);
        } else {
          localStorage.setItem('assetflow_username', data.user?.username || username);
          const params = new URLSearchParams(window.location.search);
          const rawCallback = params.get('callbackUrl') || '/';
          const safeTarget = rawCallback.startsWith('/') && !rawCallback.startsWith('//') ? rawCallback : '/';
          router.push(safeTarget);
          router.refresh();
        }
      } else {
        setError(data.message || (res.status === 404 ? 'Serviço de autenticação indisponível (404).' : 'Ocorreu um erro. Tente novamente.'));
        setLoading(false);
      }
    } catch {
      setError('Erro ao se conectar com o servidor.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface text-text-primary flex items-center justify-center p-4 selection:bg-accent/30">
      <div className="relative w-full max-w-[390px] bg-surface-card border border-border-subtle rounded-xl p-8 shadow-md transition-colors">
        
        {/* Header */}
        <div className="text-center mb-7">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-accent-soft text-accent mb-3.5 border border-accent/20">
            <Wallet size={22} className="stroke-[2.2]" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-text-primary">
            AssetFlow <span className="text-accent font-medium">Pro</span>
          </h1>
          <p className="text-text-muted text-xs mt-1.5 font-normal">
            {isRegistering ? 'Crie sua conta para gerenciar seus ativos' : 'Acesse seu painel financeiro'}
          </p>
        </div>

        {/* Feedback Messages */}
        {success && (
          <div className="bg-status-success/10 border border-status-success/20 text-status-success text-xs rounded-lg p-3 mb-4 text-center font-medium">
            {success}
          </div>
        )}

        {error && (
          <div className="bg-status-error/10 border border-status-error/20 text-status-error text-xs rounded-lg p-3 mb-4 text-center font-medium">
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <div className="relative">
              <User className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted" size={16} />
              <label htmlFor="username" className="sr-only">Usuário</label>
              <input 
                id="username"
                name="username"
                type="text" 
                autoComplete="username"
                placeholder="Usuário"
                className="w-full bg-surface-input border border-border-subtle rounded-lg py-2.5 pl-10 pr-4 text-text-primary text-xs placeholder:text-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/40 transition-colors"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoFocus
                required
              />
            </div>
          </div>

          <div>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted" size={16} />
              <label htmlFor="password" className="sr-only">Senha</label>
              <input 
                id="password"
                name="password"
                type="password" 
                autoComplete={isRegistering ? 'new-password' : 'current-password'}
                placeholder="Senha"
                className="w-full bg-surface-input border border-border-subtle rounded-lg py-2.5 pl-10 pr-4 text-text-primary text-xs placeholder:text-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/40 transition-colors"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          </div>

          <button 
            type="submit" 
            disabled={loading || !username || !password}
            className="w-full mt-2 bg-accent hover:bg-accent/90 text-white font-medium py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed text-xs"
          >
            {loading ? (
              'Autenticando...'
            ) : isRegistering ? (
              <>Criar Conta <UserPlus size={15} /></>
            ) : (
              <>Entrar <ArrowRight size={15} /></>
            )}
          </button>
        </form>

        {/* Switch Register/Login */}
        <div className="mt-6 pt-5 border-t border-border-subtle text-center">
          <button
            type="button"
            onClick={() => {
              setIsRegistering(!isRegistering);
              setError('');
              setSuccess('');
            }}
            className="text-xs text-text-muted hover:text-text-primary transition-colors inline-flex items-center gap-1.5"
          >
            {isRegistering ? (
              <>Já tem conta? <span className="text-accent hover:underline">Fazer login</span></>
            ) : (
              <>Não tem conta? <span className="text-accent hover:underline">Registrar-se</span></>
            )}
          </button>
        </div>

      </div>
    </div>
  );
}
