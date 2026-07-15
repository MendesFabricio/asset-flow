import React from 'react';

export function MonteCarloSkeleton() {
  return (
    <div className="flex flex-col bg-slate-900/40 border border-slate-800 rounded-2xl shadow-2xl p-6 animate-pulse min-h-[400px]">
      <div className="flex justify-between items-start mb-8">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-slate-800/80 rounded-lg"></div>
          <div className="space-y-2">
            <div className="w-48 h-4 bg-slate-800 rounded"></div>
            <div className="w-64 h-3 bg-slate-800/50 rounded"></div>
          </div>
        </div>
        <div className="space-y-2 text-right">
          <div className="w-24 h-3 bg-slate-800 rounded ml-auto"></div>
          <div className="w-16 h-6 bg-slate-800/80 rounded ml-auto"></div>
        </div>
      </div>
      <div className="flex-1 w-full bg-slate-800/20 rounded-xl mt-4"></div>
    </div>
  );
}

export function HeatmapSkeleton() {
  return (
    <div className="flex flex-col bg-slate-900/40 border border-slate-800 rounded-2xl shadow-2xl p-6 animate-pulse min-h-[450px]">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-8 h-8 bg-slate-800/80 rounded-lg"></div>
        <div className="space-y-2">
          <div className="w-56 h-4 bg-slate-800 rounded"></div>
          <div className="w-40 h-3 bg-slate-800/50 rounded"></div>
        </div>
      </div>
      <div className="flex flex-col gap-1 w-full mt-4">
        {Array.from({ length: 6 }).map((_, rIdx) => (
          <div key={rIdx} className="flex gap-1">
            <div className="w-20 h-8 bg-slate-800/40 rounded"></div>
            {Array.from({ length: 6 }).map((_, cIdx) => (
              <div key={cIdx} className="flex-1 h-8 bg-slate-800/20 rounded"></div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function MetricsGridSkeleton() {
  return (
    <div className="bg-slate-900/40 border border-slate-800 rounded-2xl overflow-hidden animate-pulse min-h-[500px]">
      <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-slate-800 rounded-lg"></div>
          <div className="space-y-1.5">
            <div className="w-40 h-4 bg-slate-800 rounded"></div>
            <div className="w-32 h-2.5 bg-slate-800/50 rounded"></div>
          </div>
        </div>
        <div className="w-24 h-6 bg-slate-800 rounded-lg"></div>
      </div>
      <div className="p-5 space-y-5">
        <div className="w-full h-10 bg-slate-800 rounded-xl max-w-lg mb-2"></div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 bg-slate-800/50 rounded-xl"></div>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 bg-slate-800/50 rounded-xl"></div>
          ))}
        </div>
        <div className="w-full h-40 bg-slate-800/30 rounded-xl mt-4"></div>
      </div>
    </div>
  );
}
