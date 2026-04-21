'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import AdminBackLink from '@/components/admin/AdminBackLink';
import { formatCurrency } from '@/lib/format-utils';

type Classification = 'asset' | 'expense' | 'ignored';
type Kind = 'rental_camera' | 'rental_accessory' | 'office_equipment' | 'tool' | 'other';

interface AISuggestion {
  suggested_classification?: 'asset' | 'expense';
  suggested_category?: string;
  suggested_kind?: Kind;
  suggested_useful_life_months?: number;
  line_total_gross?: number;
  confidence?: number;
}

interface PurchaseItemRow {
  id: string;
  purchase_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  net_price: number | null;
  tax_rate: number | null;
  classification: Classification | 'pending';
  ai_suggestion: AISuggestion | null;
  asset_id: string | null;
  expense_id: string | null;
  /** pro Zeile im UI lokal editierbare Felder (werden beim Save gesendet) */
  draft?: {
    classification: Classification;
    kind?: Kind;
    name?: string;
    manufacturer?: string;
    model?: string;
    serial_number?: string;
    useful_life_months?: number;
    residual_value?: number;
    product_id?: string;
    expense_category?: string;
    expense_date?: string;
  };
}

interface Product {
  id: string;
  name: string;
  brand: string;
}

const KIND_LABELS: Record<Kind, string> = {
  rental_camera: 'Vermietkamera',
  rental_accessory: 'Vermietbares Zubehoer',
  office_equipment: 'Buero-Ausstattung',
  tool: 'Werkzeug',
  other: 'Sonstiges Anlagegut',
};

const CATEGORY_LABELS: Record<string, string> = {
  stripe_fees: 'Zahlungsgebuehren',
  shipping: 'Versand',
  software: 'Software',
  hardware: 'Hardware',
  marketing: 'Marketing',
  office: 'Buero',
  travel: 'Reisen',
  insurance: 'Versicherungen',
  legal: 'Rechtsberatung',
  asset_purchase: 'GWG-Sofortabzug',
  other: 'Sonstiges',
};

const cyan = '#06b6d4';
const card: React.CSSProperties = { background: '#111827', borderRadius: 12, border: '1px solid #1e293b', padding: 20 };
const input: React.CSSProperties = { background: '#0a0f1e', border: '1px solid #1e293b', borderRadius: 8, padding: '8px 10px', color: '#e2e8f0', fontSize: 13, width: '100%' };
const label: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' };

export default function RechnungUploadPage() {
  const [stage, setStage] = useState<'upload' | 'processing' | 'classify' | 'done'>('upload');
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState('');
  const [items, setItems] = useState<PurchaseItemRow[]>([]);
  const [supplierName, setSupplierName] = useState<string>('');
  const [invoiceNumber, setInvoiceNumber] = useState<string>('');
  const [invoiceDate, setInvoiceDate] = useState<string>('');
  const [totals, setTotals] = useState<{ net: number; tax: number; gross: number }>({ net: 0, tax: 0, gross: 0 });
  const [products, setProducts] = useState<Product[]>([]);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/products')
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d?.products)) {
          setProducts(d.products.map((p: { id: string; name: string; brand: string }) => ({ id: p.id, name: p.name, brand: p.brand })));
        }
      })
      .catch(() => { /* silent */ });
  }, []);

  async function handleFile(file: File) {
    setError(null);
    setStage('processing');
    setProgress('Lade Datei hoch…');

    const form = new FormData();
    form.append('file', file);

    try {
      setProgress('Claude analysiert die Rechnung (5-15 Sekunden)…');
      const res = await fetch('/api/admin/purchases/upload', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || 'Upload fehlgeschlagen');
        setStage('upload');
        return;
      }

      setSupplierName(data.extracted?.supplier?.name ?? '');
      setInvoiceNumber(data.extracted?.invoice_number ?? '');
      setInvoiceDate(data.extracted?.invoice_date ?? '');
      setTotals(data.extracted?.totals ?? { net: 0, tax: 0, gross: 0 });

      const rows: PurchaseItemRow[] = (data.items ?? []).map((it: PurchaseItemRow) => {
        const netto = Number(it.net_price ?? 0);
        return {
          ...it,
          draft: {
            classification: (it.ai_suggestion?.suggested_classification as Classification) ?? 'expense',
            kind: it.ai_suggestion?.suggested_kind,
            name: it.product_name,
            useful_life_months: it.ai_suggestion?.suggested_useful_life_months ?? 36,
            // 30 % vom Nettopreis als realistischer Gebrauchtwert — stellt sicher,
            // dass der Zeitwert im Mietvertrag nie auf 0 faellt.
            residual_value: Math.round(netto * 0.3 * 100) / 100,
            expense_category: it.ai_suggestion?.suggested_category ?? 'hardware',
            expense_date: data.extracted?.invoice_date ?? new Date().toISOString().slice(0, 10),
          },
        };
      });
      setItems(rows);
      setStage('classify');
      setProgress('');
    } catch (err) {
      setError((err as Error).message || 'Unerwarteter Fehler');
      setStage('upload');
    }
  }

  function updateDraft(rowId: string, changes: Partial<NonNullable<PurchaseItemRow['draft']>>) {
    setItems((prev) => prev.map((r) => r.id === rowId ? { ...r, draft: { ...(r.draft ?? { classification: 'expense' }), ...changes } } : r));
  }

  async function saveAll() {
    setSaving(true);
    setError(null);
    try {
      for (const row of items) {
        const draft = row.draft;
        if (!draft) continue;
        const body: Record<string, unknown> = { classification: draft.classification };
        if (draft.classification === 'asset') {
          if (!draft.kind || !draft.name) throw new Error(`"${row.product_name}": Kind und Name sind Pflicht`);
          body.kind = draft.kind;
          body.name = draft.name;
          body.manufacturer = draft.manufacturer;
          body.model = draft.model;
          body.serial_number = draft.serial_number;
          body.useful_life_months = draft.useful_life_months;
          body.residual_value = draft.residual_value;
          body.product_id = draft.product_id;
        } else if (draft.classification === 'expense') {
          body.category = draft.expense_category ?? 'hardware';
          body.expense_date = draft.expense_date;
          body.description = row.product_name;
        }
        const res = await fetch(`/api/admin/purchase-items/${row.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(`"${row.product_name}": ${data?.error ?? res.status}`);
        }
      }
      setStage('done');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0f1e', padding: '24px 20px' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <AdminBackLink href="/admin/einkauf" label="Zurueck zu Einkauf" />

        <h1 style={{ color: '#f1f5f9', fontSize: 28, fontWeight: 800, marginTop: 16, marginBottom: 6 }}>
          Rechnung hochladen
        </h1>
        <p style={{ color: '#94a3b8', marginBottom: 24, fontSize: 14 }}>
          Lade eine PDF-Rechnung oder ein Foto hoch. Claude analysiert Lieferant, Positionen und Summen.
          Klassifiziere anschliessend jede Position als Anlagegut (mit AfA) oder Betriebsausgabe.
        </p>

        {error && (
          <div style={{ ...card, borderColor: '#ef4444', background: 'rgba(239,68,68,0.1)', marginBottom: 20 }}>
            <p style={{ color: '#fca5a5', fontWeight: 600 }}>{error}</p>
          </div>
        )}

        {stage === 'upload' && (
          <div style={card}>
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); }}
              onClick={() => fileRef.current?.click()}
              style={{
                border: '2px dashed #334155', borderRadius: 12, padding: 48, textAlign: 'center',
                cursor: 'pointer', background: '#0a0f1e',
              }}
            >
              <div style={{ fontSize: 48, marginBottom: 12 }}>📄</div>
              <p style={{ color: '#e2e8f0', fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
                Rechnung hierher ziehen oder klicken
              </p>
              <p style={{ color: '#64748b', fontSize: 13 }}>
                PDF, JPG, PNG oder WebP — max. 20 MB
              </p>
              <input
                ref={fileRef}
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/webp"
                hidden
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
            </div>
            <p style={{ color: '#64748b', fontSize: 12, marginTop: 16, lineHeight: 1.5 }}>
              Hinweis: Die Analyse nutzt Claude Sonnet 4.6 und kostet ~0,01-0,03 € pro Rechnung.
              API-Key wird aus den Blog-Einstellungen gelesen.
            </p>
          </div>
        )}

        {stage === 'processing' && (
          <div style={card}>
            <div style={{ textAlign: 'center', padding: 32 }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
              <p style={{ color: '#e2e8f0', fontSize: 16 }}>{progress}</p>
            </div>
          </div>
        )}

        {stage === 'classify' && (
          <>
            <div style={{ ...card, marginBottom: 20 }}>
              <h2 style={{ color: '#f1f5f9', fontSize: 18, fontWeight: 700, marginBottom: 16 }}>
                Rechnungs-Metadaten (von KI extrahiert)
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
                <div>
                  <span style={label}>Lieferant</span>
                  <div style={{ color: '#e2e8f0', fontWeight: 600 }}>{supplierName}</div>
                </div>
                <div>
                  <span style={label}>Rechnungsnummer</span>
                  <div style={{ color: '#e2e8f0' }}>{invoiceNumber || '—'}</div>
                </div>
                <div>
                  <span style={label}>Datum</span>
                  <div style={{ color: '#e2e8f0' }}>{invoiceDate || '—'}</div>
                </div>
                <div>
                  <span style={label}>Summe (brutto)</span>
                  <div style={{ color: cyan, fontWeight: 700 }}>{formatCurrency(totals.gross)}</div>
                </div>
              </div>
            </div>

            <div style={{ ...card, marginBottom: 20 }}>
              <h2 style={{ color: '#f1f5f9', fontSize: 18, fontWeight: 700, marginBottom: 4 }}>
                Positionen klassifizieren
              </h2>
              <p style={{ color: '#64748b', fontSize: 13, marginBottom: 20 }}>
                Claude hat fuer jede Position einen Vorschlag gemacht. Pruefe und korrigiere.
              </p>

              {items.map((row) => (
                <div key={row.id} style={{ borderTop: '1px solid #1e293b', padding: '16px 0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, gap: 16 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ color: '#e2e8f0', fontWeight: 600, fontSize: 14 }}>{row.product_name}</div>
                      <div style={{ color: '#64748b', fontSize: 12, marginTop: 4 }}>
                        {row.quantity}x · Netto {formatCurrency(row.net_price ?? 0)} · {row.tax_rate ?? 19}% USt
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {(['asset', 'expense', 'ignored'] as Classification[]).map((c) => (
                        <button
                          key={c}
                          onClick={() => updateDraft(row.id, { classification: c })}
                          style={{
                            padding: '6px 12px', borderRadius: 6, border: '1px solid #334155',
                            background: row.draft?.classification === c ? cyan : 'transparent',
                            color: row.draft?.classification === c ? '#0f172a' : '#94a3b8',
                            fontWeight: 600, fontSize: 12, cursor: 'pointer',
                          }}
                        >
                          {c === 'asset' ? 'Anlagegut' : c === 'expense' ? 'Ausgabe' : 'Ignorieren'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {row.ai_suggestion?.suggested_classification && (
                    <div style={{ fontSize: 11, color: '#64748b', marginBottom: 8 }}>
                      KI-Vorschlag: <strong style={{ color: '#94a3b8' }}>{row.ai_suggestion.suggested_classification === 'asset' ? 'Anlagegut' : 'Ausgabe'}</strong>
                      {row.ai_suggestion.confidence != null && ` (${Math.round(row.ai_suggestion.confidence * 100)}% Sicherheit)`}
                    </div>
                  )}

                  {row.draft?.classification === 'asset' && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginTop: 8 }}>
                      <div>
                        <span style={label}>Art</span>
                        <select style={input} value={row.draft?.kind ?? 'other'} onChange={(e) => updateDraft(row.id, { kind: e.target.value as Kind })}>
                          {Object.entries(KIND_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                      </div>
                      <div>
                        <span style={label}>Name</span>
                        <input style={input} value={row.draft.name ?? ''} onChange={(e) => updateDraft(row.id, { name: e.target.value })} />
                      </div>
                      <div>
                        <span style={label}>Nutzungsdauer (Monate)</span>
                        <input style={input} type="number" min={1} value={row.draft.useful_life_months ?? 36} onChange={(e) => updateDraft(row.id, { useful_life_months: Number(e.target.value) })} />
                      </div>
                      <div>
                        <span style={label}>Restwert (EUR)</span>
                        <input style={input} type="number" step="0.01" min={0} value={row.draft.residual_value ?? 0} onChange={(e) => updateDraft(row.id, { residual_value: Number(e.target.value) })} />
                        <span style={{ fontSize: 10, color: '#64748b', marginTop: 2, display: 'block' }}>Default 30 % vom Kaufpreis — Zeitwert faellt nicht darunter</span>
                      </div>
                      <div>
                        <span style={label}>Seriennummer</span>
                        <input style={input} value={row.draft.serial_number ?? ''} onChange={(e) => updateDraft(row.id, { serial_number: e.target.value })} />
                      </div>
                      {row.draft.kind === 'rental_camera' && (
                        <div>
                          <span style={label}>Produkt verknuepfen</span>
                          <select style={input} value={row.draft.product_id ?? ''} onChange={(e) => updateDraft(row.id, { product_id: e.target.value || undefined })}>
                            <option value="">— ohne Verknuepfung —</option>
                            {products.map((p) => <option key={p.id} value={p.id}>{p.brand} {p.name}</option>)}
                          </select>
                        </div>
                      )}
                    </div>
                  )}

                  {row.draft?.classification === 'expense' && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginTop: 8 }}>
                      <div>
                        <span style={label}>Kategorie</span>
                        <select style={input} value={row.draft.expense_category ?? 'hardware'} onChange={(e) => updateDraft(row.id, { expense_category: e.target.value })}>
                          {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                      </div>
                      <div>
                        <span style={label}>Buchungsdatum</span>
                        <input style={input} type="date" value={row.draft.expense_date ?? ''} onChange={(e) => updateDraft(row.id, { expense_date: e.target.value })} />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <a href="/admin/einkauf" style={{ padding: '12px 24px', borderRadius: 10, border: '1px solid #1e293b', color: '#94a3b8', textDecoration: 'none', fontWeight: 600, fontSize: 13 }}>
                Abbrechen
              </a>
              <button
                onClick={saveAll}
                disabled={saving}
                style={{
                  padding: '12px 24px', borderRadius: 10, background: cyan, color: '#0f172a',
                  border: 'none', fontWeight: 700, fontSize: 13, cursor: saving ? 'wait' : 'pointer',
                  opacity: saving ? 0.7 : 1,
                }}
              >
                {saving ? 'Speichere…' : 'Alle Positionen verbuchen'}
              </button>
            </div>
          </>
        )}

        {stage === 'done' && (
          <div style={card}>
            <div style={{ textAlign: 'center', padding: 40 }}>
              <div style={{ fontSize: 64, marginBottom: 16 }}>✅</div>
              <h2 style={{ color: '#f1f5f9', fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Rechnung verbucht</h2>
              <p style={{ color: '#94a3b8', marginBottom: 24 }}>
                Alle Positionen wurden als Anlagegut oder Ausgabe erfasst.
              </p>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                <a href="/admin/einkauf" style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid #1e293b', color: '#94a3b8', textDecoration: 'none', fontWeight: 600, fontSize: 13 }}>
                  Zu Einkaeufe
                </a>
                <Link href="/admin/anlagen" style={{ padding: '10px 20px', borderRadius: 8, background: cyan, color: '#0f172a', textDecoration: 'none', fontWeight: 700, fontSize: 13 }}>
                  Zum Anlagenverzeichnis
                </Link>
                <button
                  onClick={() => {
                    setStage('upload');
                    setItems([]);
                    setError(null);
                  }}
                  style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid #334155', background: 'transparent', color: '#e2e8f0', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
                >
                  Weitere Rechnung
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
