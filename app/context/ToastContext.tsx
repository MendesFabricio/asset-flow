'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  ReactNode,
} from 'react';
import { CheckCircle, AlertTriangle, Info, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info';

interface ToastItem {
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
    wrap: 'bg-surface-card border-status-success/40 text-text-primary',
    icon: <CheckCircle size={20} className="text-status-success" />,
    label: 'Sucesso',
  },
  error: {
    wrap: 'bg-surface-card border-status-error/40 text-text-primary',
    icon: <AlertTriangle size={20} className="text-status-error" />,
    label: 'Atenção',
  },
  info: {
    wrap: 'bg-surface-card border-border-subtle text-text-primary',
    icon: <Info size={20} className="text-accent" />,
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

  const contextValue = useMemo(() => ({ notify }), [notify]);

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <div className="fixed bottom-5 right-5 z-[100] flex flex-col gap-2 items-end pointer-events-none">
        {toasts.map((t) => {
          const style = toastStyles[t.type];
          return (
            <div
              key={t.id}
              role="status"
              className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border transition-opacity duration-150 max-w-sm ${style.wrap}`}
            >
              {style.icon}
              <div className="flex flex-col">
                <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">{style.label}</span>
                <span className="text-sm font-medium">{t.msg}</span>
              </div>
              <button
                type="button"
                onClick={() => remove(t.id)}
                aria-label="Fechar notificação"
                className="ml-2 hover:bg-surface-input p-1 rounded-md text-text-muted hover:text-text-primary transition-colors"
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
