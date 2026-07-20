'use client';

import { memo, ReactNode } from 'react';

export interface TabItem {
  id: string;
  icon: ReactNode;
  label: string;
}

interface NavigationTabsProps {
  portfolioTabs: TabItem[];
  analyticsTabs: TabItem[];
  activeTab: string;
  onSelect: (id: string) => void;
}

function TabButton({
  tab,
  active,
  onSelect,
}: {
  tab: TabItem;
  active: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(tab.id)}
      aria-pressed={active}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all duration-300 border focus:outline-none shadow-none ring-0 overflow-hidden ${
        active
          ? 'bg-accent/15 text-accent border-accent/40'
          : 'bg-slate-900/45 text-slate-400 border-slate-800/80 hover:text-slate-200 hover:border-slate-700/50'
      }`}
    >
      {tab.icon}
      <span>{tab.label}</span>
    </button>
  );
}

export const NavigationTabs = memo(function NavigationTabs({
  portfolioTabs,
  analyticsTabs,
  activeTab,
  onSelect,
}: NavigationTabsProps) {
  return (
    <div className="max-w-7xl mx-auto px-4 py-4 space-y-3">
      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest min-w-[125px]">
          Minha Carteira:
        </span>
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar w-full pb-1 md:pb-0">
          {portfolioTabs.map((c) => (
            <TabButton
              key={c.id}
              tab={c}
              active={activeTab === c.id}
              onSelect={onSelect}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-col md:flex-row md:items-center gap-3 pt-2 border-t border-slate-900/50">
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest min-w-[125px]">
          Análises &amp; IA:
        </span>
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar w-full pb-1 md:pb-0">
          {analyticsTabs.map((c) => (
            <TabButton
              key={c.id}
              tab={c}
              active={activeTab === c.id}
              onSelect={onSelect}
            />
          ))}
        </div>
      </div>
    </div>
  );
});
