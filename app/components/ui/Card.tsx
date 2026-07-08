import { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  variant?: 'default' | 'emerald';
}

export function Card({ children, className = '', variant = 'default' }: CardProps) {
  const baseStyles = "p-4 rounded-xl border transition-all duration-300";
  
  const variants = {
    default: "bg-slate-900 border-slate-800 hover:border-slate-700 shadow-lg shadow-black/20",
    emerald: "bg-slate-900 border-emerald-900/30 shadow-lg shadow-emerald-950/10 hover:border-emerald-800/50"
  };

  return (
    <div className={`${baseStyles} ${variants[variant]} ${className}`}>
      {children}
    </div>
  );
}
