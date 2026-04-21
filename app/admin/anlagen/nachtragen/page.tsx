'use client';

import { useEffect, useState } from 'react';
import AdminBackLink from '@/components/admin/AdminBackLink';
import { fmtDate } from '@/lib/format-utils';

interface Unit {
  id: string;
  product_id: string;
  serial_number: string;
  label: string | null;
  status: string;
  purchased_at: string | null;
}

interface Product {
  id: string;
  name: string;
  brand: string;
}

const card: React.CSSProperties = { background: '#111827', borderRadius: 12, border: '1px solid #1e293b', padding: 20 };
const input: React.CSSProperties = { background: '#0a0f1e', border: '1px solid #1e293b', borderRadius: 8, padding: '8px 10px', color: '#e2e8f0', fontSize: 13, width: '100%' };
const label: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4, display: 'block' };
const cyan = '#06b6d4';

export default function NachtragenPage() {
  const [units, setUnits] = useState<Unit[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [linkedAssets, setLinkedAssets] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, { name: string; purchase_price: string; purchase_date: string; useful_life_months: string; kind: string }>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const [uRes, pRes, aRes] = await Promise.all([
        fetch('/api/admin/product-units').then((r) => r.json()),
        fetch('/api/products').then((r) => r.json()),
        fetch('/api/admin/assets?include_test=1').then((r) => r.json()),
      ]);
      const unitList: Unit[] = uRes.units ?? uRes.data ?? [];
      setUnits(unitList.filter((u) => u.status !== 'retired'));
      setProducts((pRes.products ?? []).map((p: { id: string; name: string; brand: string }) => ({ id: p.id, name: p.name, brand: p.brand })));
      const linked = new Set<string>();
      for (const a of (aRes.assets ?? [])) {
        if (a.unit_id) linked.add(a.unit_id);
      }
      setLinkedAssets(linked);
      setLoading(false);
    }
    load();
  }, []);

  const openUnits = units.filter((u) => !linkedAssets.has(u.id));

  function getProductLabel(pid: string) {
    const p = products.find((x) => x.id === pid);
    return p ? `${p.brand} ${p.name}` : pid;
  }

  function setDraft(unitId: string, key: string, value: string) {
    setDrafts((prev) => ({
      ...prev,
      [unitId]: { ...(prev[unitId] ?? { name: '', purchase_price: '', purchase_date: '', useful_life_months: '36', kind: 'rental_camera' }), [key]: value },
    }));
  }

  async function save(unit: Unit) {
    const d = drafts[unit.id];
    if (!d?.name || !d.purchase_price || !d.purchase_date) {
      setMsg('Name, Preis und Datum sind Pflicht.');
      return;
    }
    setSaving(unit.id);
    setMsg(null);
    try {
      const res = await fetch('/api/admin/assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: d.kind,
          name: d.name,
          serial_number: unit.serial_number,
          purchase_price: Number(d.purchase_price),
          purchase_date: d.purchase_date,
          useful_life_months: Number(d.useful_life_months) || 36,
          product_id: unit.product_id,
          unit_id: unit.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg(`Fehler: ${data?.error}`);
        return;
      }
      // AfA nachholen
      await fetch(`/api/admin/assets/${data.asset.id}/depreciation-catchup`, { method: 'POST' });
      setLinkedAssets((prev) => new Set(prev).add(unit.id));
      setMsg(`Asset "${d.name}" angelegt und AfA nachgetragen.`);
    } finally {
      setSaving(null);
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0f1e', padding: '24px 20px' }}>
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>
        <AdminBackLink href="/admin/anlagen" label="Zurueck zum Anlagenverzeichnis" />

        <div style={{ marginTop: 16, marginBottom: 24 }}>
          <h1 style={{ color: '#f1f5f9', fontSize: 28, fontWeight: 800, marginBottom: 6 }}>Bestand nachtragen</h1>
          <p style={{ color: '#94a3b8', fontSize: 14 }}>
            Fuer Kameras aus dem Altbestand (die noch keinen Asset-Eintrag haben) kannst du hier Kaufdatum und Kaufpreis nachtragen.
            AfA wird automatisch rueckwirkend gebucht. Restwert ist standardmaessig
            30 % vom Kaufpreis (realistischer Gebrauchtwert) — dadurch faellt der
            Zeitwert im Mietvertrag nicht auf 0. Kann im Asset-Detail nachtraeglich
            angepasst werden.
          </p>
        </div>

        {msg && (
          <div style={{ ...card, marginBottom: 20, borderColor: cyan, background: 'rgba(6,182,212,0.1)' }}>
            <p style={{ color: cyan }}>{msg}</p>
          </div>
        )}

        {loading ? (
          <div style={{ ...card, textAlign: 'center', color: '#64748b' }}>Lade Einheiten…</div>
        ) : openUnits.length === 0 ? (
          <div style={{ ...card, textAlign: 'center', color: '#64748b' }}>
            Alle Einheiten haben bereits einen Asset-Eintrag. 🎉
          </div>
        ) : (
          openUnits.map((unit) => {
            const d = drafts[unit.id] ?? { name: getProductLabel(unit.product_id), purchase_price: '', purchase_date: unit.purchased_at ?? '', useful_life_months: '36', kind: 'rental_camera' };
            return (
              <div key={unit.id} style={{ ...card, marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                  <div>
                    <div style={{ color: '#e2e8f0', fontWeight: 700, fontSize: 16 }}>{getProductLabel(unit.product_id)}</div>
                    <div style={{ color: '#64748b', fontSize: 12 }}>
                      SN: {unit.serial_number} · Status: {unit.status}
                      {unit.purchased_at && ` · Eingekauft am ${fmtDate(unit.purchased_at)}`}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
                  <div>
                    <span style={label}>Art</span>
                    <select style={input} value={d.kind} onChange={(e) => setDraft(unit.id, 'kind', e.target.value)}>
                      <option value="rental_camera">Vermietkamera</option>
                      <option value="rental_accessory">Zubehoer</option>
                      <option value="office_equipment">Buero</option>
                      <option value="tool">Werkzeug</option>
                      <option value="other">Sonstiges</option>
                    </select>
                  </div>
                  <div>
                    <span style={label}>Name</span>
                    <input style={input} value={d.name} onChange={(e) => setDraft(unit.id, 'name', e.target.value)} />
                  </div>
                  <div>
                    <span style={label}>Kaufpreis brutto (EUR)</span>
                    <input style={input} type="number" step="0.01" value={d.purchase_price} onChange={(e) => setDraft(unit.id, 'purchase_price', e.target.value)} />
                  </div>
                  <div>
                    <span style={label}>Kaufdatum</span>
                    <input style={input} type="date" value={d.purchase_date} onChange={(e) => setDraft(unit.id, 'purchase_date', e.target.value)} />
                  </div>
                  <div>
                    <span style={label}>Nutzungsdauer (Monate)</span>
                    <input style={input} type="number" min={1} value={d.useful_life_months} onChange={(e) => setDraft(unit.id, 'useful_life_months', e.target.value)} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                    <button
                      onClick={() => save(unit)}
                      disabled={saving === unit.id}
                      style={{ padding: '10px 20px', borderRadius: 8, background: cyan, color: '#0f172a', border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer', width: '100%' }}
                    >
                      {saving === unit.id ? 'Speichere…' : 'Asset anlegen'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
