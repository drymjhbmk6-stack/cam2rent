'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import AdminBackLink from '@/components/admin/AdminBackLink';

type Category = 'delivered' | 'transit' | 'announced' | 'problem' | 'unknown';

interface SendungEntry {
  bookingId: string;
  customerName: string;
  productName: string;
  bookingStatus: string;
  rentalFrom: string;
  rentalTo: string;
  direction: 'outbound' | 'return';
  carrier: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  parcelId: number | null;
  statusMessage: string | null;
  category: Category;
}

const CAT_COLOR: Record<Category, string> = {
  delivered: '#10b981',
  transit: '#3b82f6',
  announced: '#94a3b8',
  problem: '#ef4444',
  unknown: '#64748b',
};

const CAT_LABEL: Record<Category, string> = {
  delivered: 'Zugestellt',
  transit: 'Unterwegs',
  announced: 'Angekündigt',
  problem: 'Problem',
  unknown: 'Unbekannt',
};

function fmtDate(iso: string): string {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
}

function normCarrier(c: string | null): string {
  if (!c) return '';
  const u = c.toUpperCase();
  if (u.includes('DHL')) return 'DHL';
  if (u.includes('DPD')) return 'DPD';
  return u;
}

function carrierColor(c: string): string {
  if (c === 'DHL') return '#f59e0b';
  if (c === 'DPD') return '#dc2626';
  return '#64748b';
}

export default function SendungenPage() {
  const [entries, setEntries] = useState<SendungEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [carrierFilter, setCarrierFilter] = useState<'' | 'DHL' | 'DPD'>('');
  const [catFilter, setCatFilter] = useState<'' | Category>('');
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/sendungen');
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      setEntries(Array.isArray(json.entries) ? json.entries : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fehler beim Laden.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const counts = useMemo(() => {
    const c: Record<Category, number> = { delivered: 0, transit: 0, announced: 0, problem: 0, unknown: 0 };
    for (const e of entries) c[e.category]++;
    return c;
  }, [entries]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return entries.filter((e) => {
      if (carrierFilter && normCarrier(e.carrier) !== carrierFilter) return false;
      if (catFilter && e.category !== catFilter) return false;
      if (needle) {
        const hay = `${e.customerName} ${e.productName} ${e.bookingId} ${e.trackingNumber ?? ''}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [entries, carrierFilter, catFilter, q]);

  return (
    <div style={{ minHeight: '100dvh', background: '#0a0a0a', color: '#e2e8f0', padding: '20px 16px' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <AdminBackLink />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Paketverfolgung</h1>
            <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 4, marginBottom: 0 }}>
              Live-Status aller Sendungen (DHL/DPD) aus Sendcloud — Hin- und Rückversand.
            </p>
          </div>
          <button
            onClick={load}
            disabled={loading}
            style={{
              background: '#06b6d4', color: '#0a0a0a', fontWeight: 700, fontSize: 13,
              border: 'none', borderRadius: 8, padding: '8px 16px', cursor: loading ? 'default' : 'pointer',
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? 'Lädt…' : '↻ Aktualisieren'}
          </button>
        </div>

        {/* Status-Kacheln (klickbar als Filter) */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          {([
            'transit', 'announced', 'problem', 'delivered',
            ...(counts.unknown > 0 ? ['unknown' as Category] : []),
          ] as Category[]).map((cat) => (
            <button
              key={cat}
              onClick={() => setCatFilter(catFilter === cat ? '' : cat)}
              style={{
                background: catFilter === cat ? CAT_COLOR[cat] : '#111827',
                color: catFilter === cat ? '#0a0a0a' : CAT_COLOR[cat],
                border: `1px solid ${CAT_COLOR[cat]}55`, borderRadius: 10, padding: '8px 14px',
                cursor: 'pointer', fontSize: 13, fontWeight: 700, display: 'flex', gap: 8, alignItems: 'center',
              }}
            >
              {CAT_LABEL[cat]}
              <span style={{ fontWeight: 800 }}>{counts[cat]}</span>
            </button>
          ))}
        </div>

        {/* Filterzeile */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Suche: Kunde, Produkt, Buchung, Tracking…"
            style={{
              flex: '1 1 240px', background: '#111827', border: '1px solid #1e293b', color: '#e2e8f0',
              borderRadius: 8, padding: '8px 12px', fontSize: 14,
            }}
          />
          <select
            value={carrierFilter}
            onChange={(e) => setCarrierFilter(e.target.value as '' | 'DHL' | 'DPD')}
            style={{ background: '#111827', border: '1px solid #1e293b', color: '#e2e8f0', borderRadius: 8, padding: '8px 12px', fontSize: 14 }}
          >
            <option value="">Alle Carrier</option>
            <option value="DHL">DHL</option>
            <option value="DPD">DPD</option>
          </select>
          {(catFilter || carrierFilter || q) && (
            <button
              onClick={() => { setCatFilter(''); setCarrierFilter(''); setQ(''); }}
              style={{ background: 'transparent', color: '#94a3b8', border: '1px solid #334155', borderRadius: 8, padding: '8px 12px', fontSize: 13, cursor: 'pointer' }}
            >
              Filter zurücksetzen
            </button>
          )}
        </div>

        {error && (
          <div style={{ background: '#7f1d1d', color: '#fecaca', borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 13 }}>
            {error}
          </div>
        )}

        {loading ? (
          <p style={{ color: '#94a3b8' }}>Lädt…</p>
        ) : filtered.length === 0 ? (
          <div style={{ background: '#111827', borderRadius: 12, padding: 32, textAlign: 'center', border: '1px solid #1e293b' }}>
            <p style={{ color: '#94a3b8', fontSize: 15, margin: 0 }}>Keine Sendungen gefunden.</p>
            <p style={{ color: '#64748b', fontSize: 13, marginTop: 8, marginBottom: 0 }}>
              Sendungen erscheinen hier, sobald ein Versandetikett (Sendcloud) erstellt wurde.
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {filtered.map((e, idx) => {
              const carrier = normCarrier(e.carrier);
              const dirLabel = e.direction === 'outbound' ? 'Hinversand' : 'Retoure';
              const dirColor = e.direction === 'outbound' ? '#06b6d4' : '#a855f7';
              const statusText = e.statusMessage ?? (e.parcelId ? 'Status wird geladen…' : 'Kein Live-Status');
              return (
                <div
                  key={`${e.bookingId}-${e.direction}-${idx}`}
                  style={{
                    background: '#111827', border: '1px solid #1e293b', borderLeft: `3px solid ${CAT_COLOR[e.category]}`,
                    borderRadius: 10, padding: '14px 16px',
                    display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap',
                  }}
                >
                  <div style={{ minWidth: 0, flex: '1 1 240px' }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
                      <Link href={`/admin/buchungen/${e.bookingId}`} style={{ color: '#e2e8f0', fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>
                        {e.productName || 'Buchung'}
                      </Link>
                      <span style={{ fontSize: 11, fontWeight: 700, color: dirColor, background: `${dirColor}1a`, border: `1px solid ${dirColor}40`, padding: '2px 8px', borderRadius: 6 }}>
                        {dirLabel}
                      </span>
                      {carrier && (
                        <span style={{ fontSize: 11, fontWeight: 800, color: carrierColor(carrier), background: `${carrierColor(carrier)}1a`, border: `1px solid ${carrierColor(carrier)}40`, padding: '2px 8px', borderRadius: 6 }}>
                          {carrier}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {e.customerName} · {e.bookingId} · {fmtDate(e.rentalFrom)}–{fmtDate(e.rentalTo)}
                    </div>
                    {e.trackingNumber && (
                      <div style={{ fontSize: 12, color: '#64748b', marginTop: 2, fontFamily: 'monospace' }}>
                        {e.trackingNumber}
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: CAT_COLOR[e.category], background: `${CAT_COLOR[e.category]}1a`, border: `1px solid ${CAT_COLOR[e.category]}40`, padding: '4px 10px', borderRadius: 8, whiteSpace: 'nowrap' }}>
                      {CAT_LABEL[e.category]}
                    </span>
                    <span style={{ fontSize: 12, color: '#cbd5e1', maxWidth: 220, textAlign: 'right' }}>{statusText}</span>
                    {e.trackingUrl && (
                      <a href={e.trackingUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: '#06b6d4', textDecoration: 'none' }}>
                        Sendung verfolgen →
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
