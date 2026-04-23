'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { WidgetRenderer } from '@/components/admin/DashboardWidgets';
import { getWidgetDef } from '@/lib/admin-widgets';
import AdminBackLink from '@/components/admin/AdminBackLink';

const C = {
  text: '#e2e8f0',
  textDim: '#64748b',
  cyan: '#06b6d4',
  card: '#111827',
  border: '#1e293b',
} as const;

// Feste Widget-Auswahl fuer Kunden- & Kommunikations-Uebersicht.
const KUNDEN_WIDGETS: { id: string; size: 'small' | 'medium' | 'large' }[] = [
  { id: 'total_customers',      size: 'small' },
  { id: 'new_customers_week',   size: 'small' },
  { id: 'unread_messages',      size: 'small' },
  { id: 'open_damages',         size: 'small' },
  { id: 'unread_messages_list', size: 'medium' },
  { id: 'open_damages_list',    size: 'medium' },
  { id: 'recent_reviews',       size: 'medium' },
];

const QUICK_LINKS = [
  { href: '/admin/kunden', label: 'Alle Kunden →' },
  { href: '/admin/nachrichten', label: 'Kundenanfragen' },
  { href: '/admin/warteliste', label: 'Warteliste' },
  { href: '/admin/bewertungen', label: 'Produktbewertungen' },
  { href: '/admin/schaeden', label: 'Schadensmeldungen' },
];

export default function KundenUebersichtPage() {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/dashboard-data');
      if (res.ok) setData(await res.json());
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    timerRef.current = setInterval(fetchData, 60_000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [fetchData]);

  return (
    <div style={{ padding: '28px 24px', maxWidth: 1200, margin: '0 auto' }}>
      <AdminBackLink href="/admin" label="Zum Hauptdashboard" />

      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: 0 }}>
          Kunden & Kommunikation
        </h1>
        <p style={{ fontSize: 13, color: C.textDim, margin: '4px 0 0' }}>
          Anfragen, Bewertungen, Warteliste und offene Schadensfälle.
        </p>
      </div>

      {/* Quick Links */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
        {QUICK_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            style={{
              padding: '8px 14px',
              borderRadius: 8,
              border: `1px solid ${C.border}`,
              background: C.card,
              color: C.text,
              fontSize: 13,
              fontWeight: 600,
              textDecoration: 'none',
              transition: 'all 0.15s',
            }}
          >
            {link.label}
          </Link>
        ))}
      </div>

      {/* Widget-Grid */}
      <div className="c2r-dash-grid">
        {KUNDEN_WIDGETS.map((w) => {
          const def = getWidgetDef(w.id);
          if (!def) return null;
          const spanClass = w.size === 'large' ? 'c2r-span-4' : w.size === 'medium' ? 'c2r-span-2' : '';
          return (
            <div
              key={w.id}
              className={spanClass}
              style={{
                position: 'relative',
                minHeight: w.size === 'small' ? 140 : 200,
              }}
            >
              <WidgetRenderer widgetId={w.id} data={data} loading={loading} />
            </div>
          );
        })}
      </div>

      <style>{`
        .c2r-dash-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 16px;
        }
        .c2r-span-2 { grid-column: span 2; }
        .c2r-span-4 { grid-column: span 4; }
        @media (max-width: 1024px) {
          .c2r-dash-grid { grid-template-columns: repeat(2, 1fr); }
          .c2r-span-4 { grid-column: span 2; }
        }
        @media (max-width: 640px) {
          .c2r-dash-grid { grid-template-columns: 1fr; }
          .c2r-span-2 { grid-column: span 1; }
          .c2r-span-4 { grid-column: span 1; }
        }
      `}</style>
    </div>
  );
}
