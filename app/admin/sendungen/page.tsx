'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import AdminBackLink from '@/components/admin/AdminBackLink';

type Category = 'delivered' | 'transit' | 'announced' | 'problem' | 'unknown';
type Direction = 'outbound' | 'return';

interface SendungEntry {
  bookingId: string;
  customerName: string;
  productName: string;
  bookingStatus: string;
  rentalFrom: string;
  rentalTo: string;
  direction: Direction;
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

/** Spalten von links nach rechts: Angekündigt → Unterwegs → Zugestellt → Probleme. */
const COLUMN_ORDER: Category[] = ['announced', 'transit', 'delivered', 'problem'];

/** Sendungen, deren Mietende länger als 4 Wochen zurückliegt, wandern ins Archiv. */
const ARCHIVE_AFTER_DAYS = 28;

const DIR_COLOR: Record<Direction, string> = { outbound: '#06b6d4', return: '#a855f7' };
const DIR_LABEL: Record<Direction, string> = { outbound: '📤 Hinversand', return: '↩ Retoure' };

function fmtDate(iso: string): string {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
}

/** `YYYY-MM-DD` → Zeitstempel auf 12:00 UTC verankert (keine Tagesgrenzen-Verschiebung). */
function parseDayMs(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  if (!m) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
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

type Bucket = Record<Direction, SendungEntry[]>;

export default function SendungenPage() {
  const [entries, setEntries] = useState<SendungEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [carrierFilter, setCarrierFilter] = useState<'' | 'DHL' | 'DPD'>('');
  const [q, setQ] = useState('');
  const [showArchive, setShowArchive] = useState(false);

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

  // Aktiv vs. Archiv trennen (Mietende älter als 4 Wochen = Archiv).
  const { active, archived } = useMemo(() => {
    const cutoff = Date.now() - ARCHIVE_AFTER_DAYS * 86400000;
    const a: SendungEntry[] = [];
    const arch: SendungEntry[] = [];
    for (const e of entries) {
      const end = parseDayMs(e.rentalTo);
      // Ohne verwertbares Mietende bleibt die Sendung sichtbar (nie versehentlich wegräumen).
      if (end !== null && end < cutoff) arch.push(e);
      else a.push(e);
    }
    return { active: a, archived: arch };
  }, [entries]);

  const pool = showArchive ? archived : active;

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return pool.filter((e) => {
      if (carrierFilter && normCarrier(e.carrier) !== carrierFilter) return false;
      if (needle) {
        const hay = `${e.customerName} ${e.productName} ${e.bookingId} ${e.trackingNumber ?? ''}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [pool, carrierFilter, q]);

  // Nach Status-Spalte und darin nach Richtung gruppieren.
  const columns = useMemo(() => {
    const empty = (): Bucket => ({ outbound: [], return: [] });
    const map: Record<Category, Bucket> = {
      announced: empty(), transit: empty(), delivered: empty(), problem: empty(), unknown: empty(),
    };
    for (const e of filtered) map[e.category][e.direction].push(e);

    // Innerhalb einer Sektion: nächster Termin zuerst.
    for (const cat of Object.keys(map) as Category[]) {
      map[cat].outbound.sort((x, y) => (parseDayMs(x.rentalFrom) ?? 0) - (parseDayMs(y.rentalFrom) ?? 0));
      map[cat].return.sort((x, y) => (parseDayMs(x.rentalTo) ?? 0) - (parseDayMs(y.rentalTo) ?? 0));
    }
    return map;
  }, [filtered]);

  // "Unbekannt" bekommt nur eine Spalte, wenn es dort auch Sendungen gibt.
  const visibleColumns = useMemo(() => {
    const cols = [...COLUMN_ORDER];
    if (columns.unknown.outbound.length + columns.unknown.return.length > 0) cols.push('unknown');
    return cols;
  }, [columns]);

  const hasFilter = Boolean(carrierFilter || q);

  return (
    <div style={{ minHeight: '100dvh', background: '#0a0a0a', color: '#e2e8f0', padding: '20px 16px' }}>
      <div style={{ maxWidth: 1500, margin: '0 auto' }}>
        <AdminBackLink />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Paketverfolgung</h1>
            <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 4, marginBottom: 0 }}>
              Live-Status aller Sendungen (DHL/DPD) aus Sendcloud — je Spalte oben Hinversand, unten Retoure.
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

        {/* Filterzeile + Archiv-Umschalter */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8, alignItems: 'center' }}>
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
          <button
            onClick={() => setShowArchive((v) => !v)}
            style={{
              background: showArchive ? '#334155' : '#111827',
              color: showArchive ? '#e2e8f0' : '#94a3b8',
              border: '1px solid #334155', borderRadius: 8, padding: '8px 12px',
              fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >
            {showArchive ? '← Aktuelle Sendungen' : `🗄 Archiv (${archived.length})`}
          </button>
          {hasFilter && (
            <button
              onClick={() => { setCarrierFilter(''); setQ(''); }}
              style={{ background: 'transparent', color: '#94a3b8', border: '1px solid #334155', borderRadius: 8, padding: '8px 12px', fontSize: 13, cursor: 'pointer' }}
            >
              Filter zurücksetzen
            </button>
          )}
        </div>
        <p style={{ fontSize: 11, color: '#64748b', margin: '0 0 16px' }}>
          {showArchive
            ? 'Archiv: Sendungen, deren Mietende länger als 4 Wochen zurückliegt.'
            : 'Sendungen wandern automatisch ins Archiv, sobald das Mietende länger als 4 Wochen zurückliegt.'}
        </p>

        {error && (
          <div style={{ background: '#7f1d1d', color: '#fecaca', borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 13 }}>
            {error}
          </div>
        )}

        {loading ? (
          <p style={{ color: '#94a3b8' }}>Lädt…</p>
        ) : filtered.length === 0 ? (
          <div style={{ background: '#111827', borderRadius: 12, padding: 32, textAlign: 'center', border: '1px solid #1e293b' }}>
            {hasFilter && pool.length > 0 ? (
              <>
                <p style={{ color: '#94a3b8', fontSize: 15, margin: 0 }}>Keine Treffer für die aktiven Filter.</p>
                <p style={{ color: '#64748b', fontSize: 13, marginTop: 8, marginBottom: 12 }}>
                  Es gibt {pool.length} Sendung{pool.length === 1 ? '' : 'en'} — sie passen nur nicht zu deiner Auswahl.
                </p>
                <button
                  onClick={() => { setCarrierFilter(''); setQ(''); }}
                  style={{ background: '#06b6d4', color: '#0a0a0a', fontWeight: 700, fontSize: 13, border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer' }}
                >
                  Filter zurücksetzen
                </button>
              </>
            ) : showArchive ? (
              <>
                <p style={{ color: '#94a3b8', fontSize: 15, margin: 0 }}>Das Archiv ist leer.</p>
                <p style={{ color: '#64748b', fontSize: 13, marginTop: 8, marginBottom: 0 }}>
                  Hier landen Sendungen, deren Mietende länger als 4 Wochen zurückliegt.
                </p>
              </>
            ) : (
              <>
                <p style={{ color: '#94a3b8', fontSize: 15, margin: 0 }}>Keine aktuellen Sendungen.</p>
                <p style={{ color: '#64748b', fontSize: 13, marginTop: 8, marginBottom: 0 }}>
                  Sendungen erscheinen hier, sobald ein Versandetikett (Sendcloud) erstellt wurde.
                  {archived.length > 0 && ` ${archived.length} ältere Sendung${archived.length === 1 ? '' : 'en'} liegen im Archiv.`}
                </p>
              </>
            )}
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(270px, 1fr))',
              gap: 12,
              alignItems: 'start',
            }}
          >
            {visibleColumns.map((cat) => (
              <StatusColumn key={cat} category={cat} bucket={columns[cat]} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Eine Status-Spalte: Kopf mit Zähler, darunter Hinversand (oben) und Retoure (unten). */
function StatusColumn({ category, bucket }: { category: Category; bucket: Bucket }) {
  const color = CAT_COLOR[category];
  const total = bucket.outbound.length + bucket.return.length;

  return (
    <div
      style={{
        background: '#0f172a',
        border: '1px solid #1e293b',
        borderTop: `3px solid ${color}`,
        borderRadius: 12,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
          padding: '10px 12px', borderBottom: '1px solid #1e293b', background: `${color}12`,
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 800, color }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
          {CAT_LABEL[category]}
        </span>
        <span
          style={{
            fontSize: 12, fontWeight: 800, color: '#0a0a0a', background: color,
            borderRadius: 999, padding: '1px 8px', minWidth: 22, textAlign: 'center',
          }}
        >
          {total}
        </span>
      </div>

      <DirectionSection direction="outbound" entries={bucket.outbound} />
      <div style={{ height: 1, background: '#1e293b' }} />
      <DirectionSection direction="return" entries={bucket.return} />
    </div>
  );
}

/** Richtungs-Block innerhalb einer Spalte (Hinversand bzw. Retoure). */
function DirectionSection({ direction, entries }: { direction: Direction; entries: SendungEntry[] }) {
  const color = DIR_COLOR[direction];
  return (
    <div style={{ padding: '10px 10px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color, letterSpacing: 0.3 }}>{DIR_LABEL[direction]}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>{entries.length}</span>
      </div>
      {entries.length === 0 ? (
        <p style={{ fontSize: 11, color: '#475569', margin: 0, padding: '6px 0', textAlign: 'center' }}>—</p>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {entries.map((e, idx) => (
            <SendungCard key={`${e.bookingId}-${e.direction}-${idx}`} entry={e} accent={color} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Kompakte Sendungs-Karte für die Spaltenansicht. */
function SendungCard({ entry: e, accent }: { entry: SendungEntry; accent: string }) {
  const carrier = normCarrier(e.carrier);
  const statusText = e.statusMessage ?? (e.parcelId ? 'Status wird geladen…' : 'Kein Live-Status');

  return (
    <div
      style={{
        background: '#111827',
        border: '1px solid #1e293b',
        borderLeft: `3px solid ${accent}`,
        borderRadius: 8,
        padding: '10px 10px 10px 12px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6, marginBottom: 4 }}>
        <Link
          href={`/admin/buchungen/${e.bookingId}`}
          style={{ color: '#e2e8f0', fontWeight: 700, fontSize: 13, textDecoration: 'none', lineHeight: 1.3 }}
        >
          {e.productName || 'Buchung'}
        </Link>
        {carrier && (
          <span
            style={{
              fontSize: 10, fontWeight: 800, color: carrierColor(carrier), background: `${carrierColor(carrier)}1a`,
              border: `1px solid ${carrierColor(carrier)}40`, padding: '1px 6px', borderRadius: 5,
              whiteSpace: 'nowrap', flexShrink: 0,
            }}
          >
            {carrier}
          </span>
        )}
      </div>

      <div style={{ fontSize: 11, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {e.customerName}
      </div>
      <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>
        {e.bookingId} · {fmtDate(e.rentalFrom)}–{fmtDate(e.rentalTo)}
      </div>
      {e.trackingNumber && (
        <div style={{ fontSize: 10, color: '#475569', marginTop: 3, fontFamily: 'monospace', wordBreak: 'break-all' }}>
          {e.trackingNumber}
        </div>
      )}

      <div style={{ fontSize: 11, color: '#cbd5e1', marginTop: 6 }}>{statusText}</div>
      {e.trackingUrl && (
        <a
          href={e.trackingUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: 11, color: '#06b6d4', textDecoration: 'none', display: 'inline-block', marginTop: 4 }}
        >
          Sendung verfolgen →
        </a>
      )}
    </div>
  );
}
