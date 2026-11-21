interface BadgeProps {
  label: string;
  variant?: 'blue' | 'emerald' | 'slate';
}

export function Badge({ label, variant = 'slate' }: BadgeProps) {
  const variants = {
    blue: "bg-accent/20 text-accent border-accent/30",
    emerald: "bg-status-success/20 text-status-success border-status-success/30",
    slate: "bg-surface-input text-text-muted border-border-subtle"
  };

  return (
    <span className={`text-2xs px-1.5 py-0.5 rounded-md border font-semibold uppercase tracking-wider ${variants[variant]}`}>
      {label}
    </span>
  );
}
