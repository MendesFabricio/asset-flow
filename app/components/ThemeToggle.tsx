'use client';

import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '@/context/ThemeContext';

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <div 
      className="p-1 rounded-md border bg-surface-card border-border-subtle flex items-center gap-1 select-none transition-colors duration-150"
      title={theme === 'light' ? 'Modo Claro ativo (clique na lua para Modo Escuro padrão)' : 'Modo Escuro padrão ativo (clique no sol para Modo Claro)'}
    >
      {/* Botão Sol -> Modo White / Claro */}
      <button
        type="button"
        onClick={() => toggleTheme('light')}
        className={`flex items-center justify-center w-7 h-7 rounded-md transition-colors duration-150 ${
          theme === 'light'
            ? 'bg-status-warning/15 text-status-warning border border-status-warning/40 font-semibold'
            : 'text-text-muted hover:text-text-primary'
        }`}
        aria-label="Ativar Modo Claro"
      >
        <Sun size={15} className={theme === 'light' ? 'text-status-warning' : ''} />
      </button>

      {/* Botão Lua -> Modo Dark / Escuro Padrão */}
      <button
        type="button"
        onClick={() => toggleTheme('dark')}
        className={`flex items-center justify-center w-7 h-7 rounded-md transition-colors duration-150 ${
          theme === 'dark'
            ? 'bg-accent-soft text-accent border border-accent/40 font-semibold'
            : 'text-text-muted hover:text-text-primary'
        }`}
        aria-label="Ativar Modo Escuro (Padrão)"
      >
        <Moon size={15} className={theme === 'dark' ? 'text-accent' : ''} />
      </button>
    </div>
  );
}
