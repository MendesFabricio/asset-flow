import { ButtonHTMLAttributes, forwardRef, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  fullWidth?: boolean;
}

const base =
  'inline-flex items-center justify-center gap-2 font-semibold rounded-xl transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 disabled:opacity-50 disabled:cursor-not-allowed select-none';

const variants: Record<Variant, string> = {
  primary:
    'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-950/40 active:scale-[0.98]',
  secondary:
    'bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 active:scale-[0.98]',
  ghost:
    'bg-transparent hover:bg-slate-800/60 text-slate-300 border border-transparent hover:border-slate-700',
  danger:
    'bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-950/40 active:scale-[0.98]',
  success:
    'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-950/40 active:scale-[0.98]',
};

const sizes: Record<Size, string> = {
  sm: 'text-xs px-3 py-1.5',
  md: 'text-sm px-4 py-2',
  lg: 'text-base px-5 py-2.5',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      iconLeft,
      iconRight,
      fullWidth = false,
      className = '',
      children,
      ...props
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        className={`${base} ${variants[variant]} ${sizes[size]} ${fullWidth ? 'w-full' : ''} ${className}`}
        {...props}
      >
        {iconLeft}
        {children}
        {iconRight}
      </button>
    );
  }
);

Button.displayName = 'Button';
