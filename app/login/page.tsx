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

      const data = await res.json();
      console.log('[LOGIN DEBUG] status:', res.status, 'data:', JSON.stringify(data));

      if (res.ok && data.success) {
        if (isRegistering) {
          setSuccess('Conta criada com sucesso! Faça login abaixo.');
          setIsRegistering(false);
          setPassword('');
          setLoading(false);
        } else {
          // Salva dados básicos no localStorage para o header saber o nome
          localStorage.setItem('assetflow_username', data.user.username);
          // O cookie httpOnly é setado automaticamente pelo route handler do Next.js
          router.push('/'); // Redireciona para o dashboard
          router.refresh();
        }
      } else {
        setError(data.message || 'Ocorreu um erro. Tente novamente.');
        setLoading(false);
      }
    } catch {
      setError('Erro ao se conectar com o servidor.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0b0f19] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-slate-900/50 border border-slate-800 rounded-2xl p-8 shadow-2xl backdrop-blur-sm animate-in fade-in zoom-in-95 duration-300">
        
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-600/20 text-blue-500 mb-4 border border-blue-500/20">
            <Wallet size={32} />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">AssetFlow <span className="text-blue-500">Pro</span></h1>
          <p className="text-slate-500 text-sm mt-2">
            {isRegistering ? 'Crie sua conta privada isolada.' : 'Faça login com suas credenciais.'}
          </p>
        </div>

        {success && (
          <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs rounded-xl p-3 mb-4 text-center">
            {success}
          </div>
        )}

        {error && (
          <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs rounded-xl p-3 mb-4 text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
              <input 
                type="text" 
                placeholder="Nome de usuário"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl py-3 pl-10 pr-4 text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all placeholder:text-slate-600 text-sm"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoFocus
                required
              />
            </div>
          </div>

          <div className="space-y-1">
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
              <input 
                type="password" 
                placeholder="Senha secreta"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl py-3 pl-10 pr-4 text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all placeholder:text-slate-600 text-sm"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          </div>

          <button 
            type="submit" 
            disabled={loading || !username || !password}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed group text-sm"
          >
            {loading ? (
              'Aguarde...'
            ) : isRegistering ? (
              <>Criar Conta <UserPlus size={18} /></>
            ) : (
              <>Entrar <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" /></>
            )}
          </button>
        </form>

        <div className="mt-6 pt-6 border-t border-slate-800/80 text-center">
          <button
            type="button"
            onClick={() => {
              setIsRegistering(!isRegistering);
              setError('');
              setSuccess('');
            }}
            className="text-xs text-blue-400 hover:text-blue-300 font-medium transition-colors inline-flex items-center gap-1.5"
          >
            {isRegistering ? (
              <>Já tem uma conta? <span className="underline">Fazer Login</span> <LogIn size={14} /></>
            ) : (
              <>Não possui conta privada? <span className="underline">Registrar-se</span> <UserPlus size={14} /></>
            )}
          </button>
        </div>

        <div className="mt-8 text-center">
          <p className="text-[10px] text-slate-700 uppercase tracking-widest">Secure Multi-User Environment</p>
        </div>
      </div>
    </div>
  );
}
