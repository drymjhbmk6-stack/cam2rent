'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import AdminBackLink from '@/components/admin/AdminBackLink';
import AnlagenTabs from '@/components/admin/AnlagenTabs';
import { fmtEuro } from '@/lib/format-utils';

// ─── Types ──────────────────────────────────────────────────────────────────

type ItemKind = 'camera_unit' | 'accessory_unit' | 'accessory_bulk';
type Source = 'asset_estimate' | 'asset_current' | 'accessory_default' | 'product_deposit' | 'missing';

interface Item {
  row_key: string;
  kind: ItemKind;
  label: string;
  sublabel: string;
  replacement_value: number;
  replacement_source: Source;
  asset_id: string | null;
  editable_target: { type: 'asset' | 'accessory'; id: string } | null;
  qty: number;
  status: string | null;
  searchable: string;
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const card: React.CSSProperties = { background: '#111827', borderRadius: 12, border: '1px solid #1e293b' };
const cyan = '#06b6d4';
const th: React.CSSProperties = { textAlign: 'left', padding: '12px 14px', color: '#64748b', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 };
const td: React.CSSProperties = { padding: '12px 14px', fontSize: 13 };

const KIND_BADGE: Record<ItemKind, { label: string; bg: string; color: string }> = {
  camera_unit:    { label: 'Kamera',          bg: 'rgba(6,182,212,0.15)',  color: '#67e8f9' },
  accessory_unit: { label: 'Zubehör (Stück)', bg: 'rgba(139,92,246,0.15)', color: '#c4b5fd' },
  accessory_bulk: { label: 'Sammel-Zubehör',  bg: 'rgba(168,85,247,0.15)', color: '#d8b4fe' },
};

const SOURCE_HINT: Record<Source, { label: string; color: string }> = {
  asset_estimate:    { label: 'Manuell gesetzt',                color: '#10b981' },
  asset_current:     { label: 'Aus Buchwert',                   color: '#22d3ee' },
  accessory_default: { label: 'Sammel-Wert (Zubehör-Stamm)',    color: '#a78bfa' },
  product_deposit:   { label: 'Aus Kaution (kein Asset)',       color: '#f59e0b' },
  missing:           { label: 'Nicht gesetzt',                  color: '#ef4444' },
};

// ─── Page ───────────────────────────────────────────────────────────────────

export default function WiederbeschaffungsListePage() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterKind, setFilterKind] = useState<string>('');
  const [filterMissing, setFilterMissing] = useState(false);
  const [search, setSearch] = useState('');

  // Edit-Modal
  const [editing, setEditing] = useState<Item | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/wiederbeschaffung');
      if (res.ok) {
        const j = await res.json();
        setItems(j.items ?? []);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((it) => {
      if (filterKind && it.kind !== filterKind) return false;
      if (filterMissing && it.replacement_source !== 'missing') return false;
      if (q && !it.searchable.includes(q)) return false;
      return true;
    });
  }, [items, search, filterKind, filterMissing]);

  const totals = useMemo(() => {
    let sum = 0;
    let missing = 0;
    for (const it of filtered) {
      sum += it.replacement_value * (it.qty || 1);
      if (it.replacement_source === 'missing') missing += 1;
    }
    return { sum, missing, count: filtered.length };
  }, [filtered]);

  function startEdit(it: Item) {
    if (!it.editable_target) return;
    setEditing(it);
    setEditValue(it.replacement_value > 0 ? it.replacement_value.toFixed(2).replace('.', ',') : '');
    setEditError(null);
  }

  async function saveEdit() {
    if (!editing || !editing.editable_target) return;
    const num = parseFloat(editValue.replace(',', '.'));
    if (!Number.isFinite(num) || num < 0) {
      setEditError('Ungültiger Betrag.');
      return;
    }
    setSaving(true);
    setEditError(null);
    try {
      let res: Response;
      if (editing.editable_target.type === 'asset') {
        res = await fetch(`/api/admin/assets/${editing.editable_target.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ replacement_value_estimate: num }),
        });
      } else {
        // Zubehoer: replacement_value via PUT (PUT erwartet vollstaendige Daten — wir
        // schicken nur replacement_value mit, das Backend mergt mit Bestehendem)
        res = await fetch(`/api/admin/accessories/${editing.editable_target.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ replacement_value: num }),
        });
      }
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setEditError(j?.error || `HTTP ${res.status}`);
        return;
      }
      setEditing(null);
      await load();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ minHeight: '100dvh', background: '#0a0f1e', padding: '24px 20px' }}>
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>
        <AdminBackLink />
        <AnlagenTabs pathname="/admin/anlagen/wiederbeschaffung" />

        <div style={{ marginBottom: 24 }}>
          <h1 style={{ color: '#f1f5f9', fontSize: 28, fontWeight: 800, marginBottom: 6 }}>Wiederbeschaffungsliste</h1>
          <p style={{ color: '#94a3b8', fontSize: 14 }}>
            Pro Inventar-Stück (Kamera / Zubehör-Exemplar / Sammel-Zubehör) der aktuelle Wiederbeschaffungswert.
            Greift im Mietvertrag und im Schadensmodul.
          </p>
        </div>

        {/* KPI-Karten */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 20 }}>
          <div style={{ ...card, padding: 20 }}>
            <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Positionen (gefiltert)</div>
            <div style={{ fontSize: 28, color: '#f1f5f9', fontWeight: 800, marginTop: 8 }}>{totals.count}</div>
          </div>
          <div style={{ ...card, padding: 20 }}>
            <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Wiederbeschaffung (Total)</div>
            <div style={{ fontSize: 28, color: cyan, fontWeight: 800, marginTop: 8 }}>{fmtEuro(totals.sum)}</div>
          </div>
          <div
            style={{ ...card, padding: 20, cursor: 'pointer' }}
            onClick={() => setFilterMissing(!filterMissing)}
            title="Klicken: nur Positionen ohne gesetzten Wert zeigen"
          >
            <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Werte fehlen{filterMissing ? ' · aktiv' : ''}
            </div>
            <div style={{ fontSize: 28, color: totals.missing > 0 ? '#ef4444' : '#22c55e', fontWeight: 800, marginTop: 8 }}>{totals.missing}</div>
          </div>
        </div>

        {/* Filter */}
        <div style={{ ...card, padding: 16, marginBottom: 20 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <input
              type="text"
              placeholder="Suche (Name, Seriennummer, Code)…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ flex: '1 1 240px', background: '#0a0f1e', border: '1px solid #1e293b', borderRadius: 8, padding: '10px 12px', color: '#e2e8f0', fontSize: 14 }}
            />
            <select value={filterKind} onChange={(e) => setFilterKind(e.target.value)} style={{ background: '#0a0f1e', border: '1px solid #1e293b', borderRadius: 8, padding: '10px 12px', color: '#e2e8f0', fontSize: 14 }}>
              <option value="">Alle Arten</option>
              <option value="camera_unit">Kamera-Exemplare</option>
              <option value="accessory_unit">Zubehör-Exemplare</option>
              <option value="accessory_bulk">Sammel-Zubehör</option>
            </select>
          </div>
        </div>

        {/* Liste */}
        <div style={{ ...card, overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>Lade Inventar-Werte…</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>
              Keine Treffer. Filter zurücksetzen oder Inventar unter <Link href="/admin/anlagen/nachtragen" style={{ color: cyan }}>Bestand nachtragen</Link>.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', minWidth: 980, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#0a0f1e' }}>
                    <th style={th}>Bezeichnung</th>
                    <th style={th}>Art</th>
                    <th style={{ ...th, textAlign: 'right' }}>Menge</th>
                    <th style={{ ...th, textAlign: 'right' }}>Wert / Stück</th>
                    <th style={{ ...th, textAlign: 'right' }}>Total</th>
                    <th style={th}>Quelle</th>
                    <th style={{ ...th, textAlign: 'right' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((it) => {
                    const badge = KIND_BADGE[it.kind];
                    const src = SOURCE_HINT[it.replacement_source];
                    const total = it.replacement_value * (it.qty || 1);
                    return (
                      <tr key={it.row_key} style={{ borderTop: '1px solid #1e293b' }}>
                        <td style={td}>
                          <div style={{ color: '#e2e8f0', fontWeight: 600 }}>{it.label}</div>
                          <div style={{ color: '#64748b', fontSize: 11, marginTop: 2 }}>{it.sublabel}</div>
                        </td>
                        <td style={td}>
                          <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: badge.bg, color: badge.color }}>
                            {badge.label}
                          </span>
                        </td>
                        <td style={{ ...td, textAlign: 'right', color: '#94a3b8' }}>{it.qty}</td>
                        <td style={{ ...td, textAlign: 'right', color: it.replacement_source === 'missing' ? '#ef4444' : '#e2e8f0', fontWeight: 600 }}>
                          {it.replacement_value > 0 ? fmtEuro(it.replacement_value) : '—'}
                        </td>
                        <td style={{ ...td, textAlign: 'right', color: cyan, fontWeight: 700 }}>
                          {total > 0 ? fmtEuro(total) : '—'}
                        </td>
                        <td style={td}>
                          <span style={{ fontSize: 11, color: src.color, fontWeight: 600 }}>{src.label}</span>
                        </td>
                        <td style={{ ...td, textAlign: 'right' }}>
                          {it.editable_target ? (
                            <button
                              onClick={() => startEdit(it)}
                              style={{ background: 'transparent', border: '1px solid #06b6d4', color: '#06b6d4', borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
                            >
                              Bearbeiten
                            </button>
                          ) : (
                            <Link
                              href="/admin/anlagen/nachtragen"
                              style={{ color: '#f59e0b', fontSize: 11, fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap' }}
                            >
                              Asset anlegen →
                            </Link>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Edit-Modal */}
        {editing && (
          <div
            onClick={() => !saving && setEditing(null)}
            style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 20,
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{ ...card, padding: 24, maxWidth: 480, width: '100%' }}
            >
              <h2 style={{ color: '#f1f5f9', fontSize: 18, fontWeight: 700, marginBottom: 6 }}>
                Wiederbeschaffungswert bearbeiten
              </h2>
              <div style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>
                <strong style={{ color: '#e2e8f0' }}>{editing.label}</strong>
                <div style={{ fontSize: 11, marginTop: 2, color: '#64748b' }}>{editing.sublabel}</div>
              </div>

              {editing.editable_target?.type === 'accessory' && (
                <div style={{
                  background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)',
                  borderRadius: 8, padding: '8px 12px', marginBottom: 14,
                  fontSize: 12, color: '#fde68a', lineHeight: 1.5,
                }}>
                  &#9888; Du &auml;nderst den <strong>Sammel-Wert</strong> f&uuml;r ALLE Exemplare dieses Zubeh&ouml;rs ohne eigene Anlage. Wenn du nur dieses eine St&uuml;ck anders bewerten willst, lege erst eine Anlage &uuml;ber &bdquo;Bestand nachtragen&ldquo; an.
                </div>
              )}

              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Wiederbeschaffungswert (€ pro Stück)
              </label>
              <input
                autoFocus
                inputMode="decimal"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !saving) saveEdit();
                  if (e.key === 'Escape' && !saving) setEditing(null);
                }}
                style={{ background: '#0a0f1e', border: '1px solid #1e293b', borderRadius: 8, padding: '10px 12px', color: '#e2e8f0', fontSize: 16, width: '100%' }}
                placeholder="0,00"
              />

              {editError && <div style={{ color: '#fca5a5', fontSize: 12, marginTop: 8 }}>{editError}</div>}

              <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setEditing(null)}
                  disabled={saving}
                  style={{ background: 'transparent', color: '#94a3b8', fontWeight: 600, fontSize: 13, padding: '10px 18px', borderRadius: 8, border: '1px solid #1e293b', cursor: 'pointer' }}
                >
                  Abbrechen
                </button>
                <button
                  onClick={saveEdit}
                  disabled={saving}
                  style={{ background: cyan, color: '#0f172a', fontWeight: 700, fontSize: 13, padding: '10px 18px', borderRadius: 8, border: 'none', cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1 }}
                >
                  {saving ? 'Speichert…' : 'Speichern'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
