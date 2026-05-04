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

interface AccessoryUnit {
  id: string;
  accessory_id: string;
  exemplar_code: string;
  serial_number: string | null;
  status: string;
  purchased_at: string | null;
}

interface Product {
  id: string;
  name: string;
  brand: string;
}

interface Accessory {
  id: string;
  name: string;
  category: string;
}

interface PurchaseOption {
  id: string;
  invoice_number: string | null;
  order_date: string;
  supplier_name: string | null;
  total_amount: number | null;
}

const card: React.CSSProperties = { background: '#111827', borderRadius: 12, border: '1px solid #1e293b', padding: 20 };
const input: React.CSSProperties = { background: '#0a0f1e', border: '1px solid #1e293b', borderRadius: 8, padding: '8px 10px', color: '#e2e8f0', fontSize: 13, width: '100%' };
const label: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4, display: 'block' };
const cyan = '#06b6d4';

type Draft = {
  name: string;
  purchase_price: string;
  purchase_date: string;
  useful_life_months: string;
  kind: string;
  /** 'linear' = lineare AfA, 'immediate' = GWG-Sofortabzug, 'expense' = nur Ausgabe (kein Asset) */
  depreciation_method: 'linear' | 'immediate' | 'expense';
  /** Nur bei depreciation_method='expense' relevant */
  expense_category: string;
  /** Nur bei depreciation_method='expense' relevant: optionale Verknuepfung zur Lieferantenrechnung */
  purchase_id: string;
};

const EXPENSE_CATEGORY_LABELS: Record<string, string> = {
  hardware: 'Hardware',
  office: 'Büro',
  software: 'Software',
  shipping: 'Versand',
  marketing: 'Marketing',
  travel: 'Reisen',
  insurance: 'Versicherungen',
  legal: 'Rechtsberatung',
  other: 'Sonstiges',
};

function emptyDraft(opts?: Partial<Draft>): Draft {
  return {
    name: opts?.name ?? '',
    purchase_price: opts?.purchase_price ?? '',
    purchase_date: opts?.purchase_date ?? '',
    useful_life_months: opts?.useful_life_months ?? '36',
    kind: opts?.kind ?? 'rental_camera',
    depreciation_method: opts?.depreciation_method ?? 'linear',
    expense_category: opts?.expense_category ?? 'hardware',
    purchase_id: opts?.purchase_id ?? '',
  };
}

export default function NachtragenPage() {
  const [units, setUnits] = useState<Unit[]>([]);
  const [accUnits, setAccUnits] = useState<AccessoryUnit[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [accessories, setAccessories] = useState<Accessory[]>([]);
  const [purchases, setPurchases] = useState<PurchaseOption[]>([]);
  const [linkedUnitIds, setLinkedUnitIds] = useState<Set<string>>(new Set());
  const [linkedAccUnitIds, setLinkedAccUnitIds] = useState<Set<string>>(new Set());
  // Units, die als Ausgabe verbucht wurden (kein Asset, aber bereits klassifiziert)
  const [expenseUnitIds, setExpenseUnitIds] = useState<Set<string>>(new Set());
  const [expenseAccUnitIds, setExpenseAccUnitIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function reload() {
    const [uRes, auRes, pRes, accRes, aRes, eRes, purchRes] = await Promise.all([
      fetch('/api/admin/product-units').then((r) => r.json()),
      fetch('/api/admin/accessory-units').then((r) => r.json()),
      fetch('/api/products').then((r) => r.json()),
      fetch('/api/admin/accessories').then((r) => r.json()),
      fetch('/api/admin/assets?include_test=1').then((r) => r.json()),
      fetch('/api/admin/buchhaltung/expenses').then((r) => r.json()),
      fetch('/api/admin/purchases').then((r) => r.json()),
    ]);
    const unitList: Unit[] = uRes.units ?? uRes.data ?? [];
    setUnits(unitList.filter((u) => u.status !== 'retired'));
    const accUnitList: AccessoryUnit[] = auRes.units ?? [];
    setAccUnits(accUnitList.filter((u) => u.status !== 'retired'));
    setProducts((pRes.products ?? []).map((p: { id: string; name: string; brand: string }) => ({ id: p.id, name: p.name, brand: p.brand })));
    setAccessories((accRes.accessories ?? []).map((a: { id: string; name: string; category: string }) => ({ id: a.id, name: a.name, category: a.category })));
    const linkedU = new Set<string>();
    const linkedA = new Set<string>();
    for (const a of (aRes.assets ?? [])) {
      if (a.unit_id) linkedU.add(a.unit_id);
      if (a.accessory_unit_id) linkedA.add(a.accessory_unit_id);
    }
    setLinkedUnitIds(linkedU);
    setLinkedAccUnitIds(linkedA);
    // Units mit verknuepfter Ausgabe (source_type='product_unit_expense' / 'accessory_unit_expense')
    const expU = new Set<string>();
    const expA = new Set<string>();
    for (const e of (eRes.expenses ?? [])) {
      if (e.source_type === 'product_unit_expense' && e.source_id) expU.add(e.source_id);
      if (e.source_type === 'accessory_unit_expense' && e.source_id) expA.add(e.source_id);
    }
    setExpenseUnitIds(expU);
    setExpenseAccUnitIds(expA);
    // Lieferanten-Rechnungen fuer das optionale Beleg-Dropdown
    setPurchases((purchRes.purchases ?? []).map((p: { id: string; invoice_number: string | null; order_date: string; total_amount: number | null; supplier?: { name?: string } | null }) => ({
      id: p.id,
      invoice_number: p.invoice_number,
      order_date: p.order_date,
      supplier_name: p.supplier?.name ?? null,
      total_amount: p.total_amount ?? null,
    })));
  }

  useEffect(() => {
    reload().finally(() => setLoading(false));
  }, []);

  const openUnits = units.filter((u) => !linkedUnitIds.has(u.id) && !expenseUnitIds.has(u.id));
  const openAccUnits = accUnits.filter((u) => !linkedAccUnitIds.has(u.id) && !expenseAccUnitIds.has(u.id));

  function getProductLabel(pid: string) {
    const p = products.find((x) => x.id === pid);
    return p ? `${p.brand} ${p.name}` : pid;
  }

  function getAccessoryLabel(accId: string) {
    const a = accessories.find((x) => x.id === accId);
    return a ? `${a.name} (${a.category})` : accId;
  }

  function getPurchaseLabel(p: PurchaseOption) {
    const date = fmtDate(p.order_date);
    const supp = p.supplier_name ?? 'Lieferant';
    const inv = p.invoice_number ? ` · Rechnung ${p.invoice_number}` : '';
    const total = p.total_amount != null ? ` · ${p.total_amount.toFixed(2).replace('.', ',')} €` : '';
    return `${date} · ${supp}${inv}${total}`;
  }

  function setDraft(draftKey: string, key: keyof Draft, value: string, fallback?: Draft) {
    setDrafts((prev) => ({
      ...prev,
      [draftKey]: { ...(prev[draftKey] ?? fallback ?? emptyDraft()), [key]: value as Draft[typeof key] },
    }));
  }

  async function saveCamera(unit: Unit) {
    const draftKey = `cam-${unit.id}`;
    const d = drafts[draftKey];
    if (!d?.name || !d.purchase_price || !d.purchase_date) {
      setMsg('Name, Preis und Datum sind Pflicht.');
      return;
    }
    setSaving(draftKey);
    setMsg(null);
    try {
      // 'expense'-Pfad: keine Anlage anlegen, nur Ausgabe verbuchen
      if (d.depreciation_method === 'expense') {
        const gross = Number(d.purchase_price);
        const res = await fetch('/api/admin/buchhaltung/expenses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            expense_date: d.purchase_date,
            category: d.expense_category,
            description: d.name,
            gross_amount: gross,
            net_amount: gross,
            tax_amount: 0,
            source_type: 'product_unit_expense',
            source_id: unit.id,
            purchase_id: d.purchase_id || null,
            notes: `Aus Bestand nachtragen — Kamera SN ${unit.serial_number}`,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setMsg(`Fehler: ${data?.error}`);
          return;
        }
        setExpenseUnitIds((prev) => new Set(prev).add(unit.id));
        setMsg(`Ausgabe "${d.name}" verbucht — Unit bleibt im Inventar (SN ${unit.serial_number}).`);
        return;
      }

      const isGwg = d.depreciation_method === 'immediate';
      const res = await fetch('/api/admin/assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: d.kind,
          name: d.name,
          serial_number: unit.serial_number,
          purchase_price: Number(d.purchase_price),
          purchase_date: d.purchase_date,
          useful_life_months: isGwg ? 0 : (Number(d.useful_life_months) || 36),
          depreciation_method: d.depreciation_method,
          product_id: unit.product_id,
          unit_id: unit.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg(`Fehler: ${data?.error}`);
        return;
      }
      if (!isGwg) {
        await fetch(`/api/admin/assets/${data.asset.id}/depreciation-catchup`, { method: 'POST' });
      }
      setLinkedUnitIds((prev) => new Set(prev).add(unit.id));
      setMsg(isGwg
        ? `GWG "${d.name}" angelegt — als Sofortabzug in der EÜR verbucht.`
        : `Asset "${d.name}" angelegt und AfA nachgetragen.`);
    } finally {
      setSaving(null);
    }
  }

  async function saveAccessory(unit: AccessoryUnit) {
    const draftKey = `acc-${unit.id}`;
    const d = drafts[draftKey];
    if (!d?.name || !d.purchase_price || !d.purchase_date) {
      setMsg('Name, Preis und Datum sind Pflicht.');
      return;
    }
    setSaving(draftKey);
    setMsg(null);
    try {
      // 'expense'-Pfad: keine Anlage anlegen, nur Ausgabe verbuchen
      if (d.depreciation_method === 'expense') {
        const gross = Number(d.purchase_price);
        const res = await fetch('/api/admin/buchhaltung/expenses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            expense_date: d.purchase_date,
            category: d.expense_category,
            description: d.name,
            gross_amount: gross,
            net_amount: gross,
            tax_amount: 0,
            source_type: 'accessory_unit_expense',
            source_id: unit.id,
            purchase_id: d.purchase_id || null,
            notes: `Aus Bestand nachtragen — Zubehör ${unit.exemplar_code}`,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setMsg(`Fehler: ${data?.error}`);
          return;
        }
        setExpenseAccUnitIds((prev) => new Set(prev).add(unit.id));
        setMsg(`Ausgabe "${d.name}" verbucht — Exemplar bleibt im Inventar (${unit.exemplar_code}).`);
        return;
      }

      const isGwg = d.depreciation_method === 'immediate';
      const res = await fetch('/api/admin/assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: d.kind,
          name: d.name,
          serial_number: unit.serial_number ?? unit.exemplar_code,
          purchase_price: Number(d.purchase_price),
          purchase_date: d.purchase_date,
          useful_life_months: isGwg ? 0 : (Number(d.useful_life_months) || 36),
          depreciation_method: d.depreciation_method,
          accessory_unit_id: unit.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg(`Fehler: ${data?.error}`);
        return;
      }
      if (!isGwg) {
        await fetch(`/api/admin/assets/${data.asset.id}/depreciation-catchup`, { method: 'POST' });
      }
      setLinkedAccUnitIds((prev) => new Set(prev).add(unit.id));
      setMsg(isGwg
        ? `GWG "${d.name}" angelegt — als Sofortabzug in der EÜR verbucht.`
        : `Asset "${d.name}" angelegt und AfA nachgetragen.`);
    } finally {
      setSaving(null);
    }
  }

  return (
    <div style={{ minHeight: '100dvh', background: '#0a0f1e', padding: '24px 20px' }}>
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>
        <AdminBackLink href="/admin/anlagen" label="Zurück zum Anlagenverzeichnis" />

        <div style={{ marginTop: 16, marginBottom: 24 }}>
          <h1 style={{ color: '#f1f5f9', fontSize: 28, fontWeight: 800, marginBottom: 6 }}>Bestand nachtragen</h1>
          <p style={{ color: '#94a3b8', fontSize: 14 }}>
            Fuer Kameras + Zubehoer aus dem Altbestand (die noch keinen Asset-Eintrag haben) kannst du hier
            Kaufdatum, Kaufpreis und AfA-Methode nachtragen. Bei GWG wird der Aufwand sofort in der EÜR
            verbucht. Wiederbeschaffungswert sinkt linear ueber 36 Monate auf 40 % Floor (kann im Detail
            ueberschrieben werden).
          </p>
        </div>

        {msg && (
          <div style={{ ...card, marginBottom: 20, borderColor: cyan, background: 'rgba(6,182,212,0.1)' }}>
            <p style={{ color: cyan }}>{msg}</p>
          </div>
        )}

        {/* Section: Kameras */}
        <h2 style={{ color: '#f1f5f9', fontSize: 18, fontWeight: 700, marginTop: 8, marginBottom: 12 }}>
          Kameras ({openUnits.length} offen)
        </h2>

        {loading ? (
          <div style={{ ...card, textAlign: 'center', color: '#64748b' }}>Lade Einheiten…</div>
        ) : openUnits.length === 0 ? (
          <div style={{ ...card, textAlign: 'center', color: '#64748b', marginBottom: 24 }}>
            Alle Kameras haben bereits einen Asset-Eintrag. 🎉
          </div>
        ) : (
          openUnits.map((unit) => {
            const draftKey = `cam-${unit.id}`;
            const d = drafts[draftKey] ?? emptyDraft({ name: getProductLabel(unit.product_id), purchase_date: unit.purchased_at ?? '', kind: 'rental_camera' });
            const isGwg = d.depreciation_method === 'immediate';
            const isExpense = d.depreciation_method === 'expense';
            return (
              <div key={unit.id} style={{ ...card, marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                  <div>
                    <div style={{ color: '#e2e8f0', fontWeight: 700, fontSize: 16 }}>{unit.label ?? getProductLabel(unit.product_id)}</div>
                    <div style={{ color: '#64748b', fontSize: 12 }}>
                      Produkt: {getProductLabel(unit.product_id)} · SN: {unit.serial_number} · Status: {unit.status}
                      {unit.purchased_at && ` · Eingekauft am ${fmtDate(unit.purchased_at)}`}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
                  <div>
                    <span style={label}>Art</span>
                    <select style={input} value={d.kind} disabled={isExpense} onChange={(e) => setDraft(draftKey, 'kind', e.target.value, d)}>
                      <option value="rental_camera">Vermietkamera</option>
                      <option value="rental_accessory">Zubehör</option>
                      <option value="office_equipment">Büro</option>
                      <option value="tool">Werkzeug</option>
                      <option value="other">Sonstiges</option>
                    </select>
                  </div>
                  <div>
                    <span style={label}>Name</span>
                    <input style={input} value={d.name} onChange={(e) => setDraft(draftKey, 'name', e.target.value, d)} />
                  </div>
                  <div>
                    <span style={label}>Kaufpreis brutto (€)</span>
                    <input style={input} type="number" step="0.01" value={d.purchase_price} onChange={(e) => setDraft(draftKey, 'purchase_price', e.target.value, d)} />
                  </div>
                  <div>
                    <span style={label}>Kaufdatum</span>
                    <input style={input} type="date" value={d.purchase_date} onChange={(e) => setDraft(draftKey, 'purchase_date', e.target.value, d)} />
                  </div>
                  <div>
                    <span style={label}>AfA-Methode</span>
                    <select style={input} value={d.depreciation_method} onChange={(e) => setDraft(draftKey, 'depreciation_method', e.target.value, d)}>
                      <option value="linear">Linear (über Nutzungsdauer)</option>
                      <option value="immediate">GWG (Sofortabzug)</option>
                      <option value="expense">Ausgabe (kein Asset)</option>
                    </select>
                  </div>
                  {isExpense ? (
                    <div>
                      <span style={label}>Kategorie</span>
                      <select style={input} value={d.expense_category} onChange={(e) => setDraft(draftKey, 'expense_category', e.target.value, d)}>
                        {Object.entries(EXPENSE_CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </div>
                  ) : (
                    <div>
                      <span style={label}>Nutzungsdauer (Monate)</span>
                      <input style={input} type="number" min={1} disabled={isGwg} value={isGwg ? '' : d.useful_life_months} placeholder={isGwg ? 'Nicht relevant bei GWG' : ''} onChange={(e) => setDraft(draftKey, 'useful_life_months', e.target.value, d)} />
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                    <button
                      onClick={() => saveCamera(unit)}
                      disabled={saving === draftKey}
                      style={{ padding: '10px 20px', borderRadius: 8, background: isExpense ? '#22c55e' : cyan, color: '#0f172a', border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer', width: '100%' }}
                    >
                      {saving === draftKey ? 'Speichere…' : isExpense ? 'Als Ausgabe verbuchen' : 'Asset anlegen'}
                    </button>
                  </div>
                </div>
                {isExpense && (
                  <>
                    <div style={{ marginTop: 12 }}>
                      <span style={label}>An Lieferantenrechnung hängen (optional)</span>
                      <select style={input} value={d.purchase_id} onChange={(e) => setDraft(draftKey, 'purchase_id', e.target.value, d)}>
                        <option value="">— Kein Beleg verknüpft —</option>
                        {purchases.map((p) => (
                          <option key={p.id} value={p.id}>{getPurchaseLabel(p)}</option>
                        ))}
                      </select>
                    </div>
                    <div style={{ marginTop: 8, fontSize: 11, color: '#86efac', lineHeight: 1.5 }}>
                      ℹ Wird als Ausgabe in der EÜR gebucht. Die Unit bleibt im Inventar (Scanner / Verfügbarkeit / Buchungen funktionieren weiter).
                    </div>
                  </>
                )}
              </div>
            );
          })
        )}

        {/* Section: Zubehoer */}
        <h2 style={{ color: '#f1f5f9', fontSize: 18, fontWeight: 700, marginTop: 32, marginBottom: 12 }}>
          Zubehör ({openAccUnits.length} offen)
        </h2>

        {loading ? (
          <div style={{ ...card, textAlign: 'center', color: '#64748b' }}>Lade Zubehör-Exemplare…</div>
        ) : openAccUnits.length === 0 ? (
          <div style={{ ...card, textAlign: 'center', color: '#64748b' }}>
            Alle Zubehör-Exemplare haben bereits einen Asset-Eintrag. 🎉
          </div>
        ) : (
          openAccUnits.map((unit) => {
            const draftKey = `acc-${unit.id}`;
            const d = drafts[draftKey] ?? emptyDraft({ name: unit.exemplar_code, purchase_date: unit.purchased_at ?? '', kind: 'rental_accessory' });
            const isGwg = d.depreciation_method === 'immediate';
            const isExpense = d.depreciation_method === 'expense';
            return (
              <div key={unit.id} style={{ ...card, marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                  <div>
                    <div style={{ color: '#e2e8f0', fontWeight: 700, fontSize: 16 }}>{unit.exemplar_code}</div>
                    <div style={{ color: '#64748b', fontSize: 12 }}>
                      Zubehör: {getAccessoryLabel(unit.accessory_id)}
                      {unit.serial_number && ` · Hersteller-SN: ${unit.serial_number}`}
                      {' · Status: '}{unit.status}
                      {unit.purchased_at && ` · Eingekauft am ${fmtDate(unit.purchased_at)}`}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
                  <div>
                    <span style={label}>Art</span>
                    <select style={input} value={d.kind} disabled={isExpense} onChange={(e) => setDraft(draftKey, 'kind', e.target.value, d)}>
                      <option value="rental_accessory">Vermietbares Zubehör</option>
                      <option value="rental_camera">Vermietkamera</option>
                      <option value="office_equipment">Büro</option>
                      <option value="tool">Werkzeug</option>
                      <option value="other">Sonstiges</option>
                    </select>
                  </div>
                  <div>
                    <span style={label}>Name</span>
                    <input style={input} value={d.name} onChange={(e) => setDraft(draftKey, 'name', e.target.value, d)} />
                  </div>
                  <div>
                    <span style={label}>Kaufpreis brutto (€)</span>
                    <input style={input} type="number" step="0.01" value={d.purchase_price} onChange={(e) => setDraft(draftKey, 'purchase_price', e.target.value, d)} />
                  </div>
                  <div>
                    <span style={label}>Kaufdatum</span>
                    <input style={input} type="date" value={d.purchase_date} onChange={(e) => setDraft(draftKey, 'purchase_date', e.target.value, d)} />
                  </div>
                  <div>
                    <span style={label}>AfA-Methode</span>
                    <select style={input} value={d.depreciation_method} onChange={(e) => setDraft(draftKey, 'depreciation_method', e.target.value, d)}>
                      <option value="linear">Linear (über Nutzungsdauer)</option>
                      <option value="immediate">GWG (Sofortabzug)</option>
                      <option value="expense">Ausgabe (kein Asset)</option>
                    </select>
                  </div>
                  {isExpense ? (
                    <div>
                      <span style={label}>Kategorie</span>
                      <select style={input} value={d.expense_category} onChange={(e) => setDraft(draftKey, 'expense_category', e.target.value, d)}>
                        {Object.entries(EXPENSE_CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </div>
                  ) : (
                    <div>
                      <span style={label}>Nutzungsdauer (Monate)</span>
                      <input style={input} type="number" min={1} disabled={isGwg} value={isGwg ? '' : d.useful_life_months} placeholder={isGwg ? 'Nicht relevant bei GWG' : ''} onChange={(e) => setDraft(draftKey, 'useful_life_months', e.target.value, d)} />
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                    <button
                      onClick={() => saveAccessory(unit)}
                      disabled={saving === draftKey}
                      style={{ padding: '10px 20px', borderRadius: 8, background: isExpense ? '#22c55e' : cyan, color: '#0f172a', border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer', width: '100%' }}
                    >
                      {saving === draftKey ? 'Speichere…' : isExpense ? 'Als Ausgabe verbuchen' : 'Asset anlegen'}
                    </button>
                  </div>
                </div>
                {isExpense && (
                  <>
                    <div style={{ marginTop: 12 }}>
                      <span style={label}>An Lieferantenrechnung hängen (optional)</span>
                      <select style={input} value={d.purchase_id} onChange={(e) => setDraft(draftKey, 'purchase_id', e.target.value, d)}>
                        <option value="">— Kein Beleg verknüpft —</option>
                        {purchases.map((p) => (
                          <option key={p.id} value={p.id}>{getPurchaseLabel(p)}</option>
                        ))}
                      </select>
                    </div>
                    <div style={{ marginTop: 8, fontSize: 11, color: '#86efac', lineHeight: 1.5 }}>
                      ℹ Wird als Ausgabe in der EÜR gebucht. Das Exemplar bleibt im Inventar (Scanner / Verfügbarkeit / Buchungen funktionieren weiter).
                    </div>
                  </>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
