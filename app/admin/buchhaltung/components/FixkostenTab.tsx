'use client';

import { useState, useEffect, useMemo } from 'react';
import { fmtEuro } from '@/lib/format-utils';
import KpiCard from './shared/KpiCard';

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

  const monthlyTotal = useMemo(
    () => items.reduce((sum, it) => sum + it.amount * MONTHLY_FACTOR[it.interval], 0),
    [items]
  );
  const yearlyTotal = monthlyTotal * 12;

  function updateItem(id: string, patch: Partial<Fixkost>) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  function addItem() {
    const it: Fixkost = { id: newId(), label: '', amount: 0, interval: 'monatlich', category: '', note: '' };
    setItems((prev) => [...prev, it]);
    setAmountText((prev) => ({ ...prev, [it.id]: '' }));
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((it) => it.id !== id));
    setAmountText((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
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

  return (
    <div style={{ maxWidth: 960 }}>
      {toast && (
        <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 999, padding: '12px 20px', borderRadius: 8, background: toast.type === 'ok' ? '#10b981' : '#ef4444', color: '#fff', fontWeight: 600, fontSize: 14 }}>
          {toast.msg}
        </div>
      )}

      {/* Hinweis: reine Übersicht */}
      <div style={{ marginBottom: 20, padding: 12, background: 'rgba(6,182,212,0.06)', border: '1px solid rgba(6,182,212,0.18)', borderRadius: 8 }}>
        <p style={{ color: '#94a3b8', fontSize: 13, lineHeight: 1.6, margin: 0 }}>
          Trage hier deine <strong style={{ color: '#e2e8f0' }}>fixen Betriebskosten</strong> ein
          (Server, Software-Abos, Versicherungen, Miete …). Reine Übersicht — diese Werte fließen
          <strong style={{ color: '#e2e8f0' }}> nicht</strong> in EÜR, DATEV, Berichte oder Ausgaben ein.
        </p>
      </div>

      {/* Summen */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
        <KpiCard label="Fixkosten pro Monat" value={fmtEuro(monthlyTotal)} subtitle={`${items.length} Position${items.length === 1 ? '' : 'en'}`} />
        <KpiCard label="Fixkosten pro Jahr" value={fmtEuro(yearlyTotal)} subtitle="= Monat × 12" accentColor="#a855f7" />
      </div>

      {/* Liste */}
      <div style={{ background: '#111827', border: '1px solid #1e293b', borderRadius: 12, padding: 20, marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
          <h3 style={{ color: '#e2e8f0', fontSize: 16, fontWeight: 700, margin: 0 }}>Kostenpositionen</h3>
          <button
            onClick={addItem}
            style={{ padding: '8px 14px', background: 'rgba(6,182,212,0.1)', color: '#06b6d4', border: '1px solid #06b6d4', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
          >
            + Position hinzufügen
          </button>
        </div>

        {items.length === 0 ? (
          <div style={{ padding: '32px 16px', textAlign: 'center', color: '#64748b', fontSize: 14 }}>
            Noch keine Fixkosten erfasst. Klick auf „+ Position hinzufügen“.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {items.map((it) => {
              const perMonth = it.amount * MONTHLY_FACTOR[it.interval];
              return (
                <div key={it.id} style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 10, padding: 14 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, alignItems: 'end' }}>
                    <div style={{ gridColumn: 'span 2' }}>
                      <label style={fieldLabel}>Bezeichnung</label>
                      <input
                        value={it.label}
                        onChange={(e) => updateItem(it.id, { label: e.target.value })}
                        placeholder="z.B. Server (Hetzner)"
                        style={fieldInput}
                      />
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
                      <select
                        value={it.interval}
                        onChange={(e) => updateItem(it.id, { interval: e.target.value as Interval })}
                        style={{ ...fieldInput, cursor: 'pointer' }}
                      >
                        {(Object.keys(INTERVAL_LABELS) as Interval[]).map((iv) => (
                          <option key={iv} value={iv}>{INTERVAL_LABELS[iv]}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={fieldLabel}>Kategorie</label>
                      <input
                        list="fixkosten-kategorien"
                        value={it.category}
                        onChange={(e) => updateItem(it.id, { category: e.target.value })}
                        placeholder="optional"
                        style={fieldInput}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginTop: 10, flexWrap: 'wrap' }}>
                    <div style={{ flex: '1 1 240px' }}>
                      <label style={fieldLabel}>Notiz</label>
                      <input
                        value={it.note}
                        onChange={(e) => updateItem(it.id, { note: e.target.value })}
                        placeholder="optional (z.B. Vertrag / Kündigungsfrist)"
                        style={fieldInput}
                      />
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b', whiteSpace: 'nowrap', paddingBottom: 9 }}>
                      {it.interval !== 'monatlich' && perMonth > 0
                        ? <>= {fmtEuro(perMonth)} / Monat</>
                        : ' '}
                    </div>
                    <button
                      onClick={() => removeItem(it.id)}
                      title="Position löschen"
                      style={{ padding: '8px 12px', background: 'rgba(239,68,68,0.08)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
                    >
                      ✕ Löschen
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <datalist id="fixkosten-kategorien">
          {CATEGORY_SUGGESTIONS.map((c) => <option key={c} value={c} />)}
        </datalist>
      </div>

      {/* Speichern */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          onClick={handleSave}
          disabled={saving || !dirty}
          style={{
            padding: '12px 28px', borderRadius: 8, border: 'none',
            background: dirty ? '#06b6d4' : '#1e293b', color: dirty ? '#0f172a' : '#64748b',
            fontWeight: 700, fontSize: 14, cursor: saving || !dirty ? 'default' : 'pointer',
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? 'Speichert…' : 'Speichern'}
        </button>
        {dirty && <span style={{ fontSize: 13, color: '#f59e0b' }}>Ungespeicherte Änderungen</span>}
      </div>
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
