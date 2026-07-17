'use client';

import React, { createContext, useContext, useState, useEffect, useMemo, ReactNode } from 'react';

type ThemeMode = 'dark' | 'light';

interface ThemeContextType {
  theme: ThemeMode;
  toggleTheme: (mode?: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'dark',
  toggleTheme: () => {},
});

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const [theme, setTheme] = useState<ThemeMode>('dark');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem('assetflow_theme') as ThemeMode | null;
    if (saved === 'light' || saved === 'dark') {
      setTheme(saved);
      applyThemeToDom(saved);
    } else {
      setTheme('dark');
      applyThemeToDom('dark');
    }
  }, []);

  const applyThemeToDom = (mode: ThemeMode) => {
    if (typeof document !== 'undefined') {
      const root = document.documentElement;
      const body = document.body;
      if (mode === 'light') {
        root.setAttribute('data-theme', 'light');
        root.classList.add('light-theme');
        body.classList.add('light-theme');
        root.classList.remove('dark');
      } else {
        root.setAttribute('data-theme', 'dark');
        root.classList.remove('light-theme');
        body.classList.remove('light-theme');
        root.classList.add('dark');
      }
    }
  };

  const toggleTheme = (mode?: ThemeMode) => {
    setTheme((prev) => {
      const nextTheme = mode || (prev === 'dark' ? 'light' : 'dark');
      localStorage.setItem('assetflow_theme', nextTheme);
      applyThemeToDom(nextTheme);
      return nextTheme;
    });
  };

  const value = useMemo(() => ({ theme, toggleTheme }), [theme]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
