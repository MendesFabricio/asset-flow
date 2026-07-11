'use client';

export function RiskRadarSkeleton() {
  return (
    <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-6 h-full animate-pulse">
      <div className="h-4 bg-slate-850 rounded w-1/3 mb-4" />
      <div className="w-24 h-24 rounded-full border-4 border-slate-850 border-t-transparent animate-spin mx-auto" />
    </div>
  );
}

export function HistoryChartSkeleton() {
  return (
    <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-6 h-[400px] animate-pulse">
      <div className="h-4 bg-slate-850 rounded w-1/3 mb-4" />
      <div className="flex items-end gap-2 h-64">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="flex-1 bg-slate-850 rounded-t" style={{ height: `${Math.random() * 60 + 20}%` }} />
        ))}
      </div>
    </div>
  );
}

export function CategorySummarySkeleton() {
  return (
    <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-6 h-full animate-pulse">
      <div className="h-4 bg-slate-850 rounded w-1/3 mb-4" />
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-slate-850" />
            <div className="h-3 bg-slate-850 rounded w-1/3" />
            <div className="h-3 bg-slate-850 rounded w-1/4 ml-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function TableSkeleton() {
  return (
    <div className="bg-slate-900/30 border border-slate-800/40 rounded-2xl overflow-hidden animate-pulse">
      <div className="p-4 border-b border-slate-800/40 flex justify-between">
        <div className="h-4 bg-slate-850 rounded w-1/4" />
        <div className="h-6 bg-slate-850 rounded w-48" />
      </div>
      <div className="p-5 space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between py-2 border-b border-slate-850/50">
            <div className="flex items-center gap-3 w-1/3">
              <div className="w-8 h-8 rounded-lg bg-slate-850" />
              <div className="h-3 bg-slate-850 rounded w-1/2" />
            </div>
            <div className="h-3 bg-slate-850 rounded w-16" />
            <div className="h-3 bg-slate-850 rounded w-12" />
            <div className="h-3 bg-slate-850 rounded w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ModalSkeleton() {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-md w-full animate-pulse">
        <div className="h-6 bg-slate-850 rounded w-1/2 mb-4" />
        <div className="space-y-3">
          <div className="h-3 bg-slate-850 rounded w-full" />
          <div className="h-3 bg-slate-850 rounded w-11/12" />
          <div className="h-3 bg-slate-850 rounded w-4/5" />
        </div>
        <div className="flex gap-3 mt-6">
          <div className="h-10 bg-slate-850 rounded-lg flex-1" />
          <div className="h-10 bg-slate-850 rounded-lg flex-1" />
        </div>
      </div>
    </div>
  );
}

export function ChatSkeleton() {
  return (
    <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-6 h-[500px] animate-pulse">
      <div className="h-4 bg-slate-850 rounded w-1/3 mb-4" />
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className={`h-3 bg-slate-850 rounded ${i % 2 === 0 ? 'w-3/4' : 'w-1/2 ml-auto'}`} />
        ))}
      </div>
    </div>
  );
}

export function NewsPanelSkeleton() {
  return (
    <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-6 h-[400px] animate-pulse">
      <div className="h-4 bg-slate-850 rounded w-1/3 mb-4" />
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <div className="h-3 bg-slate-850 rounded w-3/4" />
            <div className="h-3 bg-slate-850 rounded w-1/2" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ReceivablesSkeleton() {
  return (
    <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-6 h-[400px] animate-pulse">
      <div className="h-4 bg-slate-850 rounded w-1/3 mb-4" />
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between py-2 border-b border-slate-850/50">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-slate-850" />
              <div className="h-3 bg-slate-850 rounded w-1/2" />
            </div>
            <div className="h-3 bg-slate-850 rounded w-20" />
            <div className="h-3 bg-slate-850 rounded w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function CreditCardsSkeleton() {
  return (
    <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-6 h-[400px] animate-pulse">
      <div className="h-4 bg-slate-850 rounded w-1/3 mb-4" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-slate-850/30 rounded-xl p-4 space-y-2">
            <div className="h-3 bg-slate-850 rounded w-1/2" />
            <div className="h-3 bg-slate-850 rounded w-1/3" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function FixedIncomeSkeleton() {
  return (
    <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-6 h-[400px] animate-pulse">
      <div className="h-4 bg-slate-850 rounded w-1/3 mb-4" />
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between py-2 border-b border-slate-850/50">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-slate-850" />
              <div className="h-3 bg-slate-850 rounded w-1/3" />
            </div>
            <div className="h-3 bg-slate-850 rounded w-16" />
            <div className="h-3 bg-slate-850 rounded w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function CorrelationSkeleton() {
  return (
    <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-6 h-[400px] animate-pulse">
      <div className="h-4 bg-slate-850 rounded w-1/3 mb-4" />
      <div className="grid grid-cols-6 gap-2">
        {Array.from({ length: 36 }).map((_, i) => (
          <div key={i} className="aspect-square bg-slate-850 rounded" />
        ))}
      </div>
    </div>
  );
}

export function QuantSkeleton() {
  return (
    <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-6 h-[500px] animate-pulse">
      <div className="h-4 bg-slate-850 rounded w-1/3 mb-4" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-slate-850/30 rounded-xl p-4 space-y-2">
            <div className="h-3 bg-slate-850 rounded w-1/2" />
            <div className="h-6 bg-slate-850 rounded w-3/4" />
          </div>
        ))}
      </div>
      <div className="h-48 bg-slate-850/30 rounded-xl" />
    </div>
  );
}
