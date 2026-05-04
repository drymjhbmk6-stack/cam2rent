'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import AdminBackLink from '@/components/admin/AdminBackLink';
import { formatCurrency, fmtDate } from '@/lib/format-utils';

interface Asset {
  id: string;
  kind: 'rental_camera' | 'rental_accessory' | 'office_equipment' | 'tool' | 'other';
  name: string;
  manufacturer: string | null;
  model: string | null;
  serial_number: string | null;
  purchase_price: number;
  purchase_date: string;
  current_value: number;
  replacement_value_estimate: number | null;
  useful_life_months: number;
  depreciation_method: 'linear' | 'none' | 'immediate';
  last_depreciation_at: string | null;
  status: 'active' | 'disposed' | 'sold' | 'lost';
  unit_id: string | null;
  product_id: string | null;
  supplier: { id: string; name: string } | null;
  purchase: { id: string; invoice_number: string | null; invoice_storage_path: string | null; order_date: string } | null;
  is_test?: boolean;
}

const KIND_LABELS: Record<Asset['kind'], { label: string; color: string; bg: string }> = {
  rental_camera: { label: 'Vermietkamera', color: '#06b6d4', bg: 'rgba(6,182,212,0.15)' },
  rental_accessory: { label: 'Zubehör', color: '#8b5cf6', bg: 'rgba(139,92,246,0.15)' },
  office_equipment: { label: 'Büro', color: '#f59e0b', bg: 'rgba(245,158,11,0.15)' },
  tool: { label: 'Werkzeug', color: '#10b981', bg: 'rgba(16,185,129,0.15)' },
  other: { label: 'Sonstiges', color: '#64748b', bg: 'rgba(100,116,139,0.15)' },
};

const STATUS_LABELS: Record<Asset['status'], { label: string; color: string }> = {
  active: { label: 'Aktiv', color: '#22c55e' },
  disposed: { label: 'Ausgemustert', color: '#64748b' },
  sold: { label: 'Verkauft', color: '#f59e0b' },
  lost: { label: 'Verlust', color: '#ef4444' },
};

const card: React.CSSProperties = { background: '#111827', borderRadius: 12, border: '1px solid #1e293b' };
const cyan = '#06b6d4';

export default function AnlagenPage() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterKind, setFilterKind] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('active');
  const [filterMethod, setFilterMethod] = useState<string>('');
  const [search, setSearch] = useState('');
  const [isTestMode, setIsTestMode] = useState(false);

  useEffect(() => {
    // Im Test-Modus zusaetzlich Test-Assets anzeigen — sonst sieht man die
    // gerade nachgetragenen Altbestand-Assets nicht (die werden mit
    // is_test=true gespeichert).
    fetch('/api/env-mode')
      .then((r) => r.json())
      .then((d) => setIsTestMode(d?.mode === 'test'))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    if (filterKind) params.set('kind', filterKind);
    if (filterStatus) params.set('status', filterStatus);
    if (isTestMode) params.set('include_test', '1');
    fetch(`/api/admin/assets?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => setAssets(d.assets ?? []))
      .finally(() => setLoading(false));
  }, [filterKind, filterStatus, isTestMode]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return assets.filter((a) => {
      if (filterMethod && a.depreciation_method !== filterMethod) return false;
      if (!q) return true;
      return (
        a.name.toLowerCase().includes(q) ||
        (a.serial_number ?? '').toLowerCase().includes(q) ||
        (a.manufacturer ?? '').toLowerCase().includes(q) ||
        (a.supplier?.name ?? '').toLowerCase().includes(q)
      );
    });
  }, [assets, search, filterMethod]);

  const totals = useMemo(() => {
    let purchase = 0;
    let current = 0;
    let gwgCount = 0;
    let gwgPurchase = 0;
    for (const a of filtered) {
      purchase += Number(a.purchase_price);
      current += Number(a.current_value);
      if (a.depreciation_method === 'immediate') {
        gwgCount += 1;
        gwgPurchase += Number(a.purchase_price);
      }
    }
    return { purchase, current, depreciated: purchase - current, gwgCount, gwgPurchase };
  }, [filtered]);

  return (
    <div style={{ minHeight: '100dvh', background: '#0a0f1e', padding: '24px 20px' }}>
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>
        <AdminBackLink />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ color: '#f1f5f9', fontSize: 28, fontWeight: 800, marginBottom: 6 }}>Anlagenverzeichnis</h1>
            <p style={{ color: '#94a3b8', fontSize: 14 }}>Alle Anlagegueter mit aktuellem Zeitwert und AfA-Historie.</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Link href="/admin/anlagen/nachtragen" style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid #334155', color: '#94a3b8', textDecoration: 'none', fontWeight: 600, fontSize: 13 }}>
              + Bestand nachtragen
            </Link>
            <Link href="/admin/einkauf/upload" style={{ padding: '10px 16px', borderRadius: 8, background: cyan, color: '#0f172a', textDecoration: 'none', fontWeight: 700, fontSize: 13 }}>
              📄 Rechnung hochladen
            </Link>
          </div>
        </div>

        {/* KPI-Karten */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, marginBottom: 20 }}>
          <div style={{ ...card, padding: 20 }}>
            <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Anlagen (gefiltert)</div>
            <div style={{ fontSize: 28, color: '#f1f5f9', fontWeight: 800, marginTop: 8 }}>{filtered.length}</div>
          </div>
          <div style={{ ...card, padding: 20 }}>
            <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Anschaffungswert gesamt</div>
            <div style={{ fontSize: 28, color: '#f1f5f9', fontWeight: 800, marginTop: 8 }}>{formatCurrency(totals.purchase)}</div>
          </div>
          <div style={{ ...card, padding: 20 }}>
            <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Aktueller Zeitwert</div>
            <div style={{ fontSize: 28, color: cyan, fontWeight: 800, marginTop: 8 }}>{formatCurrency(totals.current)}</div>
          </div>
          <div style={{ ...card, padding: 20 }}>
            <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Bereits abgeschrieben</div>
            <div style={{ fontSize: 28, color: '#f59e0b', fontWeight: 800, marginTop: 8 }}>{formatCurrency(totals.depreciated)}</div>
          </div>
          <div
            style={{ ...card, padding: 20, cursor: 'pointer' }}
            title="Klicken: nur GWG zeigen"
            onClick={() => setFilterMethod(filterMethod === 'immediate' ? '' : 'immediate')}
          >
            <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Davon GWG (sofort){filterMethod === 'immediate' ? ' · aktiv' : ''}
            </div>
            <div style={{ fontSize: 28, color: '#f59e0b', fontWeight: 800, marginTop: 8 }}>
              {totals.gwgCount} <span style={{ fontSize: 14, color: '#94a3b8', fontWeight: 600 }}>· {formatCurrency(totals.gwgPurchase)}</span>
            </div>
          </div>
        </div>

        {/* Filter */}
        <div style={{ ...card, padding: 16, marginBottom: 20 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <input
              type="text"
              placeholder="Suche (Name, Seriennummer, Lieferant)…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ flex: '1 1 240px', background: '#0a0f1e', border: '1px solid #1e293b', borderRadius: 8, padding: '10px 12px', color: '#e2e8f0', fontSize: 14 }}
            />
            <select value={filterKind} onChange={(e) => setFilterKind(e.target.value)} style={{ background: '#0a0f1e', border: '1px solid #1e293b', borderRadius: 8, padding: '10px 12px', color: '#e2e8f0', fontSize: 14 }}>
              <option value="">Alle Arten</option>
              {Object.entries(KIND_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={{ background: '#0a0f1e', border: '1px solid #1e293b', borderRadius: 8, padding: '10px 12px', color: '#e2e8f0', fontSize: 14 }}>
              <option value="">Alle Status</option>
              <option value="active">Nur aktive</option>
              <option value="disposed">Ausgemustert</option>
              <option value="sold">Verkauft</option>
              <option value="lost">Verlust</option>
            </select>
            <select value={filterMethod} onChange={(e) => setFilterMethod(e.target.value)} style={{ background: '#0a0f1e', border: '1px solid #1e293b', borderRadius: 8, padding: '10px 12px', color: '#e2e8f0', fontSize: 14 }}>
              <option value="">Alle AfA-Methoden</option>
              <option value="linear">Linear (AfA)</option>
              <option value="immediate">GWG (sofort)</option>
              <option value="none">Keine AfA</option>
            </select>
          </div>
        </div>

        {/* Liste */}
        <div style={{ ...card, overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>Lade Anlagen…</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>
              Keine Anlagegueter gefunden. <Link href="/admin/einkauf/upload" style={{ color: cyan }}>Rechnung hochladen</Link> oder <Link href="/admin/anlagen/nachtragen" style={{ color: cyan }}>Bestand nachtragen</Link>.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', minWidth: 1000, borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#0a0f1e' }}>
                    <th style={th}>Name</th>
                    <th style={th}>Art</th>
                    <th style={th}>Kaufdatum</th>
                    <th style={{ ...th, textAlign: 'right' }}>Anschaffung</th>
                    <th style={{ ...th, textAlign: 'right' }}>Zeitwert</th>
                    <th style={{ ...th, textAlign: 'right' }}>Wiederb.-Wert</th>
                    <th style={th}>Status</th>
                    <th style={th}>Lieferant</th>
                    <th style={th}>Rechnung</th>
                    <th style={th}></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((a) => (
                    <tr key={a.id} style={{ borderTop: '1px solid #1e293b' }}>
                      <td style={td}>
                        <div style={{ color: '#e2e8f0', fontWeight: 600 }}>{a.name}</div>
                        {a.serial_number && <div style={{ color: '#64748b', fontSize: 11, marginTop: 2 }}>SN: {a.serial_number}</div>}
                      </td>
                      <td style={td}>
                        <span style={{
                          display: 'inline-block', padding: '3px 10px', borderRadius: 999,
                          fontSize: 11, fontWeight: 700,
                          background: KIND_LABELS[a.kind].bg, color: KIND_LABELS[a.kind].color,
                        }}>
                          {KIND_LABELS[a.kind].label}
                        </span>
                        {a.depreciation_method === 'immediate' && (
                          <span
                            title="Geringwertiges Wirtschaftsgut — sofort abgeschrieben (§ 6 Abs. 2 EStG)"
                            style={{
                              display: 'inline-block', padding: '3px 8px', borderRadius: 999,
                              fontSize: 10, fontWeight: 700, marginLeft: 6,
                              background: 'rgba(245,158,11,0.15)', color: '#f59e0b',
                            }}
                          >
                            GWG
                          </span>
                        )}
                      </td>
                      <td style={td}>{fmtDate(a.purchase_date)}</td>
                      <td style={{ ...td, textAlign: 'right', color: '#e2e8f0' }}>{formatCurrency(a.purchase_price)}</td>
                      <td style={{ ...td, textAlign: 'right', color: cyan, fontWeight: 600 }}>{formatCurrency(a.current_value)}</td>
                      <td style={{ ...td, textAlign: 'right', color: a.replacement_value_estimate != null ? '#10b981' : '#64748b', fontWeight: 600 }}>
                        {a.replacement_value_estimate != null ? formatCurrency(a.replacement_value_estimate) : <span style={{ fontStyle: 'italic' }}>—</span>}
                      </td>
                      <td style={td}>
                        <span style={{ color: STATUS_LABELS[a.status].color, fontWeight: 600, fontSize: 12 }}>{STATUS_LABELS[a.status].label}</span>
                      </td>
                      <td style={{ ...td, color: '#94a3b8' }}>{a.supplier?.name ?? '—'}</td>
                      <td style={td}>
                        {a.purchase?.invoice_storage_path ? (
                          <a href={`/api/admin/invoices/purchase-pdf?path=${encodeURIComponent(a.purchase.invoice_storage_path)}`} target="_blank" rel="noopener noreferrer" style={{ color: cyan, fontSize: 12 }}>
                            📄 PDF
                          </a>
                        ) : '—'}
                      </td>
                      <td style={{ ...td, textAlign: 'right' }}>
                        <a href={`/admin/anlagen/${a.id}`} style={{ color: cyan, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>Details →</a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const th: React.CSSProperties = { padding: '12px 16px', textAlign: 'left', color: '#64748b', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 };
const td: React.CSSProperties = { padding: '14px 16px', color: '#94a3b8', verticalAlign: 'top' };
