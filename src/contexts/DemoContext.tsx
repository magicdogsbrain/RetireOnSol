import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import type { ReactNode } from 'react';

interface DemoState {
  enabled: boolean;
  solBalance: number;
  jitoSolBalance: number;
  demoDate: Date | null;
  completedDCAs: Set<string>;
  setEnabled: (v: boolean) => void;
  setSolBalance: (v: number) => void;
  setJitoSolBalance: (v: number) => void;
  setDemoDate: (date: Date | null) => void;
  advanceTime: (days: number) => void;
  markDCAComplete: (isoDate: string) => void;
  resetDemoDate: () => void;
  handleLogoClick: () => void;
}

const DemoContext = createContext<DemoState>({
  enabled: false,
  solBalance: 10,
  jitoSolBalance: 5,
  demoDate: null,
  completedDCAs: new Set(),
  setEnabled: () => {},
  setSolBalance: () => {},
  setJitoSolBalance: () => {},
  setDemoDate: () => {},
  advanceTime: () => {},
  markDCAComplete: () => {},
  resetDemoDate: () => {},
  handleLogoClick: () => {},
});

export function useDemoMode() {
  return useContext(DemoContext);
}

export function DemoProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('demo') === 'true';
  });
  const [solBalance, setSolBalance] = useState(10);
  const [jitoSolBalance, setJitoSolBalance] = useState(5);
  const [demoDate, setDemoDate] = useState<Date | null>(null);
  const [completedDCAs, setCompletedDCAs] = useState<Set<string>>(new Set());

  // Logo click counter for hidden activation
  const clickCountRef = useRef(0);
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleLogoClick = useCallback(() => {
    clickCountRef.current += 1;
    if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
    clickTimerRef.current = setTimeout(() => {
      clickCountRef.current = 0;
    }, 2000);

    if (clickCountRef.current >= 5) {
      clickCountRef.current = 0;
      setEnabled((prev) => !prev);
    }
  }, []);

  const advanceTime = useCallback((days: number) => {
    setDemoDate((prev) => {
      const base = prev || new Date();
      const next = new Date(base);
      next.setDate(next.getDate() + days);
      return next;
    });
  }, []);

  const markDCAComplete = useCallback((isoDate: string) => {
    setCompletedDCAs((prev) => {
      const next = new Set(prev);
      next.add(isoDate);
      return next;
    });
  }, []);

  const resetDemoDate = useCallback(() => {
    setDemoDate(null);
    setCompletedDCAs(new Set());
  }, []);

  // Update URL param when demo mode changes
  useEffect(() => {
    const url = new URL(window.location.href);
    if (enabled) {
      url.searchParams.set('demo', 'true');
    } else {
      url.searchParams.delete('demo');
    }
    window.history.replaceState({}, '', url.toString());
  }, [enabled]);

  // Reset demo state when exiting demo mode
  useEffect(() => {
    if (!enabled) {
      setDemoDate(null);
      setCompletedDCAs(new Set());
    }
  }, [enabled]);

  return (
    <DemoContext.Provider
      value={{
        enabled,
        solBalance,
        jitoSolBalance,
        demoDate,
        completedDCAs,
        setEnabled,
        setSolBalance,
        setJitoSolBalance,
        setDemoDate,
        advanceTime,
        markDCAComplete,
        resetDemoDate,
        handleLogoClick,
      }}
    >
      {children}
    </DemoContext.Provider>
  );
}
