'use client';

import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '@/context/ThemeContext';

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <div 
      className="h-9 p-1 rounded-xl border bg-surface-card border-border-subtle flex items-center gap-0.5 select-none transition-colors duration-200"
      title={theme === 'light' ? 'Modo Claro ativo (clique na lua para Modo Escuro padrão)' : 'Modo Escuro padrão ativo (clique no sol para Modo Claro)'}
    >
      {/* Botão Sol -> Modo White / Claro */}
      <button
        type="button"
        onClick={() => toggleTheme('light')}
        className={`flex items-center justify-center w-7 h-7 rounded-lg transition-colors duration-200 ${
          theme === 'light'
            ? 'bg-amber-500/15 text-amber-500 border border-amber-500/30 font-semibold'
            : 'text-text-muted hover:text-text-primary'
        }`}
        aria-label="Ativar Modo Claro"
      >
        <Sun size={14} />
      </button>

      {/* Botão Lua -> Modo Dark / Escuro Padrão */}
      <button
        type="button"
        onClick={() => toggleTheme('dark')}
        className={`flex items-center justify-center w-7 h-7 rounded-lg transition-colors duration-200 ${
          theme === 'dark'
            ? 'bg-accent-soft text-accent border border-accent/30 font-semibold'
            : 'text-text-muted hover:text-text-primary'
        }`}
        aria-label="Ativar Modo Escuro (Padrão)"
      >
        <Moon size={14} />
      </button>
    </div>
  );
}
