'use client';

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';

const MAX_COMPARE = 3;
const STORAGE_KEY = 'cam2rent_compare';

interface CompareContextValue {
  compareIds: string[];
  addToCompare: (id: string) => void;
  removeFromCompare: (id: string) => void;
  clearCompare: () => void;
  isInCompare: (id: string) => boolean;
}

const CompareContext = createContext<CompareContextValue | undefined>(undefined);

function loadFromStorage(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.slice(0, MAX_COMPARE);
    }
  } catch {
    // ignore
  }
  return [];
}

function saveToStorage(ids: string[]) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // ignore
  }
}

export function CompareProvider({ children }: { children: ReactNode }) {
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setCompareIds(loadFromStorage());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) {
      saveToStorage(compareIds);
    }
  }, [compareIds, hydrated]);

  const addToCompare = useCallback((id: string) => {
    setCompareIds((prev) => {
      // Toggle: wenn schon drin, entfernen
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      // Maximal 3
      if (prev.length >= MAX_COMPARE) return prev;
      return [...prev, id];
    });
  }, []);

  const removeFromCompare = useCallback((id: string) => {
    setCompareIds((prev) => prev.filter((x) => x !== id));
  }, []);

  const clearCompare = useCallback(() => {
    setCompareIds([]);
  }, []);

  const isInCompare = useCallback(
    (id: string) => compareIds.includes(id),
    [compareIds],
  );

  return (
    <CompareContext.Provider value={{ compareIds, addToCompare, removeFromCompare, clearCompare, isInCompare }}>
      {children}
    </CompareContext.Provider>
  );
}

export function useCompare() {
  const ctx = useContext(CompareContext);
  if (!ctx) throw new Error('useCompare muss innerhalb von CompareProvider verwendet werden');
  return ctx;
}
