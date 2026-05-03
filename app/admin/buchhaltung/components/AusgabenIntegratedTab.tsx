'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { fmtEuro, fmtDateShort } from '@/lib/format-utils';
import AusgabenTab from './AusgabenTab';

type SubTab = 'manuell' | 'einkauf';

const SUB_TABS: Array<{ id: SubTab; label: string; description: string }> = [
  { id: 'manuell', label: 'Manuelle Ausgaben', description: 'Stripe-Gebuehren, Software, Reisekosten etc.' },
  { id: 'einkauf', label: 'Lieferanten-Rechnungen', description: 'Eingangsrechnungen + KI-OCR' },
];

interface Purchase {
  id: string;
  invoice_number: string | null;
  order_date: string;
  total_amount: number | null;
  status: string | null;
  supplier?: { id: string; name: string } | null;
  purchase_items?: Array<{ id: string; classification: string | null }>;
}

export default function AusgabenIntegratedTab() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const subParam = searchParams.get('sub') as SubTab | null;
  const [active, setActive] = useState<SubTab>(
    subParam && SUB_TABS.some((s) => s.id === subParam) ? subParam : 'manuell'
  );

  useEffect(() => {
    if (subParam && SUB_TABS.some((s) => s.id === subParam) && subParam !== active) {
      setActive(subParam);
    }
  }, [subParam]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleSubChange(sub: SubTab) {
    setActive(sub);
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', 'ausgaben');
    params.set('sub', sub);
    router.push(`/admin/buchhaltung?${params.toString()}`, { scroll: false });
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
        {SUB_TABS.map((sub) => {
          const isActive = sub.id === active;
          return (
            <button
              key={sub.id}
              onClick={() => handleSubChange(sub.id)}
              title={sub.description}
              style={{
                background: isActive ? '#06b6d4' : '#111827',
                color: isActive ? '#0f172a' : '#94a3b8',
                border: `1px solid ${isActive ? '#06b6d4' : '#1e293b'}`,
                borderRadius: 999,
                padding: '8px 18px',
                fontSize: 13,
                fontWeight: isActive ? 700 : 500,
                cursor: 'pointer',
                transition: 'all 0.15s',
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.color = '#e2e8f0'; }}
              onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.color = '#94a3b8'; }}
            >
              {sub.label}
            </button>
          );
        })}
      </div>

      {active === 'manuell' && <AusgabenTab />}
      {active === 'einkauf' && <LieferantenRechnungenList />}
    </div>
  );
}

function LieferantenRechnungenList() {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/purchases');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setPurchases(json.purchases || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fehler');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const totalThisYear = purchases
    .filter((p) => {
      const d = new Date(p.order_date);
      return d.getFullYear() === new Date().getFullYear();
    })
    .reduce((s, p) => s + (p.total_amount || 0), 0);

  const pendingCount = purchases.reduce((s, p) => {
    const items = p.purchase_items || [];
    return s + items.filter((i) => i.classification === 'pending').length;
  }, 0);

  return (
    <div>
      {/* Header mit KPI + Upload-CTA */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16, marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ background: '#111827', border: '1px solid #1e293b', borderRadius: 10, padding: '10px 16px' }}>
            <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>Eingangsrechnungen lfd. Jahr</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#e2e8f0', marginTop: 2 }}>{fmtEuro(totalThisYear)}</div>
          </div>
          {pendingCount > 0 && (
            <div style={{ background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.35)', borderRadius: 10, padding: '10px 16px' }}>
              <div style={{ fontSize: 11, color: '#fbbf24', textTransform: 'uppercase', letterSpacing: 0.5 }}>Klassifizierung offen</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#fbbf24', marginTop: 2 }}>{pendingCount} {pendingCount === 1 ? 'Position' : 'Positionen'}</div>
            </div>
          )}
        </div>
        <Link
          href="/admin/einkauf/upload"
          style={{
            background: '#06b6d4',
            color: '#0f172a',
            padding: '10px 20px',
            borderRadius: 10,
            fontSize: 14,
            fontWeight: 700,
            textDecoration: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          📄 Rechnung hochladen (KI-OCR)
        </Link>
      </div>

      {loading && (
        <div style={{ background: '#111827', border: '1px solid #1e293b', borderRadius: 12, padding: 32, textAlign: 'center', color: '#64748b' }}>
          Lade Lieferanten-Rechnungen…
        </div>
      )}

      {error && (
        <div style={{ background: '#111827', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <div style={{ color: '#fca5a5', fontSize: 13, fontWeight: 600 }}>Fehler beim Laden: {error}</div>
        </div>
      )}

      {!loading && !error && purchases.length === 0 && (
        <div style={{ background: '#111827', border: '1px solid #1e293b', borderRadius: 12, padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 14, color: '#94a3b8', marginBottom: 8 }}>Keine Lieferanten-Rechnungen erfasst.</div>
          <div style={{ fontSize: 12, color: '#64748b' }}>Lade die erste Rechnung mit dem KI-OCR-Upload hoch.</div>
        </div>
      )}

      {!loading && !error && purchases.length > 0 && (
        <div style={{ background: '#111827', border: '1px solid #1e293b', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#0f172a', borderBottom: '1px solid #1e293b' }}>
                <th style={{ textAlign: 'left', padding: '10px 14px', color: '#64748b', fontWeight: 600 }}>Datum</th>
                <th style={{ textAlign: 'left', padding: '10px 14px', color: '#64748b', fontWeight: 600 }}>Lieferant</th>
                <th style={{ textAlign: 'left', padding: '10px 14px', color: '#64748b', fontWeight: 600 }}>Rechnung</th>
                <th style={{ textAlign: 'center', padding: '10px 14px', color: '#64748b', fontWeight: 600 }}>Positionen</th>
                <th style={{ textAlign: 'right', padding: '10px 14px', color: '#64748b', fontWeight: 600 }}>Betrag</th>
                <th style={{ textAlign: 'center', padding: '10px 14px', color: '#64748b', fontWeight: 600 }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {purchases.map((p) => {
                const items = p.purchase_items || [];
                const pending = items.filter((i) => i.classification === 'pending').length;
                return (
                  <tr
                    key={p.id}
                    onClick={() => window.location.assign(`/admin/einkauf?id=${p.id}`)}
                    style={{ borderBottom: '1px solid #1e293b30', cursor: 'pointer' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#0f172a80')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '12px 14px', color: '#94a3b8', whiteSpace: 'nowrap' }}>{fmtDateShort(p.order_date)}</td>
                    <td style={{ padding: '12px 14px', color: '#e2e8f0', fontWeight: 600 }}>{p.supplier?.name || '—'}</td>
                    <td style={{ padding: '12px 14px', color: '#06b6d4', fontFamily: 'monospace', fontSize: 12 }}>{p.invoice_number || '—'}</td>
                    <td style={{ padding: '12px 14px', textAlign: 'center', color: '#94a3b8' }}>
                      {items.length}
                      {pending > 0 && (
                        <span style={{ marginLeft: 6, padding: '2px 6px', background: 'rgba(245,158,11,0.18)', color: '#fbbf24', borderRadius: 6, fontSize: 11, fontWeight: 700 }}>
                          {pending} offen
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'right', color: '#e2e8f0', fontVariantNumeric: 'tabular-nums' }}>
                      {p.total_amount != null ? fmtEuro(p.total_amount) : '—'}
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                      <span style={{
                        display: 'inline-block',
                        padding: '3px 8px',
                        background: p.status === 'received' ? 'rgba(16,185,129,0.18)' : 'rgba(6,182,212,0.18)',
                        color: p.status === 'received' ? '#6ee7b7' : '#67e8f9',
                        fontSize: 11,
                        fontWeight: 600,
                        borderRadius: 6,
                      }}>
                        {p.status === 'received' ? 'Erhalten' : p.status === 'ordered' ? 'Bestellt' : p.status || '—'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ marginTop: 16, fontSize: 12, color: '#64748b', textAlign: 'center' }}>
        Detail-Bearbeitung + Lieferantenverwaltung weiterhin unter <Link href="/admin/einkauf" style={{ color: '#06b6d4' }}>/admin/einkauf</Link>
      </div>
    </div>
  );
}
