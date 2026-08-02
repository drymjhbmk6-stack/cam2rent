'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Leichter Client-Cache mit Stale-While-Revalidate.
 *
 * Zweck: Seiten, die ihre Daten per Client-`fetch` laden, zeigen beim ERNEUTEN
 * Öffnen (Navigation hin und zurück innerhalb derselben Session) sofort die
 * zuletzt gesehenen Daten an — statt erst einen leeren Spinner. Im Hintergrund
 * wird revalidiert, sodass der Stand aktuell bleibt.
 *
 * - Modul-weiter Cache (überlebt Navigationen, NICHT einen vollen Reload).
 * - Erster Besuch: normaler Ladezustand (`loading=true`), dann Fetch.
 * - Wiederbesuch: `data` sofort aus dem Cache, `loading=false`, Hintergrund-Refetch.
 * - Optionales Polling (`pollMs`) für Live-Aktualisierung.
 *
 * Bewusst KEIN externes Paket (SWR/React-Query) — minimal, keine neue Abhängigkeit.
 * Kein cross-request/Server-Cache: Freshness ist über Revalidate + Poll gesichert,
 * daher unkritisch für per-User-/Admin-Daten.
 */

const cache = new Map<string, unknown>();

/** Cache-Eintrag gezielt verwerfen (z.B. nach einer Mutation). */
export function invalidateCachedFetch(key: string): void {
  cache.delete(key);
}

/**
 * Rohzugriff auf den Cache — für Seiten, die ihren State SELBST verwalten
 * (z.B. optimistische Updates via `setState(prev => ...)`). Muster:
 *   const [rows, setRows] = useState(() => getCached<Row[]>(KEY) ?? []);
 *   const [loading, setLoading] = useState(() => getCached(KEY) === undefined);
 *   // nach dem Fetch:  setCached(KEY, rows); setRows(rows);
 * So bleibt die bestehende Logik unangetastet, nur der ERSTE Frame beim
 * Wiederbesuch zeigt sofort den letzten Stand statt Spinner.
 */
export function getCached<T>(key: string): T | undefined {
  return cache.has(key) ? (cache.get(key) as T) : undefined;
}

export function setCached<T>(key: string, value: T): void {
  cache.set(key, value);
}

export function useCachedFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  opts?: { pollMs?: number; enabled?: boolean },
): { data: T | null; loading: boolean; refetch: () => Promise<void> } {
  const enabled = opts?.enabled ?? true;
  const pollMs = opts?.pollMs;

  const cached = cache.has(key) ? (cache.get(key) as T) : undefined;
  const [data, setData] = useState<T | null>(cached ?? null);
  const [loading, setLoading] = useState<boolean>(cached === undefined);

  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const mountedRef = useRef(true);
  // Stale-Response-Guard: Wechselt der `key` (z.B. weil ein gemerkter Filter
  // nach dem Mount aus localStorage nachgeladen wird), laufen kurz zwei Fetches
  // parallel. Ohne Guard könnte die langsamere ältere Antwort die neuere
  // überschreiben (Anzeige passt dann nicht zum aktiven Filter). Nur die jeweils
  // letzte Anfrage darf `data`/`loading` setzen; das Cachen pro Key bleibt.
  const reqIdRef = useRef(0);

  const refetch = useCallback(async () => {
    const myId = ++reqIdRef.current;
    try {
      const result = await fetcherRef.current();
      cache.set(key, result);
      if (mountedRef.current && myId === reqIdRef.current) setData(result);
    } catch {
      // Letzten guten Stand behalten — kein Absturz bei Netzfehler/Poll.
    } finally {
      if (mountedRef.current && myId === reqIdRef.current) setLoading(false);
    }
  }, [key]);

  useEffect(() => {
    mountedRef.current = true;
    if (!enabled) return;
    // Wiederbesuch: `data` steht schon aus dem Cache → nur still revalidieren.
    void refetch();
    if (pollMs && pollMs > 0) {
      const t = setInterval(() => void refetch(), pollMs);
      return () => {
        mountedRef.current = false;
        clearInterval(t);
      };
    }
    return () => {
      mountedRef.current = false;
    };
  }, [enabled, pollMs, refetch]);

  return { data, loading, refetch };
}
