'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowLeft, Calendar, Receipt, SlidersHorizontal, User } from 'lucide-react';
import { Logo } from '@/features/header/components/Header/Logo';
import { UserMenu } from '@/features/header/components/Header/UserMenu';
import { ThemeToggle } from '@/components/ThemeToggle';

const SUBPAGE_LINKS = [
  { href: '/agenda', label: 'Agenda', icon: Calendar },
  { href: '/tax', label: 'Imposto de Renda', icon: Receipt },
  { href: '/avancado', label: 'Avançado', icon: SlidersHorizontal },
  { href: '/perfil', label: 'Perfil', icon: User },
] as const;

export function SubPageHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-30 w-full bg-surface/85 backdrop-blur-md border-b border-border-subtle">
      <div className="max-w-7xl mx-auto px-4 lg:px-6 h-16 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-2 hover:opacity-90 transition-opacity">
            <Logo />
          </div>
          <ThemeToggle />
          <div className="hidden sm:block h-5 w-px bg-border-subtle" />
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-text-muted hover:text-text-primary transition-colors group"
          >
            <ArrowLeft size={13} className="transition-transform group-hover:-translate-x-0.5" />
            <span>Dashboard</span>
          </Link>
        </div>

        <nav aria-label="Navegação secundária" className="hidden md:flex items-center gap-1.5">
          {SUBPAGE_LINKS.map((item) => {
            const active = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${
                  active
                    ? 'bg-accent-soft text-accent border-accent/40'
                    : 'bg-surface-card text-text-muted border-border-subtle hover:bg-surface-elevated hover:text-text-primary'
                }`}
              >
                <Icon size={13} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2 shrink-0">
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
