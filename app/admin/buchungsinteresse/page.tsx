'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import AdminBackLink from '@/components/admin/AdminBackLink';

interface RankItem { id: string; name: string; count: number }
interface BucketItem { bucket: string; count: number }
interface ModeItem { mode: string; count: number }
interface HaftungItem { option: string; count: number }

interface RangeInfo {
  mode: 'custom' | 'hours' | 'days';
  days?: number;
  hours?: number;
  from?: string;
  to?: string;
}

interface InterestData {
  total: number;
  range?: RangeInfo;
  days?: number;
  cameras: RankItem[];
  accessories: RankItem[];
  sets: RankItem[];
  duration: BucketItem[];
  delivery: ModeItem[];
  haftung: HaftungItem[];
  migration_pending?: boolean;
}

type PresetKey = '24h' | '7d' | '30d' | '90d';

const PRESETS: { key: PresetKey; label: string; query: string }[] = [
  { key: '24h', label: '24 Stunden', query: 'hours=24' },
  { key: '7d',  label: '7 Tage',     query: 'days=7' },
  { key: '30d', label: '30 Tage',    query: 'days=30' },
  { key: '90d', label: '90 Tage',    query: 'days=90' },
];

const DURATION_LABEL: Record<string, string> = {
  '1': '1 Tag',
  '2-3': '2–3 Tage',
  '4-7': '4–7 Tage',
  '8-14': '8–14 Tage',
  '15-30': '15–30 Tage',
  '30+': 'über 30 Tage',
};

const HAFTUNG_LABEL: Record<string, string> = {
  premium: 'Premium-Haftungsschutz',
  standard: 'Standard-Haftungsschutz',
  none: 'Ohne Haftungsschutz',
};

function todayBerlin(): string {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' });
  return fmt.format(new Date());
}

function fmtDateDE(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return `${m[3]}.${m[2]}.${m[1]}`;
}

function rangeHeadline(r: RangeInfo | undefined, fallbackDays: number | undefined): string {
  if (!r) return fallbackDays ? `letzte ${fallbackDays} Tage` : '';
  if (r.mode === 'hours' && r.hours) {
    return r.hours === 24 ? 'letzte 24 Stunden' : `letzte ${r.hours} Stunden`;
  }
  if (r.mode === 'custom' && r.from && r.to) {
    return r.from === r.to ? fmtDateDE(r.from) : `${fmtDateDE(r.from)} – ${fmtDateDE(r.to)}`;
  }
  if (r.days) return `letzte ${r.days} Tage`;
  return '';
}

function RankTable({ title, items, unit }: { title: string; items: RankItem[]; unit: string }) {
  const max = items.reduce((m, i) => Math.max(m, i.count), 0) || 1;
  return (
    <div style={{ background: '#111827', borderRadius: 12, padding: 16, border: '1px solid #1e293b' }}>
      <h2 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 12px' }}>{title}</h2>
      {items.length === 0 ? (
        <p style={{ color: '#64748b', fontSize: 13, margin: 0 }}>Keine Daten im Zeitraum.</p>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {items.map((it, idx) => (
            <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 22, color: '#64748b', fontSize: 12, textAlign: 'right', flexShrink: 0 }}>{idx + 1}.</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.name}</span>
                  <span style={{ fontSize: 13, color: '#06b6d4', fontWeight: 700, flexShrink: 0 }}>{it.count}× {unit}</span>
                </div>
                <div style={{ height: 6, background: '#1e293b', borderRadius: 999, marginTop: 4, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${(it.count / max) * 100}%`, background: '#06b6d4', borderRadius: 999 }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BarRow({ label, count, max }: { label: string; count: number; max: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ width: 140, fontSize: 13, color: '#cbd5e1', flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, height: 18, background: '#1e293b', borderRadius: 6, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${max > 0 ? (count / max) * 100 : 0}%`, background: '#0891b2', borderRadius: 6 }} />
      </div>
      <span style={{ width: 44, textAlign: 'right', fontSize: 13, fontWeight: 700, color: '#e2e8f0', flexShrink: 0 }}>{count}</span>
    </div>
  );
}

export default function BuchungsinteressePage() {
  const [data, setData] = useState<InterestData | null>(null);
  const [loading, setLoading] = useState(true);

  // Zeitraum-State: entweder ein Preset ODER ein freier Zeitraum.
  const [mode, setMode] = useState<'preset' | 'custom'>('preset');
  const [preset, setPreset] = useState<PresetKey>('30d');
  const today = useMemo(() => todayBerlin(), []);
  const thirtyDaysAgo = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 29);
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  }, []);
  const [customFrom, setCustomFrom] = useState(thirtyDaysAgo);
  const [customTo, setCustomTo] = useState(today);
  // Was wurde zuletzt geladen (verhindert dass jede Tasteneingabe in den
  // Datumsfeldern direkt einen Reload triggert — Anwenden-Button steuert das).
  const [appliedQuery, setAppliedQuery] = useState<string>('days=30');

  const customValid = !!customFrom && !!customTo && customFrom <= customTo;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/booking-interest?${appliedQuery}`);
      if (res.ok) setData(await res.json());
      else setData(null);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [appliedQuery]);

  useEffect(() => { load(); }, [load]);

  function applyPreset(p: PresetKey) {
    setMode('preset');
    setPreset(p);
    const item = PRESETS.find((x) => x.key === p);
    if (item) setAppliedQuery(item.query);
  }

  function applyCustom() {
    if (!customValid) return;
    setMode('custom');
    setAppliedQuery(`from=${customFrom}&to=${customTo}`);
  }

  const durationMax = data ? data.duration.reduce((m, d) => Math.max(m, d.count), 0) : 0;
  const deliveryMax = data ? data.delivery.reduce((m, d) => Math.max(m, d.count), 0) : 0;
  const haftungMax = data ? data.haftung.reduce((m, d) => Math.max(m, d.count), 0) : 0;
  const headline = rangeHeadline(data?.range, data?.days);

  return (
    <div style={{ minHeight: '100dvh', background: '#0a0a0a', color: '#e2e8f0', padding: '20px 16px' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <AdminBackLink />
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Buchungsinteresse</h1>
            <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 4, marginBottom: 0 }}>
              Anonyme Auswertung: welche Kamera, welches Zubehör und welcher Mietzeitraum im Buchungsprozess konfiguriert wurden (erfasst beim Erreichen der Zusammenfassung — ohne Kundendaten).
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {PRESETS.map((p) => {
                const active = mode === 'preset' && preset === p.key;
                return (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => applyPreset(p.key)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 8,
                      border: '1px solid #1e293b',
                      background: active ? '#06b6d4' : '#111827',
                      color: active ? '#0a0a0a' : '#cbd5e1',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    {p.label}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setMode((m) => m === 'custom' ? 'preset' : 'custom')}
                style={{
                  padding: '6px 12px',
                  borderRadius: 8,
                  border: '1px solid #1e293b',
                  background: mode === 'custom' ? '#06b6d4' : '#111827',
                  color: mode === 'custom' ? '#0a0a0a' : '#cbd5e1',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Eigener Zeitraum
              </button>
            </div>
            {mode === 'custom' && (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <input
                  type="date"
                  value={customFrom}
                  max={customTo || today}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  style={{
                    padding: '6px 10px',
                    background: '#111827',
                    border: '1px solid #334155',
                    borderRadius: 8,
                    color: '#e2e8f0',
                    fontSize: 13,
                    colorScheme: 'dark',
                  }}
                />
                <span style={{ fontSize: 13, color: '#64748b' }}>bis</span>
                <input
                  type="date"
                  value={customTo}
                  min={customFrom}
                  max={today}
                  onChange={(e) => setCustomTo(e.target.value)}
                  style={{
                    padding: '6px 10px',
                    background: '#111827',
                    border: '1px solid #334155',
                    borderRadius: 8,
                    color: '#e2e8f0',
                    fontSize: 13,
                    colorScheme: 'dark',
                  }}
                />
                <button
                  type="button"
                  onClick={applyCustom}
                  disabled={!customValid}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 8,
                    border: 'none',
                    background: customValid ? '#10b981' : '#1e293b',
                    color: customValid ? '#0a0a0a' : '#64748b',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: customValid ? 'pointer' : 'not-allowed',
                  }}
                >
                  Anwenden
                </button>
              </div>
            )}
          </div>
        </div>

        {loading ? (
          <p style={{ color: '#94a3b8' }}>Lädt…</p>
        ) : !data ? (
          <p style={{ color: '#f87171' }}>Fehler beim Laden.</p>
        ) : data.migration_pending ? (
          <div style={{ background: '#111827', borderRadius: 12, padding: 32, textAlign: 'center', border: '1px solid #7f1d1d' }}>
            <p style={{ color: '#fca5a5', fontSize: 16, fontWeight: 700, margin: 0 }}>Migration ausstehend</p>
            <p style={{ color: '#94a3b8', fontSize: 13, marginTop: 8, marginBottom: 0 }}>
              Die Tabelle <code>booking_interest</code> existiert noch nicht. Migration <code>supabase/supabase-booking-interest.sql</code> ausführen, danach werden hier die Daten angezeigt.
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 16 }}>
            <div style={{ background: '#111827', borderRadius: 12, padding: 16, border: '1px solid #1e293b' }}>
              <p style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, margin: 0 }}>
                Konfigurationen{headline ? ` — ${headline}` : ''}
              </p>
              <p style={{ fontSize: 32, fontWeight: 800, color: '#06b6d4', margin: '4px 0 0' }}>{data.total}</p>
            </div>

            <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
              <RankTable title="Gefragteste Kameras" items={data.cameras} unit="" />
              <RankTable title="Gefragtestes Zubehör" items={data.accessories} unit="Stück" />
            </div>

            {data.sets.length > 0 && (
              <RankTable title="Gefragteste Sets" items={data.sets} unit="" />
            )}

            <div style={{ background: '#111827', borderRadius: 12, padding: 16, border: '1px solid #1e293b' }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 12px' }}>Mietdauer-Verteilung</h2>
              <div style={{ display: 'grid', gap: 8 }}>
                {data.duration.map((d) => (
                  <BarRow key={d.bucket} label={DURATION_LABEL[d.bucket] ?? d.bucket} count={d.count} max={durationMax} />
                ))}
              </div>
            </div>

            <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
              <div style={{ background: '#111827', borderRadius: 12, padding: 16, border: '1px solid #1e293b' }}>
                <h2 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 12px' }}>Lieferart</h2>
                <div style={{ display: 'grid', gap: 8 }}>
                  {data.delivery.map((d) => (
                    <BarRow key={d.mode} label={d.mode === 'versand' ? 'Versand' : 'Abholung'} count={d.count} max={deliveryMax} />
                  ))}
                </div>
              </div>
              <div style={{ background: '#111827', borderRadius: 12, padding: 16, border: '1px solid #1e293b' }}>
                <h2 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 12px' }}>Haftungsschutz</h2>
                <div style={{ display: 'grid', gap: 8 }}>
                  {data.haftung.map((h) => (
                    <BarRow key={h.option} label={HAFTUNG_LABEL[h.option] ?? h.option} count={h.count} max={haftungMax} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
