'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { apiCall } from '@/lib/api';
import {
  AgendaTab,
  AnalyticsItem,
  CalendarEvento,
  Evento,
  SeasonalityRow,
  YocHistoryItem,
} from './types';

export function useAgendaData(activeTab: AgendaTab) {
  const [events, setEvents] = useState<Evento[]>([]);
  const [history, setHistory] = useState<Evento[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsItem[]>([]);
  const [yocHistory, setYocHistory] = useState<Record<string, YocHistoryItem[]>>({});
  const [seasonality, setSeasonality] = useState<SeasonalityRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [tabLoading, setTabLoading] = useState(false);
  const loadedTabsRef = useRef<{ analytics?: boolean; yoc?: boolean; seasonality?: boolean }>({});
  const [selectedYocTicker, setSelectedYocTicker] = useState('');
  const [selectedYocYear, setSelectedYocYear] = useState<number | 'all'>('all');

  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());

  useEffect(() => {
    setLoading(true);
    Promise.allSettled([
      apiCall<Evento[]>('/api/calendar'),
      apiCall<Evento[]>('/api/dividends/history'),
    ])
      .then(([calendarRes, historyRes]) => {
        if (calendarRes.status === 'fulfilled') setEvents(calendarRes.value || []);
        else console.error('Erro ao carregar /api/calendar:', calendarRes.reason);

        if (historyRes.status === 'fulfilled') setHistory(historyRes.value || []);
        else console.error('Erro ao carregar /api/dividends/history:', historyRes.reason);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (activeTab === 'analytics' && !loadedTabsRef.current.analytics) {
      loadedTabsRef.current.analytics = true;
      setTabLoading(true);
      apiCall<AnalyticsItem[]>('/api/dividends/analytics')
        .then((res) => setAnalytics(res || []))
        .catch((err) => console.error('Erro ao carregar /api/dividends/analytics:', err))
        .finally(() => setTabLoading(false));
    } else if (activeTab === 'yoc' && !loadedTabsRef.current.yoc) {
      loadedTabsRef.current.yoc = true;
      setTabLoading(true);
      apiCall<Record<string, YocHistoryItem[]>>('/api/dividends/yoc-history')
        .then((yocData) => {
          const data = yocData || {};
          setYocHistory(data);
          const tickers = Object.keys(data).sort();
          if (tickers.includes('CARTEIRA')) setSelectedYocTicker('CARTEIRA');
          else if (tickers.length > 0) setSelectedYocTicker(tickers[0]);
        })
        .catch((err) => console.error('Erro ao carregar /api/dividends/yoc-history:', err))
        .finally(() => setTabLoading(false));
    } else if (activeTab === 'seasonality' && !loadedTabsRef.current.seasonality) {
      loadedTabsRef.current.seasonality = true;
      setTabLoading(true);
      apiCall<SeasonalityRow[]>('/api/dividends/seasonality')
        .then((res) => setSeasonality(res || []))
        .catch((err) => console.error('Erro ao carregar /api/dividends/seasonality:', err))
        .finally(() => setTabLoading(false));
    }
  }, [activeTab]);

  const daysInMonth = useMemo(() => new Date(currentYear, currentMonth + 1, 0).getDate(), [currentYear, currentMonth]);
  const firstDayIndex = useMemo(() => new Date(currentYear, currentMonth, 1).getDay(), [currentYear, currentMonth]);

  const monthName = useMemo(
    () => new Date(currentYear, currentMonth).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
    [currentYear, currentMonth]
  );

  const calendarCells = useMemo(() => {
    const cells: (number | null)[] = [];
    for (let i = 0; i < firstDayIndex; i++) cells.push(null);
    for (let day = 1; day <= daysInMonth; day++) cells.push(day);
    return cells;
  }, [daysInMonth, firstDayIndex]);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvento[]>();
    const seen = new Set<string>();
    const pushItem = (ev: Evento, sourceType: 'past' | 'future') => {
      const dateKey = ev.date_payment || ev.date;
      if (!dateKey) return;
      const dedupKey = `${ev.ticker}|${ev.date_com || ev.date}|${dateKey}|${Number(ev.total || 0).toFixed(2)}`;
      if (seen.has(dedupKey)) return;
      seen.add(dedupKey);
      const bucket = map.get(dateKey);
      const item: CalendarEvento = { ...ev, sourceType };
      if (bucket) bucket.push(item);
      else map.set(dateKey, [item]);
    };
    history.forEach((h) => pushItem(h, 'past'));
    events.forEach((f) => pushItem(f, 'future'));
    return map;
  }, [events, history]);

  const getEventsForDay = (day: number): CalendarEvento[] => {
    const paddedMonth = String(currentMonth + 1).padStart(2, '0');
    const paddedDay = String(day).padStart(2, '0');
    return eventsByDate.get(`${currentYear}-${paddedMonth}-${paddedDay}`) || [];
  };

  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear((prev) => prev - 1);
    } else {
      setCurrentMonth((prev) => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear((prev) => prev + 1);
    } else {
      setCurrentMonth((prev) => prev + 1);
    }
  };

  return {
    events,
    history,
    analytics,
    yocHistory,
    seasonality,
    loading,
    tabLoading,
    selectedYocTicker,
    setSelectedYocTicker,
    selectedYocYear,
    setSelectedYocYear,
    currentYear,
    currentMonth,
    monthName,
    calendarCells,
    getEventsForDay,
    handlePrevMonth,
    handleNextMonth,
  };
}
