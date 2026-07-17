'use client';
import { ReactNode, useEffect, useState } from 'react';
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
}: ModalShellProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const content = (
    <div
      className={`fixed inset-0 z-[${zIndex}] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200`}
      style={{ zIndex }}
    >
      <div
        className={`relative w-full ${maxWidthMap[maxWidth]} max-h-[90vh] overflow-y-auto bg-[#0d1117] border border-slate-800 rounded-2xl shadow-2xl flex flex-col`}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 bg-[#0d1117]/95 backdrop-blur-md border-b border-slate-800 px-6 py-4 flex items-center justify-between shrink-0">
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
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
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
          <div className="sticky bottom-0 z-10 bg-[#0d1117]/95 backdrop-blur-md border-t border-slate-800 p-6 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );

  if (!mounted) return null;

  return createPortal(content, document.body);
}
