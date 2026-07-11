'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import {
  ChevronDown, User, Settings, History, LogOut, Eye, EyeOff
} from 'lucide-react';
import { usePrivacy } from '../../context/PrivacyContext';

interface UserMenuProps {
  showName?: boolean;
}

export function UserMenu({ showName = false }: UserMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [username, setUsername] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { isHidden, togglePrivacy } = usePrivacy() as { isHidden: boolean; togglePrivacy: () => void };

  useEffect(() => {
    const saved = localStorage.getItem('assetflow_username');
    if (saved) {
      setUsername(saved);
    }

    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (e) {
      console.error("Erro no logout:", e);
    }
    localStorage.removeItem('assetflow_username');
    document.cookie = "assetflow_session=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    window.location.href = '/login';
  };

  const initials = username ? username.substring(0, 2).toUpperCase() : 'US';

  return (
    <div className="relative select-none" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 bg-slate-900/60 hover:bg-slate-900 border border-slate-800 hover:border-slate-700 p-1.5 rounded-xl transition-all text-xs font-semibold text-slate-200"
      >
        <div className="w-5 h-5 rounded-full bg-gradient-to-br from-slate-700 to-slate-800 border border-slate-600/40 text-slate-200 flex items-center justify-center font-bold text-[9px] shadow-sm">
          {initials}
        </div>
        {showName && <span className="hidden sm:inline">{username || 'Investidor'}</span>}
        <ChevronDown size={11} className={`transition-transform duration-200 text-slate-500 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-52 bg-slate-950 border border-slate-850 rounded-xl shadow-[0_10px_35px_rgba(0,0,0,0.85)] p-2.5 z-50 animate-in fade-in slide-in-from-top-1 duration-150">
          {/* USER INFO */}
          <div className="px-2.5 py-2 border-b border-slate-900 mb-1.5 flex flex-col min-w-0">
            <p className="text-[8px] text-slate-500 font-extrabold uppercase tracking-widest leading-none">Conta Ativa</p>
            <p className="text-xs text-white font-bold truncate mt-1">{username || 'Investidor'}</p>
          </div>

          {/* MENU ACTIONS */}
          <button
            type="button"
            className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-slate-900 text-slate-400 hover:text-slate-200 transition-colors flex items-center gap-2.5 text-xs"
            onClick={() => {
              alert('Funcionalidade "Meu Perfil" em desenvolvimento. Em breve no AssetFlow Pro!');
              setIsOpen(false);
            }}
          >
            <User size={13} />
            <span>Meu Perfil</span>
          </button>

          <button
            type="button"
            onClick={() => {
              togglePrivacy();
              setIsOpen(false);
            }}
            className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-slate-900 text-slate-400 hover:text-slate-200 transition-colors flex items-center gap-2.5 text-xs"
          >
            {isHidden ? <Eye size={13} /> : <EyeOff size={13} />}
            <span>{isHidden ? "Exibir Valores" : "Ocultar Valores"}</span>
          </button>

          <button
            type="button"
            className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-slate-900 text-slate-400 hover:text-slate-200 transition-colors flex items-center gap-2.5 text-xs"
            onClick={() => {
              alert('Funcionalidade "Logs de Auditoria" em desenvolvimento. Em breve no AssetFlow Pro!');
              setIsOpen(false);
            }}
          >
            <History size={13} />
            <span>Logs de Auditoria</span>
          </button>

          <Link
            href="/avancado"
            className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-slate-900 text-slate-400 hover:text-slate-200 transition-colors flex items-center gap-2.5 text-xs"
            onClick={() => setIsOpen(false)}
          >
            <Settings size={13} />
            <span>Avançado</span>
          </Link>

          <div className="h-px bg-slate-900 my-1" />

          <button
            type="button"
            onClick={handleLogout}
            className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-rose-950/20 text-slate-400 hover:text-rose-400 transition-colors flex items-center gap-2.5 text-xs font-bold"
          >
            <LogOut size={13} className="text-rose-500/80" />
            <span>Sair do sistema</span>
          </button>
        </div>
      )}
    </div>
  );
}
