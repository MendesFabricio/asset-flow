'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, Home, RefreshCw } from 'lucide-react';
import { Card } from './components/ui/Card';

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Erro capturado pelo ErrorBoundary global:', error);
  }, [error]);

  return (
    <main className="min-h-screen bg-surface text-text-primary flex items-center justify-center p-4">
      <Card className="max-w-md w-full p-8 text-center flex flex-col items-center gap-4">
        <div className="w-12 h-12 rounded-full bg-red-500/15 border border-red-500/30 text-red-400 flex items-center justify-center">
          <AlertTriangle size={24} />
        </div>
        <div className="space-y-1">
          <h1 className="text-lg font-bold text-text-primary">Algo deu errado</h1>
          <p className="text-sm text-text-muted">
            {error.message || 'Ocorreu um erro inesperado ao renderizar esta página.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3 mt-2">
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-colors"
          >
            <RefreshCw size={14} /> Tentar novamente
          </button>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-surface-card border border-border-subtle hover:border-slate-600 text-text-primary text-xs font-bold transition-colors"
          >
            <Home size={14} /> Ir para o Dashboard
          </Link>
        </div>
      </Card>
    </main>
  );
}
