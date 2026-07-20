'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  ReactNode,
} from 'react';
import { CheckCircle, AlertTriangle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastItem {
  id: number;
  msg: string;
  type: ToastType;
}

interface ToastContextType {
  notify: (msg: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextType>({
  notify: () => {},
});

const TOAST_DURATION = 3000;

const toastStyles: Record<ToastType, { wrap: string; icon: ReactNode; label: string }> = {
  success: {
    wrap: 'bg-emerald-950/90 border-emerald-500/50 text-emerald-200 shadow-[0_0_20px_rgba(16,185,129,0.2)]',
    icon: <CheckCircle size={20} className="text-emerald-400 drop-shadow-[0_0_5px_rgba(16,185,129,0.8)]" />,
    label: 'Sucesso',
  },
  error: {
    wrap: 'bg-red-950/90 border-red-500/50 text-red-200 shadow-[0_0_20px_rgba(239,68,68,0.2)]',
    icon: <AlertTriangle size={20} className="text-red-400" />,
    label: 'Atenção',
  },
  info: {
    wrap: 'bg-slate-900/95 border-slate-700 text-slate-200 shadow-[0_0_20px_rgba(0,0,0,0.4)]',
    icon: <Info size={20} className="text-blue-400" />,
    label: 'Info',
  },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const notify = useCallback(
    (msg: string, type: ToastType = 'success') => {
      const id = ++idRef.current;
      setToasts((prev) => [...prev, { id, msg, type }]);
      setTimeout(() => remove(id), TOAST_DURATION);
    },
    [remove]
  );

  return (
    <ToastContext.Provider value={{ notify }}>
      {children}
      <div className="fixed bottom-5 right-5 z-[100] flex flex-col gap-2 items-end pointer-events-none">
        {toasts.map((t) => {
          const style = toastStyles[t.type];
          return (
            <div
              key={t.id}
              role="status"
              className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border transition-all duration-300 animate-in slide-in-from-right-10 fade-in backdrop-blur-sm max-w-sm ${style.wrap}`}
            >
              {style.icon}
              <div className="flex flex-col">
                <span className="text-xs font-bold uppercase tracking-wider opacity-70">{style.label}</span>
                <span className="text-sm font-medium">{t.msg}</span>
              </div>
              <button
                type="button"
                onClick={() => remove(t.id)}
                aria-label="Fechar notificação"
                className="ml-2 hover:bg-white/10 p-1 rounded-full transition-colors"
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

export function useToastNotify() {
  return useToast().notify;
}
