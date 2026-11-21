'use client';

import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '@/context/ThemeContext';

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <div 
      className={`p-1 rounded-full border flex items-center gap-1 select-none transition-all duration-300 ${
        theme === 'light' 
          ? 'bg-slate-200/90 border-slate-300 shadow-inner' 
          : 'bg-slate-900/90 border-slate-800 shadow-inner'
      }`}
      title={theme === 'light' ? 'Modo Claro ativo (clique na lua para Modo Escuro padrão)' : 'Modo Escuro padrão ativo (clique no sol para Modo Claro)'}
    >
      {/* Botão Sol -> Modo White / Claro */}
      <button
        type="button"
        onClick={() => toggleTheme('light')}
        className={`flex items-center justify-center w-7 h-7 rounded-full transition-all duration-300 ${
          theme === 'light'
            ? 'bg-gradient-to-r from-amber-500/20 to-orange-500/20 text-amber-600 border border-amber-500/40 shadow-sm font-semibold scale-[1.05]'
            : 'text-slate-500 hover:text-slate-300 hover:scale-105'
        }`}
        aria-label="Ativar Modo Claro"
      >
        <Sun size={15} className={theme === 'light' ? 'animate-spin-slow text-amber-500' : ''} />
      </button>

      {/* Botão Lua -> Modo Dark / Escuro Padrão */}
      <button
        type="button"
        onClick={() => toggleTheme('dark')}
        className={`flex items-center justify-center w-7 h-7 rounded-full transition-all duration-300 ${
          theme === 'dark'
            ? 'bg-gradient-to-r from-indigo-500/20 to-purple-500/20 text-purple-400 border border-purple-500/40 shadow-sm font-semibold scale-[1.05]'
            : 'text-slate-400 hover:text-slate-700 hover:scale-105'
        }`}
        aria-label="Ativar Modo Escuro (Padrão)"
      >
        <Moon size={15} className={theme === 'dark' ? 'text-purple-400' : ''} />
      </button>
    </div>
  );
}
