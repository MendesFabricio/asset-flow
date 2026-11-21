import Link from 'next/link';
import { Compass, Home } from 'lucide-react';
import { Card } from './components/ui/Card';

export default function NotFoundPage() {
  return (
    <main className="min-h-screen bg-surface text-text-primary flex items-center justify-center p-4">
      <Card className="max-w-md w-full p-8 text-center flex flex-col items-center gap-4">
        <div className="w-12 h-12 rounded-full bg-accent-soft border border-accent/30 text-accent flex items-center justify-center">
          <Compass size={24} />
        </div>
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-accent">Erro 404</p>
          <h1 className="text-lg font-semibold text-text-primary">Página não encontrada</h1>
          <p className="text-sm text-text-muted">
            O endereço solicitado não existe ou foi movido.
          </p>
        </div>
        <Link
          href="/"
          className="mt-2 inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-accent hover:bg-accent/90 text-white text-xs font-semibold transition-colors"
        >
          <Home size={14} /> Voltar para o Dashboard
        </Link>
      </Card>
    </main>
  );
}
