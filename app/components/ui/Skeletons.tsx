'use client';
import React from 'react';


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
