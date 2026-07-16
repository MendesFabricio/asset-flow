import { useState, useRef, useCallback, useEffect } from 'react';

export interface TooltipState<T> {
  rect: DOMRect;
  data: T;
}

export function useFloatingTooltip<T = unknown>() {
  const [tooltip, setTooltip] = useState<TooltipState<T> | null>(null);
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const showTooltip = useCallback((e: React.MouseEvent, data: T) => {
    if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    setTooltip({ rect: e.currentTarget.getBoundingClientRect(), data });
  }, []);

  const hideTooltip = useCallback((delay = 100) => {
    hideTimeoutRef.current = setTimeout(() => { setTooltip(null); }, delay);
  }, []);

  useEffect(() => {
    return () => {
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    };
  }, []);

  return { tooltip, showTooltip, hideTooltip };
}
