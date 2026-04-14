'use client';

import Link from 'next/link';
import { formatCurrency } from '@/lib/format-utils';

// ─── Theme Colors (matching admin layout) ────────────────────────
const C = {
  card: '#111827',
  cardHover: '#1a2332',
  border: '#1e293b',
  cyan: '#06b6d4',
  cyanDim: 'rgba(6,182,212,0.15)',
  green: '#10b981',
  greenDim: 'rgba(16,185,129,0.15)',
  yellow: '#f59e0b',
  yellowDim: 'rgba(245,158,11,0.15)',
  red: '#ef4444',
  redDim: 'rgba(239,68,68,0.15)',
  purple: '#8b5cf6',
  purpleDim: 'rgba(139,92,246,0.15)',
  blue: '#3b82f6',
  blueDim: 'rgba(59,130,246,0.15)',
  text: '#e2e8f0',
  textMuted: '#94a3b8',
  textDim: '#64748b',
  bg: '#0a0f1e',
} as const;

// ─── Icons (inline SVGs) ────────────────────────────────────────

function BookingIcon() {
  return (
    <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
    </svg>
  );
}

function ShippingIcon() {
  return (
    <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
    </svg>
  );
}

function ReturnIcon() {
  return (
    <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
    </svg>
  );
}

function MessageIcon() {
  return (
    <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  );
}

function DamageIcon() {
  return (
    <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
    </svg>
  );
}

function RevenueIcon() {
  return (
    <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function CustomersIcon() {
  return (
    <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function ActiveIcon() {
  return (
    <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  );
}

function StarIcon() {
  return (
    <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
    </svg>
  );
}

function ActivityIcon() {
  return (
    <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function ActionsIcon() {
  return (
    <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
    </svg>
  );
}

function UtilizationIcon() {
  return (
    <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────

function getWidgetIcon(widgetId: string): React.ReactNode {
  const map: Record<string, React.ReactNode> = {
    daily_bookings: <BookingIcon />,
    pending_shipments: <ShippingIcon />,
    upcoming_returns: <ReturnIcon />,
    unread_messages: <MessageIcon />,
    open_damages: <DamageIcon />,
    revenue_today: <RevenueIcon />,
    revenue_week: <RevenueIcon />,
    revenue_month: <RevenueIcon />,
    active_bookings: <ActiveIcon />,
    total_customers: <CustomersIcon />,
    new_customers_week: <CustomersIcon />,
    activity_feed: <ActivityIcon />,
    recent_bookings: <BookingIcon />,
    upcoming_returns_list: <ReturnIcon />,
    open_damages_list: <DamageIcon />,
    unread_messages_list: <MessageIcon />,
    recent_reviews: <StarIcon />,
    quick_actions: <ActionsIcon />,
    camera_utilization: <UtilizationIcon />,
  };
  return map[widgetId] || <BookingIcon />;
}

function getWidgetColor(widgetId: string): { accent: string; bg: string } {
  const map: Record<string, { accent: string; bg: string }> = {
    daily_bookings: { accent: C.cyan, bg: C.cyanDim },
    pending_shipments: { accent: C.yellow, bg: C.yellowDim },
    upcoming_returns: { accent: C.purple, bg: C.purpleDim },
    unread_messages: { accent: C.blue, bg: C.blueDim },
    open_damages: { accent: C.red, bg: C.redDim },
    revenue_today: { accent: C.green, bg: C.greenDim },
    revenue_week: { accent: C.green, bg: C.greenDim },
    revenue_month: { accent: C.green, bg: C.greenDim },
    active_bookings: { accent: C.cyan, bg: C.cyanDim },
    total_customers: { accent: C.purple, bg: C.purpleDim },
    new_customers_week: { accent: C.blue, bg: C.blueDim },
    activity_feed: { accent: C.cyan, bg: C.cyanDim },
    recent_bookings: { accent: C.cyan, bg: C.cyanDim },
    upcoming_returns_list: { accent: C.purple, bg: C.purpleDim },
    open_damages_list: { accent: C.red, bg: C.redDim },
    unread_messages_list: { accent: C.blue, bg: C.blueDim },
    recent_reviews: { accent: C.yellow, bg: C.yellowDim },
    quick_actions: { accent: C.cyan, bg: C.cyanDim },
    camera_utilization: { accent: C.cyan, bg: C.cyanDim },
  };
  return map[widgetId] || { accent: C.cyan, bg: C.cyanDim };
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
}

function timeAgo(dateStr: string): string {
  if (!dateStr) return '';
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'gerade eben';
  if (mins < 60) return `vor ${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `vor ${hours}h`;
  const days = Math.floor(hours / 24);
  return `vor ${days}d`;
}

function statusLabel(status: string): { label: string; color: string } {
  const map: Record<string, { label: string; color: string }> = {
    confirmed: { label: 'Bestätigt', color: C.yellow },
    shipped: { label: 'Versendet', color: C.blue },
    completed: { label: 'Abgeschlossen', color: C.green },
    cancelled: { label: 'Storniert', color: C.red },
    damaged: { label: 'Beschädigt', color: C.red },
    returned: { label: 'Retourniert', color: C.purple },
  };
  return map[status] || { label: status, color: C.textDim };
}

// ─── Loading Spinner ─────────────────────────────────────────────

function Spinner() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
      <div style={{
        width: 24, height: 24, border: `2px solid ${C.border}`, borderTopColor: C.cyan,
        borderRadius: '50%', animation: 'spin 0.8s linear infinite',
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ─── MetricWidget ────────────────────────────────────────────────

export function MetricWidget({ widgetId, data, loading }: {
  widgetId: string;
  data: { value: number } | null;
  loading: boolean;
}) {
  const { accent, bg } = getWidgetColor(widgetId);
  const icon = getWidgetIcon(widgetId);
  const isRevenue = widgetId.startsWith('revenue_');

  const label: Record<string, string> = {
    daily_bookings: 'Heutige Buchungen',
    pending_shipments: 'Offene Versandaufträge',
    upcoming_returns: 'Rückgaben (3 Tage)',
    unread_messages: 'Ungelesene Nachrichten',
    open_damages: 'Offene Schadensfälle',
    revenue_today: 'Umsatz heute',
    revenue_week: 'Umsatz Woche',
    revenue_month: 'Umsatz Monat',
    active_bookings: 'Aktive Buchungen',
    total_customers: 'Kunden gesamt',
    new_customers_week: 'Neukunden Woche',
  };

  return (
    <div style={{
      background: C.card,
      border: `1px solid ${C.border}`,
      borderRadius: 12,
      padding: 20,
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
      transition: 'border-color 0.15s',
      height: '100%',
    }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = accent; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = C.border; }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{
          width: 36, height: 36, borderRadius: 8, background: bg,
          display: 'flex', alignItems: 'center', justifyContent: 'center', color: accent,
        }}>
          {icon}
        </div>
      </div>

      {loading ? (
        <Spinner />
      ) : (
        <>
          <div style={{ fontSize: 28, fontWeight: 800, color: C.text, lineHeight: 1.1 }}>
            {isRevenue ? formatCurrency(data?.value ?? 0) : (data?.value ?? 0)}
          </div>
          <div style={{ fontSize: 12, color: C.textDim, fontWeight: 500 }}>
            {label[widgetId] || widgetId}
          </div>
        </>
      )}
    </div>
  );
}

// ─── ListWidget ──────────────────────────────────────────────────

interface ListItem {
  id: string;
  [key: string]: unknown;
}

export function ListWidget({ widgetId, data, loading }: {
  widgetId: string;
  data: { items: ListItem[] } | null;
  loading: boolean;
}) {
  const { accent, bg } = getWidgetColor(widgetId);
  const icon = getWidgetIcon(widgetId);
  const items = data?.items ?? [];

  const titleMap: Record<string, string> = {
    activity_feed: 'Aktivitäts-Feed',
    recent_bookings: 'Letzte Buchungen',
    upcoming_returns_list: 'Anstehende Rückgaben',
    open_damages_list: 'Offene Schadensfälle',
    unread_messages_list: 'Ungelesene Nachrichten',
    recent_reviews: 'Letzte Bewertungen',
  };

  const linkMap: Record<string, string> = {
    recent_bookings: '/admin/buchungen',
    upcoming_returns_list: '/admin/retouren',
    open_damages_list: '/admin/schaeden',
    unread_messages_list: '/admin/nachrichten',
    recent_reviews: '/admin/bewertungen',
    activity_feed: '/admin/buchungen',
  };

  function renderItem(item: ListItem, idx: number) {
    switch (widgetId) {
      case 'recent_bookings': {
        const b = item as ListItem & { product_name: string; customer_name: string; price_total: number; status: string; created_at: string; rental_from: string; rental_to: string };
        const st = statusLabel(b.status);
        return (
          <div key={b.id} style={{
            padding: '10px 0',
            borderBottom: idx < items.length - 1 ? `1px solid ${C.border}` : 'none',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
          }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {b.product_name}
              </div>
              <div style={{ fontSize: 11, color: C.textDim, marginTop: 2 }}>
                {b.customer_name} &middot; {formatDate(b.rental_from)} - {formatDate(b.rental_to)}
              </div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{formatCurrency(b.price_total)}</div>
              <span style={{ fontSize: 10, fontWeight: 600, color: st.color, background: `${st.color}22`, padding: '1px 6px', borderRadius: 10 }}>
                {st.label}
              </span>
            </div>
          </div>
        );
      }
      case 'upcoming_returns_list': {
        const b = item as ListItem & { product_name: string; customer_name: string; rental_to: string; tracking_number?: string };
        return (
          <div key={b.id} style={{
            padding: '10px 0',
            borderBottom: idx < items.length - 1 ? `1px solid ${C.border}` : 'none',
          }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{b.product_name}</div>
            <div style={{ fontSize: 11, color: C.textDim, marginTop: 2 }}>
              {b.customer_name} &middot; Rückgabe: {formatDate(b.rental_to)}
              {b.tracking_number ? ` &middot; ${b.tracking_number}` : ''}
            </div>
          </div>
        );
      }
      case 'open_damages_list': {
        const d = item as ListItem & { description: string; product_name: string; customer_name: string; created_at: string };
        return (
          <div key={d.id} style={{
            padding: '10px 0',
            borderBottom: idx < items.length - 1 ? `1px solid ${C.border}` : 'none',
          }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{d.product_name || 'Schadensfall'}</div>
            <div style={{ fontSize: 11, color: C.textDim, marginTop: 2 }}>
              {d.customer_name} &middot; {d.description?.substring(0, 60)}{(d.description?.length ?? 0) > 60 ? '...' : ''} &middot; {timeAgo(d.created_at)}
            </div>
          </div>
        );
      }
      case 'unread_messages_list': {
        const m = item as ListItem & { body: string; created_at: string; conversation_id: string };
        return (
          <div key={m.id} style={{
            padding: '10px 0',
            borderBottom: idx < items.length - 1 ? `1px solid ${C.border}` : 'none',
          }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>
              {m.body?.substring(0, 80)}{(m.body?.length ?? 0) > 80 ? '...' : ''}
            </div>
            <div style={{ fontSize: 11, color: C.textDim, marginTop: 2 }}>{timeAgo(m.created_at)}</div>
          </div>
        );
      }
      case 'recent_reviews': {
        const r = item as ListItem & { rating: number; comment: string; product_name: string; customer_name: string; approved: boolean; created_at: string };
        return (
          <div key={r.id} style={{
            padding: '10px 0',
            borderBottom: idx < items.length - 1 ? `1px solid ${C.border}` : 'none',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 13, color: C.yellow }}>{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</span>
              {!r.approved && (
                <span style={{ fontSize: 10, fontWeight: 600, color: C.yellow, background: C.yellowDim, padding: '1px 6px', borderRadius: 10 }}>Ausstehend</span>
              )}
            </div>
            <div style={{ fontSize: 12, color: C.text, marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {r.comment || 'Keine Bewertung'}
            </div>
            <div style={{ fontSize: 11, color: C.textDim, marginTop: 2 }}>
              {r.customer_name} &middot; {r.product_name} &middot; {timeAgo(r.created_at)}
            </div>
          </div>
        );
      }
      case 'activity_feed': {
        const a = item as ListItem & { title: string; subtitle: string; status: string; created_at: string };
        const st = statusLabel(a.status);
        return (
          <div key={`${a.id}-${idx}`} style={{
            padding: '8px 0',
            borderBottom: idx < items.length - 1 ? `1px solid ${C.border}` : 'none',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <div style={{
              width: 6, height: 6, borderRadius: '50%', background: st.color, flexShrink: 0,
            }} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 12, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                <span style={{ fontWeight: 600 }}>{a.title}</span>
                {a.subtitle ? <span style={{ color: C.textDim }}> &middot; {a.subtitle}</span> : null}
              </div>
            </div>
            <div style={{ fontSize: 10, color: C.textDim, flexShrink: 0 }}>
              {timeAgo(a.created_at)}
            </div>
          </div>
        );
      }
      default:
        return (
          <div key={item.id || idx} style={{ padding: '8px 0', fontSize: 12, color: C.textDim }}>
            {JSON.stringify(item).substring(0, 80)}
          </div>
        );
    }
  }

  return (
    <div style={{
      background: C.card,
      border: `1px solid ${C.border}`,
      borderRadius: 12,
      padding: 20,
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      transition: 'border-color 0.15s',
    }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = accent; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = C.border; }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8, background: bg,
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: accent,
          }}>
            {icon}
          </div>
          <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{titleMap[widgetId] || widgetId}</span>
        </div>
        {linkMap[widgetId] && (
          <Link href={linkMap[widgetId]} style={{ fontSize: 11, color: accent, textDecoration: 'none', fontWeight: 500 }}>
            Alle anzeigen
          </Link>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <Spinner />
      ) : items.length === 0 ? (
        <div style={{ padding: 20, textAlign: 'center', color: C.textDim, fontSize: 13 }}>
          Keine Einträge
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: 'auto', maxHeight: 340 }}>
          {items.map((item, idx) => renderItem(item, idx))}
        </div>
      )}
    </div>
  );
}

// ─── QuickActionsWidget ──────────────────────────────────────────

const QUICK_ACTIONS = [
  { href: '/admin/buchungen', label: 'Buchungen', color: C.cyan, icon: <BookingIcon /> },
  { href: '/admin/versand', label: 'Versand', color: C.yellow, icon: <ShippingIcon /> },
  { href: '/admin/retouren', label: 'Retouren', color: C.purple, icon: <ReturnIcon /> },
  { href: '/admin/nachrichten', label: 'Nachrichten', color: C.blue, icon: <MessageIcon /> },
  { href: '/admin/schaeden', label: 'Schäden', color: C.red, icon: <DamageIcon /> },
  { href: '/admin/kunden', label: 'Kunden', color: C.green, icon: <CustomersIcon /> },
  { href: '/admin/preise', label: 'Preise', color: C.cyan, icon: <RevenueIcon /> },
  { href: '/admin/bewertungen', label: 'Bewertungen', color: C.yellow, icon: <StarIcon /> },
  { href: '/admin/analytics', label: 'Analytics', color: C.purple, icon: <ActivityIcon /> },
  { href: '/admin/blog', label: 'Blog', color: C.blue, icon: <BookingIcon /> },
];

export function QuickActionsWidget() {
  return (
    <div style={{
      background: C.card,
      border: `1px solid ${C.border}`,
      borderRadius: 12,
      padding: 20,
      height: '100%',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8, background: C.cyanDim,
          display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.cyan,
        }}>
          <ActionsIcon />
        </div>
        <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Schnellaktionen</span>
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
        gap: 10,
      }}>
        {QUICK_ACTIONS.map((a) => (
          <Link key={a.href} href={a.href} style={{ textDecoration: 'none' }}>
            <div
              style={{
                background: `${a.color}08`,
                border: `1px solid ${a.color}30`,
                borderRadius: 10,
                padding: '14px 12px',
                textAlign: 'center',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = a.color;
                (e.currentTarget as HTMLElement).style.background = `${a.color}15`;
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = `${a.color}30`;
                (e.currentTarget as HTMLElement).style.background = `${a.color}08`;
              }}
            >
              <div style={{ color: a.color, marginBottom: 6, display: 'flex', justifyContent: 'center' }}>{a.icon}</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{a.label}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

// ─── CameraUtilizationWidget ────────────────────────────────────

interface UtilizationProduct {
  id: string;
  name: string;
  brand: string;
  utilization: number;
  bookedDays: number;
  totalDays: number;
  revenue: number;
  avgDuration: number;
  bookingCount: number;
}

function utilizationColor(pct: number): string {
  if (pct >= 70) return C.green;
  if (pct >= 40) return C.yellow;
  return C.red;
}

export function CameraUtilizationWidget({ data, loading }: {
  data: { products: UtilizationProduct[] } | null;
  loading: boolean;
}) {
  const icon = <UtilizationIcon />;
  const products = [...(data?.products ?? [])].sort((a, b) => b.utilization - a.utilization);

  return (
    <div style={{
      background: C.card,
      border: `1px solid ${C.border}`,
      borderRadius: 12,
      padding: 20,
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      transition: 'border-color 0.15s',
    }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = C.cyan; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = C.border; }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8, background: C.cyanDim,
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.cyan,
          }}>
            {icon}
          </div>
          <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Kamera-Auslastung</span>
        </div>
        <Link href="/admin/preise/kameras" style={{ fontSize: 11, color: C.cyan, textDecoration: 'none', fontWeight: 500 }}>
          Alle Kameras
        </Link>
      </div>

      {/* Content */}
      {loading ? (
        <Spinner />
      ) : products.length === 0 ? (
        <div style={{ padding: 20, textAlign: 'center', color: C.textDim, fontSize: 13 }}>
          Keine Daten vorhanden
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: 'auto', maxHeight: 340 }}>
          {products.map((p, idx) => {
            const barColor = utilizationColor(p.utilization);
            return (
              <div key={p.id} style={{
                padding: '8px 0',
                borderBottom: idx < products.length - 1 ? `1px solid ${C.border}` : 'none',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: C.text, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                    {p.name}
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: barColor, flexShrink: 0, marginLeft: 8 }}>
                    {p.utilization}%
                  </div>
                </div>
                <div style={{
                  width: '100%', height: 6, background: `${barColor}20`, borderRadius: 3, overflow: 'hidden',
                }}>
                  <div style={{
                    width: `${Math.min(100, p.utilization)}%`,
                    height: '100%',
                    background: barColor,
                    borderRadius: 3,
                    transition: 'width 0.4s ease',
                  }} />
                </div>
                <div style={{ fontSize: 10, color: C.textDim, marginTop: 3 }}>
                  {p.bookedDays} / {p.totalDays} Tage &middot; {p.bookingCount} Buchungen &middot; {formatCurrency(p.revenue)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Widget Renderer (delegates to correct widget type) ──────────

export function WidgetRenderer({ widgetId, data, loading }: {
  widgetId: string;
  data: Record<string, unknown> | null;
  loading: boolean;
}) {
  const widgetData = data?.[widgetId] as Record<string, unknown> | undefined;

  // Quick actions doesn't need data
  if (widgetId === 'quick_actions') {
    return <QuickActionsWidget />;
  }

  // Camera utilization widget
  if (widgetId === 'camera_utilization') {
    return <CameraUtilizationWidget data={widgetData as { products: UtilizationProduct[] } | null} loading={loading} />;
  }

  // Check if metric or list
  if (widgetData && 'items' in widgetData) {
    return <ListWidget widgetId={widgetId} data={widgetData as { items: ListItem[] }} loading={loading} />;
  }

  // Default: metric
  return <MetricWidget widgetId={widgetId} data={(widgetData as { value: number } | undefined) ?? null} loading={loading} />;
}

// ─── Edit Mode Widget Panel ──────────────────────────────────────

export function WidgetAddPanel({ onAdd, existingIds, onClose, registry }: {
  onAdd: (widgetId: string) => void;
  existingIds: Set<string>;
  onClose: () => void;
  registry: Array<{ id: string; label: string; category: string; description: string }>;
}) {
  const categories: { key: string; label: string }[] = [
    { key: 'metric', label: 'Metriken' },
    { key: 'list', label: 'Listen' },
    { key: 'action', label: 'Aktionen' },
  ];

  return (
    <div style={{
      position: 'fixed', top: 0, right: 0, bottom: 0, width: 340,
      background: '#0f172a', borderLeft: `1px solid ${C.border}`,
      zIndex: 100, overflowY: 'auto', padding: 24,
      boxShadow: '-4px 0 24px rgba(0,0,0,0.4)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <span style={{ fontSize: 16, fontWeight: 700, color: C.text }}>Widget hinzufügen</span>
        <button onClick={onClose} style={{
          background: 'none', border: 'none', color: C.textDim, cursor: 'pointer', fontSize: 20, padding: 4,
        }}>
          &times;
        </button>
      </div>

      {categories.map((cat) => {
        const widgets = registry.filter(
          (w) => w.category === cat.key && !existingIds.has(w.id)
        );
        if (widgets.length === 0) return null;
        return (
          <div key={cat.key} style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.textDim, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
              {cat.label}
            </div>
            {widgets.map((w) => (
              <button
                key={w.id}
                onClick={() => onAdd(w.id)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  background: C.card, border: `1px solid ${C.border}`, borderRadius: 8,
                  padding: '10px 12px', marginBottom: 6, cursor: 'pointer', color: C.text,
                  transition: 'border-color 0.15s',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = C.cyan; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = C.border; }}
              >
                <div style={{ fontSize: 13, fontWeight: 600 }}>{w.label}</div>
                <div style={{ fontSize: 11, color: C.textDim, marginTop: 2 }}>{w.description}</div>
              </button>
            ))}
          </div>
        );
      })}

      {/* If all widgets are already added */}
      {categories.every((cat) =>
        registry.filter((w) => w.category === cat.key && !existingIds.has(w.id)).length === 0
      ) && (
        <div style={{ textAlign: 'center', color: C.textDim, fontSize: 13, padding: 20 }}>
          Alle Widgets sind bereits hinzugefügt.
        </div>
      )}
    </div>
  );
}

// ─── Edit Mode Overlay for a Widget ──────────────────────────────

export function WidgetEditOverlay({ index, total, size, onMoveUp, onMoveDown, onToggleSize, onRemove }: {
  index: number;
  total: number;
  size: string;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onToggleSize: () => void;
  onRemove: () => void;
}) {
  const sizeLabels: Record<string, string> = { small: 'S', medium: 'M', large: 'L' };
  const btnStyle: React.CSSProperties = {
    background: 'rgba(6,182,212,0.2)', border: `1px solid ${C.cyan}50`, borderRadius: 6,
    color: C.cyan, cursor: 'pointer', padding: '4px 8px', fontSize: 12, fontWeight: 600,
    transition: 'all 0.15s',
  };

  return (
    <div style={{
      position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(10,15,30,0.75)', borderRadius: 12,
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
      zIndex: 10,
    }}>
      {/* Move up */}
      <button onClick={onMoveUp} disabled={index === 0} style={{
        ...btnStyle, opacity: index === 0 ? 0.3 : 1,
      }} title="Nach oben">
        &#9650;
      </button>
      {/* Move down */}
      <button onClick={onMoveDown} disabled={index === total - 1} style={{
        ...btnStyle, opacity: index === total - 1 ? 0.3 : 1,
      }} title="Nach unten">
        &#9660;
      </button>
      {/* Size toggle */}
      <button onClick={onToggleSize} style={btnStyle} title="Größe ändern">
        {sizeLabels[size] || 'S'}
      </button>
      {/* Remove */}
      <button onClick={onRemove} style={{
        ...btnStyle, background: 'rgba(239,68,68,0.2)', borderColor: `${C.red}50`, color: C.red,
      }} title="Entfernen">
        &times;
      </button>
    </div>
  );
}
