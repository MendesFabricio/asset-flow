'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, User, ArrowRight, Wallet, UserPlus, LogIn } from 'lucide-react';

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
          router.push('/');
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
    <div className="min-h-screen bg-[#07090e] text-slate-100 flex items-center justify-center p-4 selection:bg-indigo-500/30 selection:text-indigo-200">
      {/* Background ambient glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[350px] bg-indigo-500/10 blur-[120px] rounded-full" />
      </div>

      <div className="relative w-full max-w-[390px] bg-slate-900/60 border border-white/[0.08] rounded-2xl p-8 shadow-2xl backdrop-blur-xl transition-all">
        
        {/* Header */}
        <div className="text-center mb-7">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-indigo-500/10 text-indigo-400 mb-3.5 border border-indigo-500/20 shadow-inner">
            <Wallet size={22} className="stroke-[2.2]" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-white">
            AssetFlow <span className="text-indigo-400 font-medium">Pro</span>
          </h1>
          <p className="text-slate-400 text-xs mt-1.5 font-normal">
            {isRegistering ? 'Crie sua conta para gerenciar seus ativos' : 'Acesse seu painel financeiro'}
          </p>
        </div>

        {/* Feedback Messages */}
        {success && (
          <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs rounded-lg p-3 mb-4 text-center font-medium">
            {success}
          </div>
        )}

        {error && (
          <div className="bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs rounded-lg p-3 mb-4 text-center font-medium">
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <div className="relative">
              <User className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
              <input 
                type="text" 
                placeholder="Usuário"
                className="w-full bg-slate-950/60 border border-white/[0.08] rounded-xl py-2.5 pl-10 pr-4 text-white text-xs placeholder:text-slate-500 focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/40 transition-all"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoFocus
                required
              />
            </div>
          </div>

          <div>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
              <input 
                type="password" 
                placeholder="Senha"
                className="w-full bg-slate-950/60 border border-white/[0.08] rounded-xl py-2.5 pl-10 pr-4 text-white text-xs placeholder:text-slate-500 focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/40 transition-all"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          </div>

          <button 
            type="submit" 
            disabled={loading || !username || !password}
            className="w-full mt-2 bg-indigo-600 hover:bg-indigo-500 active:scale-[0.99] text-white font-medium py-2.5 rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed text-xs shadow-lg shadow-indigo-600/20"
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
        <div className="mt-6 pt-5 border-t border-white/[0.06] text-center">
          <button
            type="button"
            onClick={() => {
              setIsRegistering(!isRegistering);
              setError('');
              setSuccess('');
            }}
            className="text-xs text-slate-400 hover:text-white transition-colors inline-flex items-center gap-1.5"
          >
            {isRegistering ? (
              <>Já tem conta? <span className="text-indigo-400 hover:underline">Fazer login</span></>
            ) : (
              <>Não tem conta? <span className="text-indigo-400 hover:underline">Registrar-se</span></>
            )}
          </button>
        </div>

      </div>
    </div>
  );
}
