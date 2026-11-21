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
  onPrefetch?: (id: string) => void;
}

function TabButton({
  tab,
  active,
  onSelect,
  onPrefetch,
}: {
  tab: TabItem;
  active: boolean;
  onSelect: (id: string) => void;
  onPrefetch?: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(tab.id)}
      onMouseEnter={() => onPrefetch?.(tab.id)}
      onFocus={() => onPrefetch?.(tab.id)}
      aria-pressed={active}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap shrink-0 transition-colors duration-150 active:scale-[0.98] border focus:outline-none shadow-none ring-0 ${
        active
          ? 'bg-accent-soft text-accent border-accent/40 shadow-sm'
          : 'bg-surface-card text-text-muted border-border-subtle hover:bg-surface-elevated hover:text-text-primary'
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
  onPrefetch,
}: NavigationTabsProps) {
  return (
    <div className="max-w-7xl mx-auto px-4 py-3 space-y-2">
      <div className="flex flex-col md:flex-row md:items-center gap-2.5">
        <span className="text-[11px] font-bold text-text-muted uppercase tracking-wider min-w-[125px] shrink-0">
          Minha Carteira:
        </span>
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar w-full pb-1 md:pb-0">
          {portfolioTabs.map((c) => (
            <TabButton
              key={c.id}
              tab={c}
              active={activeTab === c.id}
              onSelect={onSelect}
              onPrefetch={onPrefetch}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-col md:flex-row md:items-center gap-2.5 pt-2 border-t border-border-subtle/70">
        <span className="text-[11px] font-bold text-text-muted uppercase tracking-wider min-w-[125px] shrink-0">
          Análises &amp; IA:
        </span>
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar w-full pb-1 md:pb-0">
          {analyticsTabs.map((c) => (
            <TabButton
              key={c.id}
              tab={c}
              active={activeTab === c.id}
              onSelect={onSelect}
              onPrefetch={onPrefetch}
            />
          ))}
        </div>
      </div>
    </div>
  );
});
