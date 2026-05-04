'use client';

import { useState } from 'react';
import { fmtEuro } from '@/lib/format-utils';

// ─── Types (kompatibel zu PATCH /api/admin/purchase-items/[id]) ─────────────

export type ItemClassification = 'asset' | 'gwg' | 'expense' | 'ignored' | 'pending' | null;
export type AssetKind = 'rental_camera' | 'rental_accessory' | 'office_equipment' | 'tool' | 'other';

export interface ProductOption {
  id: string;
  name: string;
  brand: string;
}

export interface AssetOption {
  id: string;
  name: string;
  kind: string;
  purchase_price: number;
  serial_number: string | null;
  depreciation_method: 'linear' | 'immediate' | 'none';
}

export interface ClassifierItem {
  id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  net_price?: number | null;
  tax_rate?: number | null;
  classification?: ItemClassification;
  asset_id?: string | null;
  expense_id?: string | null;
}

interface Props {
  item: ClassifierItem;
  products: ProductOption[];
  assets: AssetOption[];
  onSaved: () => void | Promise<void>;
}

const KIND_LABELS: Record<AssetKind, string> = {
  rental_camera: 'Vermietkamera',
  rental_accessory: 'Vermietbares Zubehör',
  office_equipment: 'Büro-Ausstattung',
  tool: 'Werkzeug',
  other: 'Sonstiges Anlagegut',
};

const CATEGORY_LABELS: Record<string, string> = {
  stripe_fees: 'Zahlungsgebühren',
  shipping: 'Versand',
  software: 'Software',
  hardware: 'Hardware',
  marketing: 'Marketing',
  office: 'Büro',
  travel: 'Reisen',
  insurance: 'Versicherungen',
  legal: 'Rechtsberatung',
  asset_purchase: 'GWG-Sofortabzug',
  other: 'Sonstiges',
};

const GWG_NETTO_MIN = 250;
const GWG_NETTO_MAX = 800;

const STATUS_BADGE: Record<string, { label: string; bg: string; color: string }> = {
  asset:    { label: 'Anlagegut',          bg: 'rgba(6,182,212,0.18)', color: '#67e8f9' },
  gwg:      { label: 'GWG (sofort)',       bg: 'rgba(245,158,11,0.18)', color: '#fde68a' },
  expense:  { label: 'Ausgabe',            bg: 'rgba(34,197,94,0.18)', color: '#86efac' },
  ignored:  { label: 'Ignoriert',          bg: 'rgba(100,116,139,0.18)', color: '#cbd5e1' },
  pending:  { label: 'Nicht klassifiziert', bg: 'rgba(239,68,68,0.18)', color: '#fca5a5' },
};

// ─── Styles ─────────────────────────────────────────────────────────────────

const card: React.CSSProperties = { background: '#0f172a', border: '1px solid #1e293b', borderRadius: 10, padding: 14, marginTop: 8 };
const input: React.CSSProperties = { background: '#0a0f1e', border: '1px solid #1e293b', borderRadius: 8, padding: '8px 10px', color: '#e2e8f0', fontSize: 13, width: '100%' };
const label: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 4, textTransform: 'uppercase' as const, letterSpacing: '0.5px' };

// ─── Component ──────────────────────────────────────────────────────────────

export default function PurchaseItemClassifier({ item, products, assets, onSaved }: Props) {
  const currentStatus = (item.classification ?? 'pending') as keyof typeof STATUS_BADGE;
  const badge = STATUS_BADGE[currentStatus] ?? STATUS_BADGE.pending;

  const [open, setOpen] = useState(currentStatus === 'pending');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const netPrice = Number(item.net_price ?? (item.unit_price * item.quantity));
  const defaultClassification: 'asset' | 'gwg' | 'expense' | 'ignored' =
    netPrice >= GWG_NETTO_MIN && netPrice <= GWG_NETTO_MAX ? 'gwg' : netPrice > GWG_NETTO_MAX ? 'asset' : 'expense';

  const [draft, setDraft] = useState({
    classification: (currentStatus === 'pending' ? defaultClassification : currentStatus) as 'asset' | 'gwg' | 'expense' | 'ignored',
    link_to_asset_id: '' as string,
    kind: 'rental_accessory' as AssetKind,
    name: item.product_name,
    serial_number: '',
    useful_life_months: 36,
    residual_value: Math.round(netPrice * 0.3 * 100) / 100,
    product_id: '' as string,
    expense_category: 'hardware',
    expense_date: new Date().toISOString().slice(0, 10),
    expense_asset_id: '' as string,
  });

  function update<K extends keyof typeof draft>(key: K, value: (typeof draft)[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { classification: draft.classification };

      if (draft.classification === 'asset' || draft.classification === 'gwg') {
        if (draft.link_to_asset_id) {
          body.link_to_asset_id = draft.link_to_asset_id;
        } else {
          if (!draft.kind || !draft.name.trim()) {
            throw new Error('Art und Name sind Pflicht');
          }
          body.kind = draft.kind;
          body.name = draft.name.trim();
          if (draft.serial_number.trim()) body.serial_number = draft.serial_number.trim();
          if (draft.product_id) body.product_id = draft.product_id;
          if (draft.classification === 'asset') {
            body.useful_life_months = draft.useful_life_months;
            body.residual_value = draft.residual_value;
          }
          // Auto-Unit anlegen wenn Kamera + Seriennummer + Produkt verknüpft
          if (draft.kind === 'rental_camera' && draft.product_id && draft.serial_number.trim()) {
            body.create_unit = true;
          }
        }
      } else if (draft.classification === 'expense') {
        body.category = draft.expense_category;
        body.expense_date = draft.expense_date;
        if (draft.expense_asset_id) body.asset_id = draft.expense_asset_id;
      }

      const res = await fetch(`/api/admin/purchase-items/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);

      setOpen(false);
      await onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fehler beim Speichern');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={card} onClick={(e) => e.stopPropagation()}>
      {/* Status-Zeile */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          <span style={{ color: '#e2e8f0', fontWeight: 600, fontSize: 13 }}>{item.product_name}</span>
          <span style={{ color: '#64748b', fontSize: 12 }}>
            {item.quantity}× · Netto {fmtEuro(netPrice)}{item.tax_rate != null ? ` · ${item.tax_rate}% USt` : ''}
          </span>
          <span
            style={{
              display: 'inline-block',
              padding: '3px 10px',
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 700,
              background: badge.bg,
              color: badge.color,
            }}
          >
            {badge.label}
          </span>
          {item.asset_id && (
            <a
              href={`/admin/anlagen/${item.asset_id}`}
              target="_blank"
              rel="noreferrer"
              style={{ color: '#06b6d4', fontSize: 12, textDecoration: 'none' }}
              onClick={(e) => e.stopPropagation()}
            >
              → Anlage öffnen
            </a>
          )}
        </div>
        <button
          onClick={() => setOpen((v) => !v)}
          style={{
            background: 'transparent',
            color: '#06b6d4',
            border: '1px solid #06b6d4',
            borderRadius: 8,
            padding: '6px 14px',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {open ? 'Schließen' : currentStatus === 'pending' ? 'Klassifizieren' : 'Neu klassifizieren'}
        </button>
      </div>

      {/* Klassifizier-Form */}
      {open && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid #1e293b' }}>
          {/* Klassifikations-Buttons */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            {(['asset', 'gwg', 'expense', 'ignored'] as const).map((c) => {
              const active = draft.classification === c;
              const activeColor = c === 'gwg' ? '#f59e0b' : c === 'asset' ? '#06b6d4' : c === 'expense' ? '#22c55e' : '#94a3b8';
              const lbl = c === 'asset' ? 'Anlagegut' : c === 'gwg' ? 'GWG (sofort)' : c === 'expense' ? 'Ausgabe' : 'Ignorieren';
              return (
                <button
                  key={c}
                  onClick={() => update('classification', c)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 6,
                    border: '1px solid #334155',
                    background: active ? activeColor : 'transparent',
                    color: active ? '#0f172a' : '#94a3b8',
                    fontWeight: 600,
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  {lbl}
                </button>
              );
            })}
          </div>

          {/* Asset / GWG: link_to_asset_id */}
          {(draft.classification === 'asset' || draft.classification === 'gwg') && (
            <div style={{ marginBottom: 10 }}>
              <span style={label}>An existierende Anlage hängen (optional)</span>
              <select
                style={input}
                value={draft.link_to_asset_id}
                onChange={(e) => update('link_to_asset_id', e.target.value)}
              >
                <option value="">— Neue Anlage anlegen —</option>
                {assets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                    {a.serial_number ? ` · SN ${a.serial_number}` : ''}
                    {' · '}
                    {a.purchase_price > 0 ? `${a.purchase_price.toFixed(2)} €` : 'kein Preis'}
                    {a.depreciation_method === 'immediate' ? ' · GWG' : ''}
                  </option>
                ))}
              </select>
              <span style={{ fontSize: 10, color: '#64748b', display: 'block', marginTop: 4 }}>
                {draft.link_to_asset_id
                  ? '✓ Position wird der gewählten Anlage als Beleg zugeordnet. Falls die Anlage noch keinen Kaufpreis hat, wird er übernommen.'
                  : 'Wenn leer: neue Anlage wird automatisch angelegt.'}
              </span>
            </div>
          )}

          {/* Asset (ohne Link): volle Felder */}
          {draft.classification === 'asset' && !draft.link_to_asset_id && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
              <div>
                <span style={label}>Art</span>
                <select style={input} value={draft.kind} onChange={(e) => update('kind', e.target.value as AssetKind)}>
                  {Object.entries(KIND_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              <div>
                <span style={label}>Name</span>
                <input style={input} value={draft.name} onChange={(e) => update('name', e.target.value)} />
              </div>
              <div>
                <span style={label}>Nutzungsdauer (Monate)</span>
                <input style={input} type="number" min={1} value={draft.useful_life_months} onChange={(e) => update('useful_life_months', Number(e.target.value))} />
              </div>
              <div>
                <span style={label}>Restwert (€)</span>
                <input style={input} type="number" inputMode="decimal" step="0.01" min={0} value={draft.residual_value} onChange={(e) => update('residual_value', Number(e.target.value))} />
                <span style={{ fontSize: 10, color: '#64748b', marginTop: 2, display: 'block' }}>Default 30% — Zeitwert fällt nicht darunter</span>
              </div>
              <div>
                <span style={label}>Seriennummer</span>
                <input style={input} value={draft.serial_number} onChange={(e) => update('serial_number', e.target.value)} />
              </div>
              {draft.kind === 'rental_camera' && (
                <div>
                  <span style={label}>Produkt verknüpfen</span>
                  <select style={input} value={draft.product_id} onChange={(e) => update('product_id', e.target.value)}>
                    <option value="">— ohne Verknüpfung —</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>{p.brand} {p.name}</option>
                    ))}
                  </select>
                  {draft.product_id && draft.serial_number.trim() && (
                    <span style={{ fontSize: 10, color: '#22c55e', display: 'block', marginTop: 2 }}>
                      ✓ Seriennummer wird als neue Einheit angelegt
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* GWG (ohne Link): wie Asset, aber Hinweisbox + ohne AfA-Felder */}
          {draft.classification === 'gwg' && !draft.link_to_asset_id && (
            <>
              <div style={{
                background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)',
                borderRadius: 8, padding: '8px 12px', marginBottom: 10,
                fontSize: 12, color: '#fde68a', lineHeight: 1.5,
              }}>
                <strong>GWG-Sofortabzug</strong> nach § 6 Abs. 2 EStG: ganzer Nettobetrag landet sofort in der EÜR + Eintrag im Anlagenverzeichnis (Pflicht ab 250 € netto). Buchwert: 0 €.
                {netPrice > GWG_NETTO_MAX && (
                  <span style={{ display: 'block', marginTop: 4, color: '#fca5a5' }}>
                    ⚠ Netto {fmtEuro(netPrice)} liegt über 800 € — eigentlich Pflicht zu linearer AfA.
                  </span>
                )}
                {netPrice > 0 && netPrice < GWG_NETTO_MIN && (
                  <span style={{ display: 'block', marginTop: 4, color: '#94a3b8' }}>
                    Hinweis: Unter 250 &euro; netto reicht &bdquo;Ausgabe&ldquo; &mdash; kein Verzeichnis-Eintrag n&ouml;tig.
                  </span>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
                <div>
                  <span style={label}>Art</span>
                  <select style={input} value={draft.kind} onChange={(e) => update('kind', e.target.value as AssetKind)}>
                    {Object.entries(KIND_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <span style={label}>Name</span>
                  <input style={input} value={draft.name} onChange={(e) => update('name', e.target.value)} />
                </div>
                <div>
                  <span style={label}>Seriennummer</span>
                  <input style={input} value={draft.serial_number} onChange={(e) => update('serial_number', e.target.value)} />
                </div>
                {draft.kind === 'rental_camera' && (
                  <div>
                    <span style={label}>Produkt verknüpfen</span>
                    <select style={input} value={draft.product_id} onChange={(e) => update('product_id', e.target.value)}>
                      <option value="">— ohne Verknüpfung —</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>{p.brand} {p.name}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Expense */}
          {draft.classification === 'expense' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
              <div>
                <span style={label}>Kategorie</span>
                <select style={input} value={draft.expense_category} onChange={(e) => update('expense_category', e.target.value)}>
                  {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              <div>
                <span style={label}>Buchungsdatum</span>
                <input style={input} type="date" value={draft.expense_date} onChange={(e) => update('expense_date', e.target.value)} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <span style={label}>Zugeh&ouml;rige Kamera / Zubeh&ouml;r (optional)</span>
                <select style={input} value={draft.expense_asset_id} onChange={(e) => update('expense_asset_id', e.target.value)}>
                  <option value="">&mdash; Nicht zugeordnet &mdash;</option>
                  {assets.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                      {a.serial_number ? ` &middot; SN ${a.serial_number}` : ''}
                      {' &middot; '}
                      {a.kind === 'rental_camera' ? 'Kamera' : a.kind === 'rental_accessory' ? 'Zubehör' : a.kind}
                    </option>
                  ))}
                </select>
                <span style={{ fontSize: 10, color: '#64748b', display: 'block', marginTop: 4 }}>
                  Verkn&uuml;pft die Ausgabe mit einer Anlage (z.B. SD-Karte f&uuml;r &bdquo;GoPro Hero13&ldquo;) &mdash; taucht sp&auml;ter unter der Anlage als Folgekosten auf.
                </span>
              </div>
            </div>
          )}

          {/* Ignored: kein Formular */}
          {draft.classification === 'ignored' && (
            <p style={{ color: '#94a3b8', fontSize: 12, margin: '4px 0 0' }}>
              Position wird ignoriert — keine Anlage, keine Ausgabe. (z.B. Versandkosten, Rabattzeile)
            </p>
          )}

          {/* Hinweis bei Re-Klassifizierung */}
          {currentStatus !== 'pending' && (
            <div style={{
              background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.3)',
              borderRadius: 8, padding: '8px 12px', marginTop: 10,
              fontSize: 11, color: '#93c5fd', lineHeight: 1.5,
            }}>
              ℹ Neue Klassifizierung überschreibt die bestehende Verknüpfung. Bestehende Asset-Einträge bleiben erhalten (AfA-Buchungen können dranhängen) — nur die Verknüpfung zur Position wird neu gesetzt. Bestehende Ausgaben werden gelöscht und neu gebucht.
            </div>
          )}

          {error && (
            <div style={{ color: '#fca5a5', fontSize: 12, marginTop: 8 }}>{error}</div>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button
              onClick={save}
              disabled={saving}
              style={{
                background: '#06b6d4',
                color: '#0f172a',
                fontWeight: 700,
                fontSize: 13,
                padding: '8px 18px',
                borderRadius: 8,
                border: 'none',
                cursor: saving ? 'wait' : 'pointer',
                opacity: saving ? 0.7 : 1,
              }}
            >
              {saving ? 'Speichert…' : 'Klassifizierung speichern'}
            </button>
            <button
              onClick={() => { setOpen(false); setError(null); }}
              disabled={saving}
              style={{
                background: 'transparent',
                color: '#94a3b8',
                fontWeight: 600,
                fontSize: 13,
                padding: '8px 18px',
                borderRadius: 8,
                border: '1px solid #1e293b',
                cursor: 'pointer',
              }}
            >
              Abbrechen
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
