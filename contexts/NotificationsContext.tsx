'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Zentraler Provider fuer den Admin-Benachrichtigungs-State.
 *
 * Hintergrund: Vorher hatte jede `<NotificationDropdown>`-Instanz (Mobile-
 * Header + Sidebar-Footer) ihren eigenen `useState(unreadCount)` + eigenes
 * Polling. Klick auf „Als gelesen" in der einen Glocke aktualisierte die
 * andere erst beim naechsten Poll (mind. 30 s spaeter) → Counter waren
 * auseinandergelaufen.
 *
 * Loesung: Ein einziger Provider haelt den State + macht EIN Polling.
 * Beide Glocken lesen aus dem Context, alle Mutationen (markAllRead /
 * markAsRead) gehen ueber den Provider → Counter sind immer synchron.
 */

export type Notification = {
  id: string;
  type: string;
  title: string;
  message: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
};

interface NotificationsContextValue {
  notifications: Notification[];
  unreadCount: number;
  /** Markiert einzelne Notification als gelesen (optimistic + API). */
  markAsRead: (id: string) => Promise<void>;
  /** Markiert alle als gelesen (optimistic + API). */
  markAllRead: () => Promise<void>;
  /** Forciert ein Refetch (z.B. nach externer Aktion). */
  refresh: () => Promise<void>;
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

export function useNotifications(): NotificationsContextValue {
  const ctx = useContext(NotificationsContext);
  if (!ctx) {
    throw new Error('useNotifications muss innerhalb von <NotificationsProvider> verwendet werden.');
  }
  return ctx;
}

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  // Backoff-Zaehler: bei Fehlern (Supabase 522, Netz weg, etc.) verdoppeln
  // wir das Poll-Intervall schrittweise — statt die toten Server mit
  // 30s-Requests zu ueberfluten. Reset auf 30s bei Erfolg.
  const failureCountRef = useRef(0);
  const nextPollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchNotifications = useCallback(async (): Promise<boolean> => {
    // Nicht pollen wenn der Tab im Hintergrund ist — spart Supabase-Budget
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      return true; // nicht als Fehler werten
    }
    try {
      // Request-Timeout 8s — sonst stapeln sich bei Supabase-Ausfall die Calls
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      const res = await fetch('/api/admin/notifications', { signal: controller.signal });
      clearTimeout(timeoutId);
      if (!res.ok) return false;
      const data = await res.json();
      setNotifications(data.notifications || []);
      setUnreadCount(data.unreadCount || 0);
      return true;
    } catch {
      return false;
    }
  }, []);

  // Adaptives Polling: 30s normal, bei Fehlern exponentiell bis 5 Min
  useEffect(() => {
    let mounted = true;

    async function tick() {
      if (!mounted) return;
      const ok = await fetchNotifications();
      if (!mounted) return;
      if (ok) {
        failureCountRef.current = 0;
      } else {
        failureCountRef.current = Math.min(failureCountRef.current + 1, 4);
      }
      // 30s, 60s, 120s, 240s, 300s
      const nextDelay = Math.min(30000 * Math.pow(2, failureCountRef.current), 300000);
      nextPollTimeoutRef.current = setTimeout(tick, nextDelay);
    }

    tick();

    // Bei Sichtbarkeits-Wechsel sofort neu pollen (resettet auch Backoff)
    function onVisibilityChange() {
      if (document.visibilityState === 'visible') {
        failureCountRef.current = 0;
        if (nextPollTimeoutRef.current) clearTimeout(nextPollTimeoutRef.current);
        tick();
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      mounted = false;
      if (nextPollTimeoutRef.current) clearTimeout(nextPollTimeoutRef.current);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [fetchNotifications]);

  const markAsRead = useCallback(async (id: string) => {
    // Optimistic Update — Counter + Liste sofort aktualisieren
    let wasUnread = false;
    setNotifications((prev) =>
      prev.map((n) => {
        if (n.id === id && !n.is_read) {
          wasUnread = true;
          return { ...n, is_read: true };
        }
        return n;
      }),
    );
    if (wasUnread) {
      setUnreadCount((prev) => Math.max(0, prev - 1));
    }
    try {
      await fetch('/api/admin/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [id] }),
      });
    } catch {
      // bei Fehler einmal neu syncen
      fetchNotifications();
    }
  }, [fetchNotifications]);

  const markAllRead = useCallback(async () => {
    // Optimistic Update
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);
    try {
      await fetch('/api/admin/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markAllRead: true }),
      });
    } catch {
      fetchNotifications();
    }
  }, [fetchNotifications]);

  const refresh = useCallback(async () => {
    await fetchNotifications();
  }, [fetchNotifications]);

  return (
    <NotificationsContext.Provider
      value={{ notifications, unreadCount, markAsRead, markAllRead, refresh }}
    >
      {children}
    </NotificationsContext.Provider>
  );
}
