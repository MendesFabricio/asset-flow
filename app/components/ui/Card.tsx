import { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  variant?: 'default' | 'emerald';
}

export function Card({ children, className = '', variant = 'default' }: CardProps) {
  const baseStyles = "p-4 rounded-xl border transition-colors duration-150";
  
  const variants = {
    default: "bg-surface-card border-border-subtle hover:border-accent/30 shadow-sm",
    emerald: "bg-surface-card border-status-success/30 hover:border-status-success/50 shadow-sm"
  };

  return (
    <div className={`${baseStyles} ${variants[variant]} ${className}`}>
      {children}
    </div>
  );
}
