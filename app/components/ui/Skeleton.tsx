export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={`animate-pulse bg-surface-input rounded-lg ${className}`} />
  );
}
