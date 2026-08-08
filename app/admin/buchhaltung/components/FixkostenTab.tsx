'use client';

import { useState, useEffect, useMemo } from 'react';
import { fmtEuro } from '@/lib/format-utils';

/**
 * Fixkosten-Übersicht (Stand 2026-08-08)
 *
 * Reine ÜBERSICHT der fixen (wiederkehrenden) Betriebskosten — z.B. Server,
 * Software-Abos, Versicherungen, Domain. KEINE Verrechnung nach irgendwohin:
 * fließt NICHT in EÜR, DATEV, Cockpit-KPIs oder Ausgaben ein. Dient nur dazu,
 * dass der Admin auf einen Blick sieht, was monatlich/jährlich fix anfällt.
 *
 * Persistenz: admin_settings-Key `fixkosten` (JSON-Array, generischer
 * Settings-Endpoint). Keine Migration nötig.
 *
 * UI (Stand 2026-08-08, „smarter"): saubere Lese-Liste gruppiert nach Kategorie
 * mit Zwischensummen, kompakte Summen-Karte + Verteilungs-Balken, Bearbeiten/
 * Löschen erst per Antippen (Read-/Edit-Toggle pro Position).
 */

type Interval = 'monatlich' | 'quartalsweise' | 'jaehrlich';

interface Fixkost {
  id: string;
  label: string;
  amount: number;
  interval: Interval;
  category: string;
  note: string;
}

const INTERVAL_LABELS: Record<Interval, string> = {
  monatlich: 'monatlich',
  quartalsweise: 'quartalsweise',
  jaehrlich: 'jährlich',
};

// Faktor: Wert × Faktor = Betrag pro Monat
const MONTHLY_FACTOR: Record<Interval, number> = {
  monatlich: 1,
  quartalsweise: 1 / 3,
  jaehrlich: 1 / 12,
};

const CATEGORY_SUGGESTIONS = [
  'Miete / Lager',
  'Server / Hosting',
  'Software / Abos',
  'Versicherung',
  'Telefon / Internet',
  'KFZ',
  'Personal',
  'Bank / Gebühren',
  'Marketing',
  'Sonstiges',
];

const NO_CATEGORY = 'Ohne Kategorie';

// Farbpalette für die Kategorie-Verteilung (dark-navy-tauglich)
const CAT_COLORS = ['#06b6d4', '#a855f7', '#f59e0b', '#10b981', '#f43f5e', '#3b82f6', '#14b8a6', '#fb923c'];
const NO_CATEGORY_COLOR = '#64748b';

function newId(): string {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch { /* ignore */ }
  return `fk-${Math.random().toString(36).slice(2, 10)}`;
}

function parseAmount(raw: string): number {
  const cleaned = raw.replace(/\./g, '').replace(',', '.').replace(/[^0-9.]/g, '');
  const n = parseFloat(cleaned);
  return isFinite(n) && n > 0 ? n : 0;
}

function perMonthOf(it: Fixkost): number {
  return it.amount * MONTHLY_FACTOR[it.interval];
}

function sanitizeLoaded(value: unknown): Fixkost[] {
  let arr: unknown = value;
  if (typeof arr === 'string') {
    try { arr = JSON.parse(arr); } catch { arr = null; }
  }
  if (!Array.isArray(arr)) return [];
  return arr.map((raw) => {
    const r = (raw ?? {}) as Record<string, unknown>;
    const interval: Interval =
      r.interval === 'jaehrlich' || r.interval === 'quartalsweise' ? r.interval : 'monatlich';
    const amount = typeof r.amount === 'number' && isFinite(r.amount) ? Math.max(0, r.amount) : 0;
    return {
      id: typeof r.id === 'string' && r.id ? r.id : newId(),
      label: typeof r.label === 'string' ? r.label : '',
      amount,
      interval,
      category: typeof r.category === 'string' ? r.category : '',
      note: typeof r.note === 'string' ? r.note : '',
    };
  });
}

export default function FixkostenTab() {
  const [items, setItems] = useState<Fixkost[]>([]);
  const [initial, setInitial] = useState<string>('[]');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);
  // Welche Positionen gerade im Bearbeiten-Modus sind
  const [editIds, setEditIds] = useState<Set<string>>(new Set());
  // amount-Rohtext pro Zeile (damit Komma-Eingabe nicht springt)
  const [amountText, setAmountText] = useState<Record<string, string>>({});

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/admin/settings?key=fixkosten');
        if (res.ok) {
          const d = await res.json();
          const parsed = sanitizeLoaded(d.value);
          setItems(parsed);
          setInitial(JSON.stringify(parsed));
          setAmountText(
            Object.fromEntries(parsed.map((p) => [p.id, p.amount ? String(p.amount).replace('.', ',') : '']))
          );
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  function showToast(msg: string, type: 'ok' | 'err') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }

  const dirty = useMemo(() => JSON.stringify(items) !== initial, [items, initial]);

  const monthlyTotal = useMemo(() => items.reduce((sum, it) => sum + perMonthOf(it), 0), [items]);
  const yearlyTotal = monthlyTotal * 12;

  // Gruppierung nach Kategorie inkl. Zwischensummen + Farbe
  const groups = useMemo(() => {
    const map = new Map<string, { key: string; label: string; monthly: number; items: Fixkost[] }>();
    for (const it of items) {
      const label = it.category.trim() || NO_CATEGORY;
      const g = map.get(label) ?? { key: label, label, monthly: 0, items: [] };
      g.monthly += perMonthOf(it);
      g.items.push(it);
      map.set(label, g);
    }
    const arr = Array.from(map.values());
    // Innerhalb Gruppe: teuerste zuerst
    arr.forEach((g) => g.items.sort((a, b) => perMonthOf(b) - perMonthOf(a)));
    // Gruppen: höchste Zwischensumme zuerst, "Ohne Kategorie" ans Ende
    arr.sort((a, b) => {
      if (a.label === NO_CATEGORY) return 1;
      if (b.label === NO_CATEGORY) return -1;
      return b.monthly - a.monthly;
    });
    // Farbe pro benannter Kategorie
    let ci = 0;
    const colors = new Map<string, string>();
    for (const g of arr) {
      colors.set(g.key, g.label === NO_CATEGORY ? NO_CATEGORY_COLOR : CAT_COLORS[ci++ % CAT_COLORS.length]);
    }
    return { arr, colors };
  }, [items]);

  function updateItem(id: string, patch: Partial<Fixkost>) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  function addItem() {
    const it: Fixkost = { id: newId(), label: '', amount: 0, interval: 'monatlich', category: '', note: '' };
    setItems((prev) => [...prev, it]);
    setAmountText((prev) => ({ ...prev, [it.id]: '' }));
    setEditIds((prev) => new Set(prev).add(it.id));
    // kurz warten, dann zur neuen Zeile scrollen
    setTimeout(() => {
      document.getElementById(`fk-${it.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 60);
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((it) => it.id !== id));
    setEditIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
    setAmountText((prev) => { const n = { ...prev }; delete n[id]; return n; });
  }

  function toggleEdit(id: string, on: boolean) {
    setEditIds((prev) => { const n = new Set(prev); if (on) n.add(id); else n.delete(id); return n; });
  }

  async function handleSave() {
    // Leere Positionen (kein Name UND kein Betrag) beim Speichern verwerfen
    const cleaned = items.filter((it) => it.label.trim() || it.amount > 0);
    setSaving(true);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'fixkosten', value: cleaned }),
      });
      if (!res.ok) throw new Error('save failed');
      setItems(cleaned);
      setInitial(JSON.stringify(cleaned));
      setEditIds(new Set());
      setAmountText(
        Object.fromEntries(cleaned.map((p) => [p.id, p.amount ? String(p.amount).replace('.', ',') : '']))
      );
      showToast('Fixkosten gespeichert', 'ok');
    } catch {
      showToast('Speichern fehlgeschlagen', 'err');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>Fixkosten laden...</div>;
  }

  const hasValues = monthlyTotal > 0;

  return (
    <div style={{ maxWidth: 820, paddingBottom: 80 }}>
      {toast && (
        <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 999, padding: '12px 20px', borderRadius: 8, background: toast.type === 'ok' ? '#10b981' : '#ef4444', color: '#fff', fontWeight: 600, fontSize: 14 }}>
          {toast.msg}
        </div>
      )}

      {/* Hinweis: reine Übersicht */}
      <div style={{ marginBottom: 20, padding: 12, background: 'rgba(6,182,212,0.06)', border: '1px solid rgba(6,182,212,0.18)', borderRadius: 8 }}>
        <p style={{ color: '#94a3b8', fontSize: 13, lineHeight: 1.6, margin: 0 }}>
          Deine <strong style={{ color: '#e2e8f0' }}>fixen Betriebskosten</strong> auf einen Blick.
          Reine Übersicht — fließt <strong style={{ color: '#e2e8f0' }}>nicht</strong> in EÜR, DATEV,
          Berichte oder Ausgaben ein.
        </p>
      </div>

      {/* Kompakte Summen-Karte + Verteilung */}
      <div style={{ background: '#111827', border: '1px solid #1e293b', borderRadius: 12, padding: 20, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
              Fixkosten pro Monat
            </div>
            <div style={{ fontSize: 34, fontWeight: 800, color: '#e2e8f0', lineHeight: 1 }}>{fmtEuro(monthlyTotal)}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>pro Jahr</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#a855f7', lineHeight: 1 }}>{fmtEuro(yearlyTotal)}</div>
          </div>
        </div>

        {/* Verteilungs-Balken nach Kategorie */}
        {hasValues && (
          <div style={{ marginTop: 18 }}>
            <div style={{ display: 'flex', height: 10, borderRadius: 6, overflow: 'hidden', background: '#0f172a' }}>
              {groups.arr.filter((g) => g.monthly > 0).map((g) => (
                <div
                  key={g.key}
                  title={`${g.label}: ${fmtEuro(g.monthly)} / Monat`}
                  style={{ width: `${(g.monthly / monthlyTotal) * 100}%`, background: groups.colors.get(g.key), minWidth: 3 }}
                />
              ))}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', marginTop: 12 }}>
              {groups.arr.filter((g) => g.monthly > 0).map((g) => (
                <div key={g.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#94a3b8' }}>
                  <span style={{ width: 9, height: 9, borderRadius: 3, background: groups.colors.get(g.key), display: 'inline-block' }} />
                  <span style={{ color: '#cbd5e1' }}>{g.label}</span>
                  <span style={{ color: '#64748b' }}>{fmtEuro(g.monthly)}/M · {Math.round((g.monthly / monthlyTotal) * 100)}%</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Kopfzeile Liste */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <h3 style={{ color: '#e2e8f0', fontSize: 16, fontWeight: 700, margin: 0 }}>
          Kostenpositionen <span style={{ color: '#64748b', fontWeight: 500 }}>({items.length})</span>
        </h3>
        <button
          onClick={addItem}
          style={{ padding: '8px 14px', background: 'rgba(6,182,212,0.1)', color: '#06b6d4', border: '1px solid #06b6d4', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
        >
          + Position hinzufügen
        </button>
      </div>

      {items.length === 0 ? (
        <div style={{ padding: '40px 16px', textAlign: 'center', color: '#64748b', fontSize: 14, background: '#111827', border: '1px dashed #1e293b', borderRadius: 12 }}>
          Noch keine Fixkosten erfasst.<br />Klick auf „+ Position hinzufügen“, um zu starten.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {groups.arr.map((g) => (
            <div key={g.key}>
              {/* Kategorie-Kopf mit Zwischensumme */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '0 4px 8px', borderBottom: '1px solid #1e293b', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <span style={{ width: 9, height: 9, borderRadius: 3, background: groups.colors.get(g.key), flex: '0 0 auto' }} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#cbd5e1', textTransform: 'uppercase', letterSpacing: '0.04em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.label}</span>
                  <span style={{ fontSize: 12, color: '#64748b' }}>· {g.items.length}</span>
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#94a3b8', whiteSpace: 'nowrap' }}>{fmtEuro(g.monthly)}/M</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {g.items.map((it) => {
                  const editing = editIds.has(it.id);
                  const pm = perMonthOf(it);
                  return (
                    <div id={`fk-${it.id}`} key={it.id} style={{ background: '#0f172a', border: `1px solid ${editing ? '#06b6d4' : '#1e293b'}`, borderRadius: 10, padding: editing ? 14 : '12px 14px' }}>
                      {!editing ? (
                        /* ---- LESEN ---- */
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                              <span style={{ fontSize: 15, fontWeight: 600, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {it.label || <span style={{ color: '#64748b', fontStyle: 'italic' }}>Ohne Bezeichnung</span>}
                              </span>
                              {it.interval !== 'monatlich' && (
                                <span style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', background: '#1e293b', padding: '2px 7px', borderRadius: 999 }}>
                                  {INTERVAL_LABELS[it.interval]}
                                </span>
                              )}
                            </div>
                            {it.note && <div style={{ fontSize: 12, color: '#64748b', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.note}</div>}
                          </div>
                          <div style={{ textAlign: 'right', flex: '0 0 auto' }}>
                            <div style={{ fontSize: 15, fontWeight: 700, color: '#e2e8f0' }}>{fmtEuro(pm)}<span style={{ fontSize: 11, fontWeight: 500, color: '#64748b' }}>/M</span></div>
                            {it.interval !== 'monatlich' && it.amount > 0 && (
                              <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{fmtEuro(it.amount)} {INTERVAL_LABELS[it.interval]}</div>
                            )}
                          </div>
                          <button
                            onClick={() => toggleEdit(it.id, true)}
                            title="Bearbeiten"
                            style={{ flex: '0 0 auto', padding: '7px 9px', background: 'transparent', color: '#94a3b8', border: '1px solid #1e293b', borderRadius: 8, cursor: 'pointer', fontSize: 14, lineHeight: 1 }}
                          >
                            ✎
                          </button>
                        </div>
                      ) : (
                        /* ---- BEARBEITEN ---- */
                        <>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, alignItems: 'end' }}>
                            <div style={{ gridColumn: 'span 2' }}>
                              <label style={fieldLabel}>Bezeichnung</label>
                              <input value={it.label} onChange={(e) => updateItem(it.id, { label: e.target.value })} placeholder="z.B. Server (Hetzner)" style={fieldInput} />
                            </div>
                            <div>
                              <label style={fieldLabel}>Betrag (€)</label>
                              <input
                                inputMode="decimal"
                                value={amountText[it.id] ?? ''}
                                onChange={(e) => {
                                  setAmountText((prev) => ({ ...prev, [it.id]: e.target.value }));
                                  updateItem(it.id, { amount: parseAmount(e.target.value) });
                                }}
                                placeholder="0,00"
                                style={fieldInput}
                              />
                            </div>
                            <div>
                              <label style={fieldLabel}>Intervall</label>
                              <select value={it.interval} onChange={(e) => updateItem(it.id, { interval: e.target.value as Interval })} style={{ ...fieldInput, cursor: 'pointer' }}>
                                {(Object.keys(INTERVAL_LABELS) as Interval[]).map((iv) => <option key={iv} value={iv}>{INTERVAL_LABELS[iv]}</option>)}
                              </select>
                            </div>
                            <div>
                              <label style={fieldLabel}>Kategorie</label>
                              <input list="fixkosten-kategorien" value={it.category} onChange={(e) => updateItem(it.id, { category: e.target.value })} placeholder="optional" style={fieldInput} />
                            </div>
                            <div style={{ gridColumn: 'span 2' }}>
                              <label style={fieldLabel}>Notiz</label>
                              <input value={it.note} onChange={(e) => updateItem(it.id, { note: e.target.value })} placeholder="optional (z.B. Vertrag / Kündigungsfrist)" style={fieldInput} />
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12 }}>
                            <button
                              onClick={() => toggleEdit(it.id, false)}
                              style={{ padding: '8px 16px', background: 'rgba(6,182,212,0.1)', color: '#06b6d4', border: '1px solid #06b6d4', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
                            >
                              ✓ Fertig
                            </button>
                            {it.interval !== 'monatlich' && pm > 0 && (
                              <span style={{ fontSize: 12, color: '#64748b' }}>= {fmtEuro(pm)} / Monat</span>
                            )}
                            <button
                              onClick={() => removeItem(it.id)}
                              title="Position löschen"
                              style={{ marginLeft: 'auto', padding: '8px 12px', background: 'rgba(239,68,68,0.08)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                            >
                              ✕ Löschen
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <datalist id="fixkosten-kategorien">
        {CATEGORY_SUGGESTIONS.map((c) => <option key={c} value={c} />)}
      </datalist>

      {/* Sticky Speichern-Leiste bei ungespeicherten Änderungen */}
      {dirty && (
        <div style={{ position: 'sticky', bottom: 12, marginTop: 24, display: 'flex', alignItems: 'center', gap: 12, background: '#111827', border: '1px solid #06b6d4', borderRadius: 12, padding: '12px 16px', boxShadow: '0 8px 24px rgba(0,0,0,0.35)' }}>
          <span style={{ fontSize: 13, color: '#f59e0b', fontWeight: 600, flex: 1 }}>Ungespeicherte Änderungen</span>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{ padding: '10px 24px', borderRadius: 8, border: 'none', background: '#06b6d4', color: '#0f172a', fontWeight: 700, fontSize: 14, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1 }}
          >
            {saving ? 'Speichert…' : 'Speichern'}
          </button>
        </div>
      )}
    </div>
  );
}

const fieldLabel: React.CSSProperties = {
  display: 'block', fontSize: 12, color: '#94a3b8', fontWeight: 600, marginBottom: 4,
};

const fieldInput: React.CSSProperties = {
  padding: '8px 10px', background: '#111827', border: '1px solid #1e293b',
  borderRadius: 8, color: '#e2e8f0', fontSize: 14, outline: 'none', width: '100%',
};
