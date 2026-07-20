'use client';
import { ReactNode, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface ModalShellProps {
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  noPadding?: boolean;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl';
  zIndex?: number;
  initialFocusRef?: React.RefObject<HTMLElement>;
}

const maxWidthMap = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '3xl': 'max-w-3xl',
  '4xl': 'max-w-4xl',
  '5xl': 'max-w-5xl',
};

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

export function ModalShell({
  onClose,
  title,
  subtitle,
  icon,
  children,
  footer,
  noPadding = false,
  maxWidth = '2xl',
  zIndex = 50,
  initialFocusRef,
}: ModalShellProps) {
  const [mounted, setMounted] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const node = dialogRef.current;

    const focusTarget =
      initialFocusRef?.current ?? node?.querySelector<HTMLElement>(FOCUSABLE) ?? node ?? null;
    focusTarget?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !node) return;

      const focusable = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null
      );
      if (focusable.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      previouslyFocused?.focus?.();
    };
  }, [mounted, onClose, initialFocusRef]);

  const content = (
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200"
      style={{ zIndex }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className={`relative w-full ${maxWidthMap[maxWidth]} max-h-[90vh] overflow-y-auto bg-surface-card border border-slate-800 rounded-2xl shadow-2xl flex flex-col outline-none`}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 bg-surface-card/95 backdrop-blur-md border-b border-slate-800 px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            {icon && (
              <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-400 flex items-center justify-center">
                {icon}
              </div>
            )}
            <div>
              <h2 className="text-base font-bold text-white">{title}</h2>
              {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="p-2 rounded-lg hover:bg-surface-input text-slate-400 hover:text-white transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className={`overflow-y-auto flex-1 ${noPadding ? '' : 'p-6'}`}>
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="sticky bottom-0 z-10 bg-surface-card/95 backdrop-blur-md border-t border-slate-800 p-6 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );

  if (!mounted) return null;

  return createPortal(content, document.body);
}
