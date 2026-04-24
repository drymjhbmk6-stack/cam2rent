'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';

type Notification = {
  id: string;
  type: string;
  title: string;
  message: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
};

/** Typ-Icon je nach Benachrichtigungsart */
function TypeIcon({ type }: { type: string }) {
  const iconStyle = { width: 16, height: 16, flexShrink: 0 } as const;

  switch (type) {
    case 'new_booking':
      return (
        <svg style={iconStyle} fill="none" stroke="#06b6d4" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
      );
    case 'booking_cancelled':
      return (
        <svg style={iconStyle} fill="none" stroke="#ef4444" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      );
    case 'new_damage':
      return (
        <svg style={iconStyle} fill="none" stroke="#f59e0b" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
      );
    case 'new_message':
      return (
        <svg style={iconStyle} fill="none" stroke="#8b5cf6" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      );
    case 'new_customer':
      return (
        <svg style={iconStyle} fill="none" stroke="#10b981" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
        </svg>
      );
    case 'overdue_return':
      return (
        <svg style={iconStyle} fill="none" stroke="#ef4444" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case 'new_review':
      return (
        <svg style={iconStyle} fill="none" stroke="#f59e0b" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
        </svg>
      );
    case 'payment_failed':
      return (
        <svg style={iconStyle} fill="none" stroke="#ef4444" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
        </svg>
      );
    case 'new_waitlist':
      return (
        <svg style={iconStyle} fill="none" stroke="#06b6d4" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
        </svg>
      );
    case 'new_ugc':
      return (
        <svg style={iconStyle} fill="none" stroke="#f59e0b" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      );
    default:
      return (
        <svg style={iconStyle} fill="none" stroke="#64748b" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
      );
  }
}

/** Relative Zeitanzeige auf Deutsch */
function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffSec = Math.floor((now - then) / 1000);

  if (diffSec < 60) return 'Gerade eben';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `Vor ${diffMin} Min.`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `Vor ${diffHr} Std.`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay === 1) return 'Gestern';
  if (diffDay < 7) return `Vor ${diffDay} Tagen`;
  const diffWeek = Math.floor(diffDay / 7);
  if (diffWeek < 5) return `Vor ${diffWeek} Wo.`;
  return new Date(dateStr).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
}

export default function NotificationDropdown({ position = 'sidebar' }: { position?: 'sidebar' | 'mobile' }) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

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

  // Dropdown schliessen bei Klick ausserhalb
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [open]);

  async function markAllRead() {
    await fetch('/api/admin/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markAllRead: true }),
    });
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);
  }

  async function handleNotificationClick(notification: Notification) {
    // Als gelesen markieren
    if (!notification.is_read) {
      await fetch('/api/admin/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [notification.id] }),
      });
      setNotifications((prev) =>
        prev.map((n) => (n.id === notification.id ? { ...n, is_read: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    }

    // Navigieren
    if (notification.link) {
      setOpen(false);
      router.push(notification.link);
    }
  }

  // Positionierung je nach Kontext
  const panelPosition = position === 'mobile'
    ? { top: '100%', right: 0, left: 'auto', marginTop: 4 }
    : { bottom: '100%', left: 0, right: 'auto', marginBottom: 4 };

  return (
    <div ref={dropdownRef} style={{ position: 'relative', display: 'inline-flex' }}>
      {/* Glocken-Button */}
      <button
        onClick={() => setOpen(!open)}
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 36,
          height: 36,
          borderRadius: 8,
          border: 'none',
          background: open ? 'rgba(6,182,212,0.15)' : 'transparent',
          color: open ? '#06b6d4' : '#475569',
          cursor: 'pointer',
          transition: 'all 0.15s',
        }}
        onMouseEnter={(e) => {
          if (!open) (e.currentTarget as HTMLElement).style.color = '#94a3b8';
        }}
        onMouseLeave={(e) => {
          if (!open) (e.currentTarget as HTMLElement).style.color = '#475569';
        }}
        aria-label="Benachrichtigungen"
      >
        <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>

        {/* Badge */}
        {unreadCount > 0 && (
          <span
            style={{
              position: 'absolute',
              top: 2,
              right: 2,
              minWidth: 16,
              height: 16,
              borderRadius: 8,
              background: '#ef4444',
              color: '#fff',
              fontSize: 10,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 4px',
              lineHeight: 1,
            }}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown-Panel */}
      {open && (
        <div
          style={{
            position: 'absolute',
            ...panelPosition,
            width: 340,
            maxHeight: 420,
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: 12,
            boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 16px',
              borderBottom: '1px solid #334155',
            }}
          >
            <span style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 700 }}>
              Benachrichtigungen
            </span>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#06b6d4',
                  fontSize: 11,
                  cursor: 'pointer',
                  fontWeight: 600,
                  padding: '2px 6px',
                  borderRadius: 4,
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.background = 'rgba(6,182,212,0.1)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background = 'none';
                }}
              >
                Alle als gelesen markieren
              </button>
            )}
          </div>

          {/* Liste */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {notifications.length === 0 ? (
              <div
                style={{
                  padding: '32px 16px',
                  textAlign: 'center',
                  color: '#475569',
                  fontSize: 13,
                }}
              >
                Keine Benachrichtigungen
              </div>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => handleNotificationClick(n)}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 10,
                    width: '100%',
                    padding: '10px 16px',
                    border: 'none',
                    borderBottom: '1px solid rgba(51,65,85,0.5)',
                    background: n.is_read ? 'transparent' : 'rgba(6,182,212,0.05)',
                    cursor: n.link ? 'pointer' : 'default',
                    textAlign: 'left',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background = n.is_read
                      ? 'transparent'
                      : 'rgba(6,182,212,0.05)';
                  }}
                >
                  <div style={{ paddingTop: 2 }}>
                    <TypeIcon type={n.type} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: n.is_read ? 500 : 700,
                        color: n.is_read ? '#94a3b8' : '#e2e8f0',
                        lineHeight: 1.4,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {n.title}
                    </div>
                    {n.message && (
                      <div
                        style={{
                          fontSize: 11,
                          color: '#64748b',
                          marginTop: 2,
                          lineHeight: 1.3,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {n.message}
                      </div>
                    )}
                    <div style={{ fontSize: 10, color: '#475569', marginTop: 3 }}>
                      {timeAgo(n.created_at)}
                    </div>
                  </div>
                  {/* Ungelesen-Punkt */}
                  {!n.is_read && (
                    <div
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: '50%',
                        background: '#06b6d4',
                        flexShrink: 0,
                        marginTop: 5,
                      }}
                    />
                  )}
                </button>
              ))
            )}
          </div>

          {/* Footer */}
          <div
            style={{
              padding: '8px 16px',
              borderTop: '1px solid #334155',
              textAlign: 'center',
            }}
          >
            <button
              onClick={() => {
                setOpen(false);
                router.push('/admin');
              }}
              style={{
                background: 'none',
                border: 'none',
                color: '#475569',
                fontSize: 11,
                cursor: 'pointer',
                fontWeight: 600,
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.color = '#06b6d4';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.color = '#475569';
              }}
            >
              Alle Benachrichtigungen
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
