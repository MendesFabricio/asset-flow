'use client';

export function SkeletonLoading() {
  return (
    <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6">
      {/* StatCards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 animate-pulse">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-slate-900/40 border border-slate-800 rounded-2xl p-5 h-24 flex flex-col justify-between">
            <div className="h-3 bg-slate-850 rounded w-1/2" />
            <div className="h-6 bg-slate-850 rounded w-3/4" />
          </div>
        ))}
      </div>

      {/* Main Charts & Briefing Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-pulse">
        {/* Briefing Box */}
        <div className="lg:col-span-2 bg-slate-900/40 border border-slate-800 rounded-2xl p-6 h-56 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="h-4 bg-slate-850 rounded w-1/3" />
            <div className="h-3 bg-slate-850 rounded w-full" />
            <div className="h-3 bg-slate-850 rounded w-11/12" />
            <div className="h-3 bg-slate-850 rounded w-4/5" />
          </div>
          <div className="h-6 bg-slate-850 rounded w-1/4" />
        </div>

        {/* Small Radar / Pie box */}
        <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-6 h-56 flex flex-col items-center justify-center">
          <div className="w-24 h-24 rounded-full border-4 border-slate-850 border-t-transparent animate-spin mb-3" />
          <div className="h-3 bg-slate-850 rounded w-1/2" />
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
