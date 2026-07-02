'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useNotifications, type Notification } from '@/contexts/NotificationsContext';

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
    case 'availability_alert':
      return (
        <svg style={iconStyle} fill="none" stroke="#ef4444" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
      );
    case 'new_ugc':
      return (
        <svg style={iconStyle} fill="none" stroke="#f59e0b" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      );
    case 'blog_ready':
      return (
        <svg style={iconStyle} fill="none" stroke="#10b981" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      );
    case 'social_ready':
      return (
        <svg style={iconStyle} fill="none" stroke="#a855f7" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
        </svg>
      );
    case 'reel_ready':
      return (
        <svg style={iconStyle} fill="none" stroke="#ec4899" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      );
    case 'beleg_ready':
      return (
        <svg style={iconStyle} fill="none" stroke="#10b981" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
        </svg>
      );
    case 'beleg_failed':
      return (
        <svg style={iconStyle} fill="none" stroke="#ef4444" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
      );
    case 'beleg_duplicate':
      return (
        <svg style={iconStyle} fill="none" stroke="#f59e0b" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      );
    case 'firmware_update_available':
      return (
        <svg style={iconStyle} fill="none" stroke="#06b6d4" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
        </svg>
      );
    case 'pickup_coordination':
    case 'return_coordination':
      // Telefon-Hörer — Termin mit Kunde vereinbaren
      return (
        <svg style={iconStyle} fill="none" stroke="#06b6d4" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
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
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Geteilter Notification-State + Mutationen aus dem Provider.
  // Polling + Backoff lebt zentral im Provider — beide Glocken (Mobile-Header
  // + Sidebar-Footer) sehen damit immer denselben Counter und sind synchron.
  const { notifications, unreadCount, markAsRead, markAllRead } = useNotifications();

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

  async function handleNotificationClick(notification: Notification) {
    if (!notification.is_read) {
      await markAsRead(notification.id);
    }

    // Navigieren — Sweep 9 M5: client-side validieren gegen Legacy-Notifications
    // (vor Sweep 8 M3 konnte `link` beliebige URLs enthalten, auch javascript:).
    if (notification.link) {
      const link = notification.link;
      const isSafe = typeof link === 'string'
        && link.startsWith('/')
        && !link.startsWith('//')
        && !/^\s*javascript:/i.test(link);
      if (isSafe) {
        setOpen(false);
        router.push(link);
      } else {
        setOpen(false);
      }
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
