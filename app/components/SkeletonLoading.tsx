'use client';

export function SkeletonLoading() {
  return (
    <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-4 animate-in fade-in duration-500">
      {/* StatCards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 animate-pulse">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-slate-900/40 border border-slate-800 rounded-2xl p-5 h-[115px] flex flex-col justify-between">
            <div className="h-3 bg-slate-850 rounded w-1/2" />
            <div className="h-6 bg-slate-850 rounded w-3/4" />
          </div>
        ))}
      </div>

      {/* Main Charts Grid - Matches RiskRadar & CategorySummary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-[525px] animate-pulse">
        {/* RiskRadar Skeleton (1 col) */}
        <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-6 h-full flex flex-col items-center justify-center">
          <div className="w-32 h-32 rounded-full border-4 border-slate-850 border-t-transparent animate-spin mb-4" />
          <div className="h-3 bg-slate-850 rounded w-1/2" />
        </div>

        {/* CategorySummary Skeleton (2 cols) */}
        <div className="lg:col-span-2 bg-slate-900/40 border border-slate-800 rounded-2xl p-6 h-full flex flex-col justify-between">
          <div className="space-y-4">
            <div className="h-5 bg-slate-850 rounded w-1/4" />
            <div className="h-4 bg-slate-850 rounded w-full" />
            <div className="h-4 bg-slate-850 rounded w-11/12" />
            <div className="h-4 bg-slate-850 rounded w-4/5" />
          </div>
          <div className="flex gap-4">
             <div className="h-24 bg-slate-850 rounded w-1/3" />
             <div className="h-24 bg-slate-850 rounded w-1/3" />
             <div className="h-24 bg-slate-850 rounded w-1/3" />
          </div>
        </div>
      </div>

      {/* Table Skeleton */}
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
    </div>
  );
}
