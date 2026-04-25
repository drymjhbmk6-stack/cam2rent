'use client';

import { useEffect, useState, use } from 'react';
import AdminBackLink from '@/components/admin/AdminBackLink';
import { formatCurrency, fmtDate } from '@/lib/format-utils';

interface Asset {
  id: string;
  kind: string;
  name: string;
  description: string | null;
  manufacturer: string | null;
  model: string | null;
  serial_number: string | null;
  purchase_price: number;
  purchase_date: string;
  current_value: number;
  useful_life_months: number;
  depreciation_method: 'linear' | 'none' | 'immediate';
  residual_value: number | null;
  last_depreciation_at: string | null;
  status: 'active' | 'disposed' | 'sold' | 'lost';
  disposed_at: string | null;
  disposal_proceeds: number | null;
  unit_id: string | null;
  product_id: string | null;
  notes: string | null;
  is_test: boolean;
  supplier: { id: string; name: string } | null;
  purchase: { id: string; invoice_number: string | null; invoice_storage_path: string | null; order_date: string } | null;
  unit: { id: string; serial_number: string; label: string | null; status: string } | null;
}

interface DepreciationEntry {
  id: string;
  expense_date: string;
  gross_amount: number;
  notes: string | null;
}

const card: React.CSSProperties = { background: '#111827', borderRadius: 12, border: '1px solid #1e293b', padding: 20 };
const cyan = '#06b6d4';
const label: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4, display: 'block' };

export default function AssetDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = use(props.params);
  const [asset, setAsset] = useState<Asset | null>(null);
  const [history, setHistory] = useState<DepreciationEntry[]>([]);
  const [computed, setComputed] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/admin/assets/${id}`)
      .then((r) => r.json())
      .then((d) => {
        if (d?.asset) {
          setAsset(d.asset);
          setHistory(d.depreciation_history ?? []);
          setComputed(d.computed_current_value ?? null);
        }
      })
      .finally(() => setLoading(false));
  }, [id]);

  async function catchup() {
    setMsg('Laufe AfA nach…');
    const res = await fetch(`/api/admin/assets/${id}/depreciation-catchup`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) {
      setMsg(`Fehler: ${data?.error ?? 'unbekannt'}`);
      return;
    }
    setMsg(`${data.months_processed} Monate nachgetragen. Zeitwert: ${formatCurrency(data.new_current_value)}`);
    // Reload
    const r2 = await fetch(`/api/admin/assets/${id}`);
    const d2 = await r2.json();
    if (d2?.asset) {
      setAsset(d2.asset);
      setHistory(d2.depreciation_history ?? []);
      setComputed(d2.computed_current_value ?? null);
    }
  }

  async function dispose(kind: 'disposed' | 'sold' | 'lost') {
    const proceedsStr = kind === 'sold' ? prompt('Verkaufserloes in EUR?') : '';
    if (kind === 'sold' && !proceedsStr) return;
    const body: Record<string, unknown> = {
      status: kind,
      disposed_at: new Date().toISOString().slice(0, 10),
    };
    if (kind === 'sold') body.disposal_proceeds = Number(proceedsStr);
    const res = await fetch(`/api/admin/assets/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const d = await res.json();
      setMsg(`Fehler: ${d?.error}`);
      return;
    }
    const r2 = await fetch(`/api/admin/assets/${id}`);
    const d2 = await r2.json();
    setAsset(d2.asset);
  }

  if (loading) return <div style={{ minHeight: '100dvh', background: '#0a0f1e', padding: 40, color: '#64748b' }}>Lade…</div>;
  if (!asset) return <div style={{ minHeight: '100dvh', background: '#0a0f1e', padding: 40, color: '#ef4444' }}>Asset nicht gefunden</div>;

  const monthlyRate = asset.depreciation_method === 'linear'
    ? (Number(asset.purchase_price) - Number(asset.residual_value ?? 0)) / Number(asset.useful_life_months)
    : 0;

  return (
    <div style={{ minHeight: '100dvh', background: '#0a0f1e', padding: '24px 20px' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <AdminBackLink href="/admin/anlagen" label="Zurück zum Anlagenverzeichnis" />

        <div style={{ marginTop: 16, marginBottom: 24 }}>
          <h1 style={{ color: '#f1f5f9', fontSize: 28, fontWeight: 800, marginBottom: 6 }}>{asset.name}</h1>
          <div style={{ color: '#94a3b8', fontSize: 14 }}>
            {asset.manufacturer} {asset.model} {asset.serial_number && <span>· SN {asset.serial_number}</span>}
            {asset.is_test && <span style={{ marginLeft: 8, padding: '2px 8px', borderRadius: 999, background: 'rgba(245,158,11,0.15)', color: '#f59e0b', fontSize: 11, fontWeight: 700 }}>TEST</span>}
          </div>
        </div>

        {msg && (
          <div style={{ ...card, marginBottom: 20, borderColor: cyan, background: 'rgba(6,182,212,0.1)' }}>
            <p style={{ color: cyan }}>{msg}</p>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 20 }}>
          <div style={card}>
            <span style={label}>Anschaffungswert</span>
            <div style={{ fontSize: 24, color: '#f1f5f9', fontWeight: 800 }}>{formatCurrency(asset.purchase_price)}</div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>am {fmtDate(asset.purchase_date)}</div>
          </div>
          <div style={card}>
            <span style={label}>Aktueller Zeitwert (DB)</span>
            <div style={{ fontSize: 24, color: cyan, fontWeight: 800 }}>{formatCurrency(asset.current_value)}</div>
            {computed != null && Math.abs(Number(asset.current_value) - computed) > 0.5 && (
              <div style={{ fontSize: 12, color: '#f59e0b', marginTop: 4 }}>
                Berechnet aktuell: {formatCurrency(computed)} — AfA-Lauf ausstehend
              </div>
            )}
          </div>
          <div style={card}>
            <span style={label}>Abschreibung</span>
            <div style={{ fontSize: 15, color: '#e2e8f0', fontWeight: 600 }}>
              {asset.depreciation_method === 'linear'
                ? `Linear ueber ${asset.useful_life_months} Monate`
                : asset.depreciation_method === 'immediate' ? 'Sofort' : 'Keine AfA'}
            </div>
            {asset.depreciation_method === 'linear' && (
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                {formatCurrency(monthlyRate)} / Monat
              </div>
            )}
          </div>
        </div>

        {/* Aktionen */}
        <div style={{ ...card, marginBottom: 20 }}>
          <h3 style={{ color: '#f1f5f9', fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Aktionen</h3>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {asset.status === 'active' && (
              <>
                <button onClick={catchup} style={btnPrimary}>AfA nachholen</button>
                <button onClick={() => dispose('sold')} style={btnSecondary}>Verkauft</button>
                <button onClick={() => dispose('disposed')} style={btnSecondary}>Ausmustern</button>
                <button onClick={() => dispose('lost')} style={btnDanger}>Verlust</button>
              </>
            )}
            {asset.purchase?.invoice_storage_path && (
              <a href={`/api/admin/invoices/purchase-pdf?path=${encodeURIComponent(asset.purchase.invoice_storage_path)}`} target="_blank" rel="noopener noreferrer" style={{ ...btnSecondary, textDecoration: 'none', display: 'inline-block' }}>
                📄 Rechnung anzeigen
              </a>
            )}
          </div>
        </div>

        {/* Stammdaten */}
        <div style={{ ...card, marginBottom: 20 }}>
          <h3 style={{ color: '#f1f5f9', fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Stammdaten</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
            <Field k="Lieferant" v={asset.supplier?.name} />
            <Field k="Rechnungsnummer" v={asset.purchase?.invoice_number} />
            <Field k="Seriennummer" v={asset.serial_number} />
            <Field k="Unit (Vermietung)" v={asset.unit ? `${asset.unit.label ?? asset.unit.serial_number} (${asset.unit.status})` : null} />
            <Field k="Produkt-ID" v={asset.product_id} />
            <Field k="Restwert" v={asset.residual_value != null ? formatCurrency(asset.residual_value) : null} />
            <Field k="Letzte AfA" v={asset.last_depreciation_at ? fmtDate(asset.last_depreciation_at) : 'noch keine'} />
          </div>
          {asset.notes && (
            <>
              <span style={label}>Notizen</span>
              <p style={{ color: '#94a3b8', fontSize: 13, whiteSpace: 'pre-wrap', marginTop: 4 }}>{asset.notes}</p>
            </>
          )}
        </div>

        {/* AfA-Historie */}
        <div style={card}>
          <h3 style={{ color: '#f1f5f9', fontSize: 15, fontWeight: 700, marginBottom: 12 }}>AfA-Historie</h3>
          {history.length === 0 ? (
            <p style={{ color: '#64748b', fontSize: 13 }}>Noch keine AfA-Buchungen.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #1e293b' }}>
                  <th style={{ ...th, textAlign: 'left' }}>Datum</th>
                  <th style={{ ...th, textAlign: 'right' }}>Betrag</th>
                  <th style={{ ...th, textAlign: 'left' }}>Notiz</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id} style={{ borderBottom: '1px solid #1e293b' }}>
                    <td style={td}>{fmtDate(h.expense_date)}</td>
                    <td style={{ ...td, textAlign: 'right', color: '#f59e0b', fontWeight: 600 }}>-{formatCurrency(h.gross_amount)}</td>
                    <td style={{ ...td, color: '#94a3b8' }}>{h.notes ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ k, v }: { k: string; v: string | null | undefined }) {
  return (
    <div>
      <span style={label}>{k}</span>
      <div style={{ color: '#e2e8f0', fontSize: 13 }}>{v || '—'}</div>
    </div>
  );
}

const btnPrimary: React.CSSProperties = { padding: '8px 14px', borderRadius: 8, background: cyan, color: '#0f172a', border: 'none', fontWeight: 700, fontSize: 12, cursor: 'pointer' };
const btnSecondary: React.CSSProperties = { padding: '8px 14px', borderRadius: 8, background: 'transparent', color: '#94a3b8', border: '1px solid #334155', fontWeight: 600, fontSize: 12, cursor: 'pointer' };
const btnDanger: React.CSSProperties = { padding: '8px 14px', borderRadius: 8, background: 'transparent', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)', fontWeight: 600, fontSize: 12, cursor: 'pointer' };
const th: React.CSSProperties = { padding: '8px 12px', fontSize: 11, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 };
const td: React.CSSProperties = { padding: '10px 12px', color: '#e2e8f0' };
