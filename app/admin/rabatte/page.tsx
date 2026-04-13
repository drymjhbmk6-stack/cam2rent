'use client';

import { useState, useEffect } from 'react';
import type { DurationDiscount, LoyaltyDiscount, ProductDiscount } from '@/lib/price-config';
import AdminBackLink from '@/components/admin/AdminBackLink';

interface ProductOption { id: string; name: string; }

const S = {
  input: { background: '#0a0f1e', border: '1px solid #1e293b', borderRadius: 10, padding: '10px 12px', color: '#e2e8f0', fontSize: 14 } as React.CSSProperties,
  select: { background: '#0a0f1e', border: '1px solid #1e293b', borderRadius: 10, padding: '10px 12px', color: '#e2e8f0', fontSize: 14, appearance: 'none' as const, backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center' },
  label: { display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 6, textTransform: 'uppercase' as const, letterSpacing: '0.5px' } as React.CSSProperties,
  row: { background: '#0a0f1e', borderRadius: 8, padding: '10px 12px', border: '1px solid #1e293b', display: 'flex', alignItems: 'center', gap: 12 } as React.CSSProperties,
  section: { background: '#111827', borderRadius: 12, border: '1px solid #1e293b', padding: 24, marginBottom: 24 } as React.CSSProperties,
  cyan: '#06b6d4',
};

function toLocal(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function AdminRabattePage() {
  // ─── Kundenrabatte ─────────────────────────────────────────────────────────
  const [durationDiscounts, setDurationDiscounts] = useState<DurationDiscount[]>([]);
  const [durationLoading, setDurationLoading] = useState(true);
  const [durationSaving, setDurationSaving] = useState(false);
  const [durationSuccess, setDurationSuccess] = useState('');

  const [loyaltyDiscounts, setLoyaltyDiscounts] = useState<LoyaltyDiscount[]>([]);
  const [loyaltyLoading, setLoyaltyLoading] = useState(true);
  const [loyaltySaving, setLoyaltySaving] = useState(false);
  const [loyaltySuccess, setLoyaltySuccess] = useState('');

  // ─── Produktrabatte ────────────────────────────────────────────────────────
  const [productDiscounts, setProductDiscounts] = useState<ProductDiscount[]>([]);
  const [productLoading, setProductLoading] = useState(true);
  const [productSaving, setProductSaving] = useState(false);
  const [productSuccess, setProductSuccess] = useState('');

  // ─── Empfehlungsbonus ──────────────────────────────────────────────────────
  const [rewardValue, setRewardValue] = useState(10);
  const [rewardLoading, setRewardLoading] = useState(true);
  const [rewardSaving, setRewardSaving] = useState(false);
  const [rewardSuccess, setRewardSuccess] = useState('');

  // ─── Produkt-Dropdown Daten ────────────────────────────────────────────────
  const [products, setProducts] = useState<ProductOption[]>([]);

  useEffect(() => {
    fetch('/api/admin/config?key=duration_discounts').then((r) => r.json())
      .then((d) => { if (d.value) setDurationDiscounts(d.value); setDurationLoading(false); })
      .catch(() => setDurationLoading(false));

    fetch('/api/admin/config?key=loyalty_discounts').then((r) => r.json())
      .then((d) => { if (d.value) setLoyaltyDiscounts(d.value); setLoyaltyLoading(false); })
      .catch(() => setLoyaltyLoading(false));

    fetch('/api/admin/config?key=product_discounts').then((r) => r.json())
      .then((d) => { if (d.value) setProductDiscounts(d.value); setProductLoading(false); })
      .catch(() => setProductLoading(false));

    fetch('/api/admin/config?key=referral_reward_value').then((r) => r.json())
      .then((d) => { if (d.value) setRewardValue(d.value); setRewardLoading(false); })
      .catch(() => setRewardLoading(false));

    // Produkte laden für Dropdown
    fetch('/api/admin/config?key=products').then((r) => r.json())
      .then((d) => {
        if (d.value) {
          const prods = Object.values(d.value) as { id: string; name: string }[];
          setProducts(prods.map((p) => ({ id: p.id, name: p.name })));
        }
      })
      .catch(() => {});
  }, []);

  async function saveConfig(key: string, value: unknown, setSaving: (v: boolean) => void, setSuccess: (v: string) => void) {
    setSaving(true); setSuccess('');
    try {
      await fetch('/api/admin/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, value }) });
      setSuccess('Gespeichert!'); setTimeout(() => setSuccess(''), 3000);
    } catch { /* ignore */ }
    finally { setSaving(false); }
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: '20px 16px', maxWidth: 750, margin: '0 auto' }}>
      <AdminBackLink label="Zurück" />
      <h1 style={{ fontSize: 20, fontWeight: 700, color: '#e2e8f0', marginBottom: 2 }}>Rabatte</h1>
      <p style={{ fontSize: 13, color: '#64748b', marginBottom: 28 }}>
        Automatische Kunden- und Produktrabatte konfigurieren
      </p>

      {/* ━━━ BEREICH 1: KUNDENRABATTE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div style={{ marginBottom: 36 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: '#06b6d414', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="16" height="16" fill="none" stroke="#06b6d4" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0', margin: 0 }}>Kundenrabatte</h2>
            <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>Automatisch basierend auf Mietdauer, Treue und Empfehlungen</p>
          </div>
        </div>

        {/* Mengenrabatte */}
        <div style={S.section}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <svg width="18" height="18" fill="none" stroke="#f59e0b" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0', margin: 0 }}>Mengenrabatte</h3>
            <span style={{ fontSize: 11, color: '#64748b' }}>Bei längerer Mietdauer</span>
          </div>
          {durationLoading ? <div style={{ color: '#64748b', fontSize: 14 }}>Laden...</div> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {durationDiscounts.map((d, i) => (
                <div key={i} style={S.row}>
                  <span style={{ fontSize: 12, color: '#64748b', flexShrink: 0 }}>ab</span>
                  <input type="number" min="1" value={d.min_days}
                    onChange={(e) => { const a = [...durationDiscounts]; a[i] = { ...a[i], min_days: parseInt(e.target.value) || 0 }; setDurationDiscounts(a); }}
                    style={{ ...S.input, width: 60, textAlign: 'center' }} />
                  <span style={{ fontSize: 12, color: '#64748b', flexShrink: 0 }}>Tagen</span>
                  <input type="number" min="0" max="100" value={d.discount_percent}
                    onChange={(e) => { const a = [...durationDiscounts]; a[i] = { ...a[i], discount_percent: parseInt(e.target.value) || 0 }; setDurationDiscounts(a); }}
                    style={{ ...S.input, width: 60, textAlign: 'center' }} />
                  <span style={{ fontSize: 12, color: '#64748b', flexShrink: 0 }}>%</span>
                  <input type="text" value={d.label}
                    onChange={(e) => { const a = [...durationDiscounts]; a[i] = { ...a[i], label: e.target.value }; setDurationDiscounts(a); }}
                    style={{ ...S.input, flex: 1 }} />
                  <button onClick={() => setDurationDiscounts((p) => p.filter((_, j) => j !== i))}
                    style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontSize: 16 }}>✕</button>
                </div>
              ))}
              <button onClick={() => setDurationDiscounts((p) => [...p, { min_days: p.length ? Math.max(...p.map((d) => d.min_days)) + 5 : 5, discount_percent: 5, label: 'Neuer Mengenrabatt' }])}
                style={{ fontSize: 12, fontWeight: 600, color: '#f59e0b', background: 'none', border: '1px dashed #f59e0b44', borderRadius: 8, padding: '8px 12px', cursor: 'pointer', alignSelf: 'flex-start' }}>
                + Stufe hinzufügen
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
                <button onClick={() => saveConfig('duration_discounts', durationDiscounts, setDurationSaving, setDurationSuccess)} disabled={durationSaving}
                  style={{ background: S.cyan, color: 'white', fontSize: 13, fontWeight: 600, padding: '10px 20px', borderRadius: 10, border: 'none', cursor: 'pointer', opacity: durationSaving ? 0.5 : 1 }}>
                  {durationSaving ? 'Speichern...' : 'Speichern'}
                </button>
                {durationSuccess && <span style={{ fontSize: 13, color: '#10b981' }}>{durationSuccess}</span>}
              </div>
            </div>
          )}
        </div>

        {/* Treuerabatte */}
        <div style={S.section}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <svg width="18" height="18" fill="none" stroke="#8b5cf6" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0', margin: 0 }}>Treuerabatte</h3>
            <span style={{ fontSize: 11, color: '#64748b' }}>Nach Anzahl Buchungen</span>
          </div>
          {loyaltyLoading ? <div style={{ color: '#64748b', fontSize: 14 }}>Laden...</div> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {loyaltyDiscounts.map((d, i) => (
                <div key={i} style={S.row}>
                  <span style={{ fontSize: 12, color: '#64748b', flexShrink: 0 }}>ab</span>
                  <input type="number" min="1" value={d.min_bookings}
                    onChange={(e) => { const a = [...loyaltyDiscounts]; a[i] = { ...a[i], min_bookings: parseInt(e.target.value) || 0 }; setLoyaltyDiscounts(a); }}
                    style={{ ...S.input, width: 60, textAlign: 'center' }} />
                  <span style={{ fontSize: 12, color: '#64748b', flexShrink: 0 }}>Buchungen</span>
                  <input type="number" min="0" max="100" value={d.discount_percent}
                    onChange={(e) => { const a = [...loyaltyDiscounts]; a[i] = { ...a[i], discount_percent: parseInt(e.target.value) || 0 }; setLoyaltyDiscounts(a); }}
                    style={{ ...S.input, width: 60, textAlign: 'center' }} />
                  <span style={{ fontSize: 12, color: '#64748b', flexShrink: 0 }}>%</span>
                  <input type="text" value={d.label}
                    onChange={(e) => { const a = [...loyaltyDiscounts]; a[i] = { ...a[i], label: e.target.value }; setLoyaltyDiscounts(a); }}
                    style={{ ...S.input, flex: 1 }} />
                  <button onClick={() => setLoyaltyDiscounts((p) => p.filter((_, j) => j !== i))}
                    style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontSize: 16 }}>✕</button>
                </div>
              ))}
              <button onClick={() => setLoyaltyDiscounts((p) => [...p, { min_bookings: p.length ? Math.max(...p.map((d) => d.min_bookings)) + 5 : 3, discount_percent: 5, label: 'Neuer Treuerabatt' }])}
                style={{ fontSize: 12, fontWeight: 600, color: '#8b5cf6', background: 'none', border: '1px dashed #8b5cf644', borderRadius: 8, padding: '8px 12px', cursor: 'pointer', alignSelf: 'flex-start' }}>
                + Stufe hinzufügen
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
                <button onClick={() => saveConfig('loyalty_discounts', loyaltyDiscounts, setLoyaltySaving, setLoyaltySuccess)} disabled={loyaltySaving}
                  style={{ background: S.cyan, color: 'white', fontSize: 13, fontWeight: 600, padding: '10px 20px', borderRadius: 10, border: 'none', cursor: 'pointer', opacity: loyaltySaving ? 0.5 : 1 }}>
                  {loyaltySaving ? 'Speichern...' : 'Speichern'}
                </button>
                {loyaltySuccess && <span style={{ fontSize: 13, color: '#10b981' }}>{loyaltySuccess}</span>}
              </div>
            </div>
          )}
        </div>

        {/* Empfehlungsbonus */}
        <div style={S.section}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <svg width="18" height="18" fill="none" stroke="#10b981" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0', margin: 0 }}>Empfehlungsbonus</h3>
            <span style={{ fontSize: 11, color: '#64748b' }}>Gutscheinwert pro erfolgreicher Empfehlung</span>
          </div>
          {rewardLoading ? <div style={{ color: '#64748b', fontSize: 14 }}>Laden...</div> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={S.row}>
                <span style={{ fontSize: 13, color: '#94a3b8' }}>Gutscheinwert</span>
                <input type="number" min="0" step="1" value={rewardValue}
                  onChange={(e) => setRewardValue(parseInt(e.target.value) || 0)}
                  style={{ ...S.input, width: 80, textAlign: 'center' }} />
                <span style={{ fontSize: 12, color: '#64748b' }}>EUR</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
                <button onClick={() => saveConfig('referral_reward_value', rewardValue, setRewardSaving, setRewardSuccess)} disabled={rewardSaving}
                  style={{ background: S.cyan, color: 'white', fontSize: 13, fontWeight: 600, padding: '10px 20px', borderRadius: 10, border: 'none', cursor: 'pointer', opacity: rewardSaving ? 0.5 : 1 }}>
                  {rewardSaving ? 'Speichern...' : 'Speichern'}
                </button>
                {rewardSuccess && <span style={{ fontSize: 13, color: '#10b981' }}>{rewardSuccess}</span>}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ━━━ BEREICH 2: PRODUKTRABATTE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: '#f59e0b14', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="16" height="16" fill="none" stroke="#f59e0b" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
            </svg>
          </div>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0', margin: 0 }}>Produktrabatte</h2>
            <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>Aktionen auf Mietpreise (z.B. Black Friday, Sommer-Sale)</p>
          </div>
        </div>

        <div style={S.section}>
          {productLoading ? <div style={{ color: '#64748b', fontSize: 14 }}>Laden...</div> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {productDiscounts.map((d, i) => (
                <div key={d.id} style={{ background: '#0a0f1e', borderRadius: 10, border: '1px solid #1e293b', padding: 16 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                    {/* Name */}
                    <div>
                      <label style={S.label}>Aktionsname</label>
                      <input type="text" value={d.name}
                        onChange={(e) => { const a = [...productDiscounts]; a[i] = { ...a[i], name: e.target.value }; setProductDiscounts(a); }}
                        placeholder="z.B. Black Friday"
                        style={{ ...S.input, width: '100%' }} />
                    </div>
                    {/* Discount */}
                    <div>
                      <label style={S.label}>Rabatt auf Mietpreis</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input type="number" min="0" max="100" value={d.discount_percent}
                          onChange={(e) => { const a = [...productDiscounts]; a[i] = { ...a[i], discount_percent: parseInt(e.target.value) || 0 }; setProductDiscounts(a); }}
                          style={{ ...S.input, width: 80, textAlign: 'center' }} />
                        <span style={{ fontSize: 12, color: '#64748b' }}>%</span>
                      </div>
                    </div>
                    {/* Product */}
                    <div>
                      <label style={S.label}>Gilt für</label>
                      <select value={d.product_id}
                        onChange={(e) => { const a = [...productDiscounts]; a[i] = { ...a[i], product_id: e.target.value }; setProductDiscounts(a); }}
                        style={{ ...S.select, width: '100%' }}>
                        <option value="all">Alle Kameras</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    </div>
                    {/* Active */}
                    <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 4 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                        <input type="checkbox" checked={d.active}
                          onChange={(e) => { const a = [...productDiscounts]; a[i] = { ...a[i], active: e.target.checked }; setProductDiscounts(a); }}
                          style={{ width: 16, height: 16, accentColor: S.cyan }} />
                        <span style={{ fontSize: 13, fontWeight: 600, color: d.active ? '#10b981' : '#64748b' }}>
                          {d.active ? 'Aktiv' : 'Inaktiv'}
                        </span>
                      </label>
                    </div>
                    {/* Valid from */}
                    <div>
                      <label style={S.label}>Gültig ab</label>
                      <input type="datetime-local" value={toLocal(d.valid_from)}
                        onChange={(e) => { const a = [...productDiscounts]; a[i] = { ...a[i], valid_from: e.target.value ? new Date(e.target.value).toISOString() : null }; setProductDiscounts(a); }}
                        style={{ ...S.input, width: '100%' }} />
                    </div>
                    {/* Valid until */}
                    <div>
                      <label style={S.label}>Gültig bis</label>
                      <input type="datetime-local" value={toLocal(d.valid_until)}
                        onChange={(e) => { const a = [...productDiscounts]; a[i] = { ...a[i], valid_until: e.target.value ? new Date(e.target.value).toISOString() : null }; setProductDiscounts(a); }}
                        style={{ ...S.input, width: '100%' }} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button onClick={() => setProductDiscounts((p) => p.filter((_, j) => j !== i))}
                      style={{ fontSize: 12, fontWeight: 600, color: '#ef4444', background: 'transparent', border: '1px solid #ef444433', borderRadius: 8, padding: '6px 14px', cursor: 'pointer' }}>
                      Entfernen
                    </button>
                  </div>
                </div>
              ))}

              <button onClick={() => setProductDiscounts((p) => [...p, {
                id: `pd-${Date.now().toString(36)}`,
                name: '',
                discount_percent: 10,
                product_id: 'all',
                valid_from: null,
                valid_until: null,
                active: true,
              }])}
                style={{ fontSize: 12, fontWeight: 600, color: '#f59e0b', background: 'none', border: '1px dashed #f59e0b44', borderRadius: 8, padding: '10px 14px', cursor: 'pointer', alignSelf: 'flex-start' }}>
                + Neue Aktion anlegen
              </button>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
                <button onClick={() => saveConfig('product_discounts', productDiscounts, setProductSaving, setProductSuccess)} disabled={productSaving}
                  style={{ background: S.cyan, color: 'white', fontSize: 13, fontWeight: 600, padding: '10px 20px', borderRadius: 10, border: 'none', cursor: 'pointer', opacity: productSaving ? 0.5 : 1 }}>
                  {productSaving ? 'Speichern...' : 'Speichern'}
                </button>
                {productSuccess && <span style={{ fontSize: 13, color: '#10b981' }}>{productSuccess}</span>}
              </div>

              {productDiscounts.length === 0 && (
                <div style={{ padding: '12px 16px', borderRadius: 8, background: '#f59e0b08', border: '1px solid #f59e0b20', color: '#94a3b8', fontSize: 12 }}>
                  <strong style={{ color: '#fbbf24' }}>Tipp:</strong> Erstelle z.B. eine Black-Friday-Aktion mit 25% auf alle Kameras
                  und setze ein Start-/Enddatum. Der Rabatt wird automatisch auf den Mietpreis im Checkout angezeigt.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
