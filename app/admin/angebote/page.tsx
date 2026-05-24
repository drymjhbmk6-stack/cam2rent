'use client';

import { useState, useEffect, useCallback } from 'react';
import AdminBackLink from '@/components/admin/AdminBackLink';
import PriceInput from '@/components/admin/PriceInput';
import { isAngebotActive, type Angebot, type AngebotCameraOption } from '@/data/angebote';

interface ProductOption { id: string; name: string }
interface AccessoryOption { id: string; name: string; group?: string; compatible_product_ids: string[]; internal: boolean }

interface Draft {
  id: string; // '' = neues Angebot
  name: string;
  description: string;
  validFrom: string;     // YYYY-MM-DD
  validUntil: string;    // YYYY-MM-DD
  publishedFrom: string; // YYYY-MM-DD (optional, leer = ab validFrom sichtbar)
  pricing_mode: 'flat' | 'perDay';
  fixed_days: number;
  camera_options: AngebotCameraOption[];
  image_url: string | null;
  badge: string;
  badge_color: string;
  active: boolean;
}

const S = {
  input: { background: '#0a0f1e', border: '1px solid #1e293b', borderRadius: 10, padding: '10px 12px', color: '#e2e8f0', fontSize: 14, width: '100%' } as React.CSSProperties,
  label: { display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 6, textTransform: 'uppercase' as const, letterSpacing: '0.5px' } as React.CSSProperties,
  section: { background: '#111827', borderRadius: 12, border: '1px solid #1e293b', padding: 24, marginBottom: 20 } as React.CSSProperties,
  btnPrimary: { background: '#06b6d4', color: 'white', border: 'none', borderRadius: 10, padding: '10px 18px', fontSize: 14, fontWeight: 700, cursor: 'pointer' } as React.CSSProperties,
  btnGhost: { background: 'transparent', color: '#94a3b8', border: '1px solid #334155', borderRadius: 10, padding: '10px 18px', fontSize: 14, fontWeight: 600, cursor: 'pointer' } as React.CSSProperties,
};

function isoToDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
/** YYYY-MM-DD → ISO. asEnd=true → 23:59:59 (Mietfenster inklusive End-Tag). */
function dateToIso(date: string, asEnd: boolean): string | null {
  if (!date) return null;
  const d = new Date(date + (asEnd ? 'T23:59:59' : 'T00:00:00'));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function emptyDraft(): Draft {
  return {
    id: '', name: '', description: '', validFrom: '', validUntil: '', publishedFrom: '',
    pricing_mode: 'flat', fixed_days: 7, camera_options: [],
    image_url: null, badge: '', badge_color: '', active: true,
  };
}

function toDraft(a: Angebot): Draft {
  return {
    id: a.id, name: a.name, description: a.description,
    validFrom: isoToDate(a.valid_from), validUntil: isoToDate(a.valid_until),
    publishedFrom: isoToDate(a.published_from),
    pricing_mode: a.pricing_mode, fixed_days: a.fixed_days ?? 7,
    camera_options: a.camera_options.map((c) => ({
      product_id: c.product_id,
      price: c.price,
      accessory_items: c.accessory_items.map((i) => ({ ...i })),
    })),
    image_url: a.image_url, badge: a.badge ?? '', badge_color: a.badge_color ?? '', active: a.active,
  };
}

function fmtDateDe(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
}

function statusBadge(a: Angebot): { label: string; color: string; bg: string } {
  if (!a.active) return { label: 'Deaktiviert', color: '#94a3b8', bg: '#33415544' };
  const now = new Date();
  const visibleFromIso = a.published_from ?? a.valid_from;
  if (visibleFromIso && new Date(visibleFromIso) > now) {
    return { label: `Geplant ab ${fmtDateDe(visibleFromIso)}`, color: '#fbbf24', bg: '#f59e0b22' };
  }
  if (a.valid_until && new Date(a.valid_until) < now) return { label: 'Abgelaufen', color: '#ef4444', bg: '#ef444422' };
  // Vorab-Veroeffentlichung greift: sichtbar/buchbar, Mietfenster startet aber spaeter.
  if (a.published_from && a.valid_from && new Date(a.valid_from) > now) {
    return { label: `Vorabverkauf (Miete ab ${fmtDateDe(a.valid_from)})`, color: '#06b6d4', bg: '#06b6d422' };
  }
  return isAngebotActive(a, now)
    ? { label: 'Aktiv', color: '#10b981', bg: '#10b98122' }
    : { label: 'Inaktiv', color: '#94a3b8', bg: '#33415544' };
}

export default function AdminAngebotePage() {
  const [angebote, setAngebote] = useState<Angebot[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [accessories, setAccessories] = useState<AccessoryOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [migrationPending, setMigrationPending] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const reload = useCallback(() => {
    fetch('/api/admin/angebote')
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d?.angebote)) setAngebote(d.angebote);
        if (d?.migration_pending) setMigrationPending(true);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    reload();
    fetch('/api/products').then((r) => r.json())
      .then((d) => { if (Array.isArray(d)) setProducts(d.map((p: { id: string; name: string }) => ({ id: p.id, name: p.name }))); })
      .catch(() => {});
    // Admin-API liefert raw DB-Zeilen inkl. compatible_product_ids, damit wir
    // die Liste pro Kamera filtern koennen (User sieht nur die Zubehoere, die
    // zur jeweiligen Kamera passen).
    fetch('/api/admin/accessories').then((r) => r.json())
      .then((d) => {
        const rows = Array.isArray(d?.accessories) ? d.accessories : Array.isArray(d) ? d : [];
        setAccessories(rows.map((a: { id: string; name: string; category?: string; compatible_product_ids?: string[]; internal?: boolean }) => ({
          id: a.id,
          name: a.name,
          group: (a.category ?? '').toLowerCase() || undefined,
          compatible_product_ids: Array.isArray(a.compatible_product_ids) ? a.compatible_product_ids : [],
          internal: a.internal === true,
        })));
      })
      .catch(() => {});
  }, [reload]);

  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? id;
  const accessoryName = (id: string) => accessories.find((a) => a.id === id)?.name ?? id;

  function patchDraft(p: Partial<Draft>) {
    setDraft((d) => (d ? { ...d, ...p } : d));
  }

  function toggleCamera(productId: string) {
    setDraft((d) => {
      if (!d) return d;
      const has = d.camera_options.some((c) => c.product_id === productId);
      return {
        ...d,
        camera_options: has
          ? d.camera_options.filter((c) => c.product_id !== productId)
          : [...d.camera_options, { product_id: productId, price: 0, accessory_items: [] }],
      };
    });
  }
  function setCameraPrice(productId: string, price: number) {
    setDraft((d) => d ? { ...d, camera_options: d.camera_options.map((c) => c.product_id === productId ? { ...c, price } : c) } : d);
  }
  function addCameraAccessory(productId: string, accId: string) {
    if (!accId) return;
    setDraft((d) => {
      if (!d) return d;
      return {
        ...d,
        camera_options: d.camera_options.map((c) => {
          if (c.product_id !== productId) return c;
          if (c.accessory_items.some((i) => i.accessory_id === accId)) return c;
          return { ...c, accessory_items: [...c.accessory_items, { accessory_id: accId, qty: 1 }] };
        }),
      };
    });
  }
  function setCameraAccessoryQty(productId: string, accId: string, qty: number) {
    setDraft((d) => {
      if (!d) return d;
      return {
        ...d,
        camera_options: d.camera_options.map((c) => {
          if (c.product_id !== productId) return c;
          const items = qty <= 0
            ? c.accessory_items.filter((i) => i.accessory_id !== accId)
            : c.accessory_items.map((i) => i.accessory_id === accId ? { ...i, qty } : i);
          return { ...c, accessory_items: items };
        }),
      };
    });
  }

  async function save() {
    if (!draft) return;
    setError('');
    if (!draft.name.trim()) { setError('Name erforderlich.'); return; }
    if (draft.camera_options.length === 0) { setError('Mindestens eine Kamera auswählen.'); return; }
    if (draft.camera_options.some((c) => c.price <= 0)) { setError('Jede gewählte Kamera braucht einen Preis > 0.'); return; }
    if (draft.pricing_mode === 'flat' && draft.fixed_days < 1) { setError('Feste Mietdauer (Tage) erforderlich.'); return; }
    setSaving(true);
    const payload = {
      id: draft.id || undefined,
      name: draft.name.trim(),
      description: draft.description.trim(),
      valid_from: dateToIso(draft.validFrom, false),
      valid_until: dateToIso(draft.validUntil, true),
      published_from: dateToIso(draft.publishedFrom, false),
      pricing_mode: draft.pricing_mode,
      fixed_days: draft.pricing_mode === 'flat' ? draft.fixed_days : null,
      camera_options: draft.camera_options,
      badge: draft.badge.trim(),
      badge_color: draft.badge_color.trim(),
      active: draft.active,
    };
    try {
      const res = await fetch('/api/admin/angebote', {
        method: draft.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Speichern fehlgeschlagen.'); setSaving(false); return; }
      setSuccess(draft.id ? 'Angebot gespeichert.' : 'Angebot angelegt.');
      setTimeout(() => setSuccess(''), 3000);
      // Bei Neuanlage in den Edit-Modus wechseln, damit das Bild hochladbar ist.
      if (!draft.id && data.angebot) {
        setDraft(toDraft(data.angebot));
      }
      reload();
    } catch {
      setError('Netzwerkfehler.');
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm('Dieses Angebot wirklich löschen?')) return;
    await fetch('/api/admin/angebote', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (draft?.id === id) setDraft(null);
    reload();
  }

  async function uploadImage(file: File) {
    if (!draft?.id) return;
    setError('');
    const fd = new FormData();
    fd.append('angebotId', draft.id);
    fd.append('angebotName', draft.name);
    fd.append('file', file);
    const res = await fetch('/api/admin/angebote-images', { method: 'POST', body: fd });
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? 'Upload fehlgeschlagen.'); return; }
    patchDraft({ image_url: data.url });
    reload();
  }

  // Pro Kamera nur kompatibles Zubehoer im Dropdown anzeigen — sonst weiss
  // der Admin nicht, was zur jeweiligen Kamera gehoert.
  // Leeres compatible_product_ids = passt zu ALLEN Kameras.
  function accessoryGroupsFor(productId: string): [string, AccessoryOption[]][] {
    const filtered = accessories.filter(
      (a) => a.compatible_product_ids.length === 0 || a.compatible_product_ids.includes(productId),
    );
    const map = new Map<string, AccessoryOption[]>();
    for (const a of filtered) {
      const g = a.group || 'Sonstiges';
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(a);
    }
    return [...map.entries()];
  }

  return (
    <div style={{ maxWidth: 980, margin: '0 auto', padding: '24px 16px' }}>
      <style>{`.ang-price{background:#0a0f1e;border:1px solid #1e293b;border-radius:8px;padding:6px 8px;color:#e2e8f0;font-size:13px;width:84px}`}</style>
      <AdminBackLink />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: '#f1f5f9' }}>Angebote</h1>
          <p style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
            Zeitlich begrenzte Festpreis-Bündel aus Kamera + Zubehör.
          </p>
        </div>
        {!draft && (
          <button type="button" style={S.btnPrimary} onClick={() => { setDraft(emptyDraft()); setError(''); }}>
            + Neues Angebot
          </button>
        )}
      </div>

      {migrationPending && (
        <div style={{ ...S.section, borderColor: '#f59e0b', background: '#f59e0b15' }}>
          <p style={{ color: '#fbbf24', fontSize: 13 }}>
            ⚠ Migration ausstehend — bitte <code>supabase/supabase-angebote.sql</code> ausführen.
            Bis dahin lassen sich keine Angebote anlegen.
          </p>
        </div>
      )}
      {success && (
        <div style={{ ...S.section, borderColor: '#10b981', background: '#10b98115', padding: '12px 16px' }}>
          <p style={{ color: '#34d399', fontSize: 13 }}>{success}</p>
        </div>
      )}

      {/* ── Editor ── */}
      {draft && (
        <div style={S.section}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: '#f1f5f9', marginBottom: 16 }}>
            {draft.id ? 'Angebot bearbeiten' : 'Neues Angebot'}
          </h2>

          <div style={{ display: 'grid', gap: 14 }}>
            <div>
              <label style={S.label}>Name</label>
              <input style={S.input} value={draft.name} onChange={(e) => patchDraft({ name: e.target.value })}
                placeholder="z.B. GoPro Tauch-Aktion" />
            </div>
            <div>
              <label style={S.label}>Beschreibung</label>
              <textarea style={{ ...S.input, minHeight: 60, resize: 'vertical' }} value={draft.description}
                onChange={(e) => patchDraft({ description: e.target.value })}
                placeholder="Kurzbeschreibung für die Angebote-Seite" />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <label style={S.label}>Gültig ab (Mietfenster-Start)</label>
                <input type="date" style={S.input} value={draft.validFrom}
                  onChange={(e) => patchDraft({ validFrom: e.target.value })} />
              </div>
              <div>
                <label style={S.label}>Gültig bis (Mietfenster-Ende)</label>
                <input type="date" style={S.input} value={draft.validUntil}
                  onChange={(e) => patchDraft({ validUntil: e.target.value })} />
              </div>
            </div>
            <p style={{ fontSize: 11, color: '#64748b', marginTop: -8 }}>
              Der gewählte Mietzeitraum des Kunden muss komplett in dieses Fenster fallen.
            </p>

            <div>
              <label style={S.label}>Vorab sichtbar ab (optional)</label>
              <input
                type="date"
                style={{ ...S.input, maxWidth: 220 }}
                value={draft.publishedFrom}
                onChange={(e) => patchDraft({ publishedFrom: e.target.value })}
                max={draft.validFrom || undefined}
              />
              <p style={{ fontSize: 11, color: '#64748b', marginTop: 6 }}>
                Wenn gesetzt: Angebot erscheint im Shop und ist buchbar ab diesem Datum.
                Der Mietzeitraum bleibt aber auf das Mietfenster oben begrenzt.
                Leer = Sichtbarkeit beginnt mit dem Mietfenster.
              </p>
              {draft.publishedFrom && draft.validFrom && new Date(draft.publishedFrom) >= new Date(draft.validFrom) && (
                <p style={{ fontSize: 11, color: '#fbbf24', marginTop: 4 }}>
                  Hinweis: „Vorab sichtbar ab&ldquo; liegt nicht vor „Gültig ab&ldquo; — die Vorab-Veröffentlichung greift nicht.
                </p>
              )}
            </div>

            {/* Preismodell */}
            <div>
              <label style={S.label}>Preismodell</label>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {([
                  { v: 'flat', t: 'Pauschale für feste Tagezahl' },
                  { v: 'perDay', t: 'Preis pro Tag' },
                ] as const).map((o) => (
                  <label key={o.v} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#cbd5e1', cursor: 'pointer' }}>
                    <input type="radio" name="pm" checked={draft.pricing_mode === o.v}
                      onChange={() => patchDraft({ pricing_mode: o.v })} />
                    {o.t}
                  </label>
                ))}
              </div>
            </div>
            {draft.pricing_mode === 'flat' && (
              <div style={{ maxWidth: 220 }}>
                <label style={S.label}>Feste Mietdauer (Tage)</label>
                <input type="number" min={1} style={S.input} value={draft.fixed_days || ''}
                  onChange={(e) => patchDraft({ fixed_days: Math.max(0, parseInt(e.target.value, 10) || 0) })} />
              </div>
            )}

            {/* Kameras + Preis + Zubehör pro Kamera */}
            <div>
              <label style={S.label}>Kameras, Komplettpreis & Zubehör</label>
              <p style={{ fontSize: 11, color: '#64748b', marginBottom: 8 }}>
                Preis je Kamera = {draft.pricing_mode === 'perDay' ? 'pro Tag' : `Pauschale für ${draft.fixed_days || '?'} Tage`}, inkl. dem unten je Kamera gewählten Zubehör.
              </p>
              <div style={{ display: 'grid', gap: 8 }}>
                {products.length === 0 && <p style={{ fontSize: 12, color: '#64748b' }}>Keine Kameras geladen.</p>}
                {products.map((p) => {
                  const opt = draft.camera_options.find((c) => c.product_id === p.id);
                  return (
                    <div key={p.id} style={{ background: '#0a0f1e', border: `1px solid ${opt ? '#06b6d433' : '#1e293b'}`, borderRadius: 10, padding: '10px 12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, color: '#cbd5e1', fontSize: 13, cursor: 'pointer' }}>
                          <input type="checkbox" checked={!!opt} onChange={() => toggleCamera(p.id)} />
                          {p.name}
                        </label>
                        {opt && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <PriceInput value={opt.price} onChange={(v) => setCameraPrice(p.id, v)}
                              placeholder="0,00" min={0} className="ang-price" />
                            <span style={{ color: '#64748b', fontSize: 13 }}>€</span>
                          </div>
                        )}
                      </div>
                      {opt && (
                        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #1e293b' }}>
                          <p style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>
                            Enthaltenes Zubehör für {p.name}
                          </p>
                          <select
                            style={{ ...S.input, marginBottom: 6, fontSize: 13, padding: '8px 10px' }}
                            value=""
                            onChange={(e) => { addCameraAccessory(p.id, e.target.value); e.target.value = ''; }}
                          >
                            <option value="">+ Zubehör hinzufügen…</option>
                            {accessoryGroupsFor(p.id).map(([g, list]) => (
                              <optgroup key={g} label={g}>
                                {list.map((a) => (
                                  <option key={a.id} value={a.id}>
                                    {a.name}{a.internal ? '  (intern)' : ''}
                                  </option>
                                ))}
                              </optgroup>
                            ))}
                          </select>
                          {opt.accessory_items.length === 0 ? (
                            <p style={{ fontSize: 11, color: '#64748b' }}>Kein Zubehör — reines Kamera-Angebot.</p>
                          ) : (
                            <div style={{ display: 'grid', gap: 4 }}>
                              {opt.accessory_items.map((it) => {
                                const acc = accessories.find((x) => x.id === it.accessory_id);
                                return (
                                <div key={it.accessory_id} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#111827', border: '1px solid #1e293b', borderRadius: 6, padding: '6px 10px' }}>
                                  <span style={{ flex: 1, color: '#cbd5e1', fontSize: 13 }}>
                                    {accessoryName(it.accessory_id)}
                                    {acc?.internal && <span style={{ marginLeft: 6, fontSize: 10, color: '#fbbf24' }}>(intern)</span>}
                                  </span>
                                  <input type="number" min={1} value={it.qty}
                                    onChange={(e) => setCameraAccessoryQty(p.id, it.accessory_id, parseInt(e.target.value, 10) || 1)}
                                    style={{ ...S.input, width: 56, padding: '4px 6px', fontSize: 13 }} />
                                  <button type="button" onClick={() => setCameraAccessoryQty(p.id, it.accessory_id, 0)}
                                    style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 12 }}>
                                    Entfernen
                                  </button>
                                </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Badge + Bild + Aktiv */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <label style={S.label}>Badge (optional)</label>
                <input style={S.input} value={draft.badge} onChange={(e) => patchDraft({ badge: e.target.value })}
                  placeholder="z.B. Sommer-Aktion" />
              </div>
              <div>
                <label style={S.label}>Badge-Farbe (CSS-Klasse)</label>
                <input style={S.input} value={draft.badge_color} onChange={(e) => patchDraft({ badge_color: e.target.value })}
                  placeholder="bg-accent-teal text-white" />
              </div>
            </div>

            <div>
              <label style={S.label}>Bild</label>
              {draft.id ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {draft.image_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={draft.image_url} alt="" style={{ width: 96, height: 72, objectFit: 'contain', background: '#0a0f1e', borderRadius: 8, border: '1px solid #1e293b' }} />
                  )}
                  <input type="file" accept="image/jpeg,image/png,image/webp"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadImage(f); }}
                    style={{ color: '#94a3b8', fontSize: 12 }} />
                </div>
              ) : (
                <p style={{ fontSize: 12, color: '#64748b' }}>Bild-Upload nach dem Speichern möglich.</p>
              )}
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#cbd5e1', cursor: 'pointer' }}>
              <input type="checkbox" checked={draft.active} onChange={(e) => patchDraft({ active: e.target.checked })} />
              Angebot aktiv (im Shop sichtbar, wenn im Gültigkeitsfenster)
            </label>

            {error && <p style={{ color: '#f87171', fontSize: 13 }}>{error}</p>}

            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" style={S.btnPrimary} disabled={saving} onClick={save}>
                {saving ? 'Speichert…' : 'Speichern'}
              </button>
              <button type="button" style={S.btnGhost} onClick={() => { setDraft(null); setError(''); }}>
                Abbrechen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Liste ── */}
      {loading ? (
        <p style={{ color: '#64748b', fontSize: 14 }}>Lädt…</p>
      ) : angebote.length === 0 && !draft ? (
        <div style={S.section}>
          <p style={{ color: '#64748b', fontSize: 14 }}>Noch keine Angebote angelegt.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {angebote.map((a) => {
            const st = statusBadge(a);
            const prices = a.camera_options.map((c) => c.price);
            const min = prices.length ? Math.min(...prices) : 0;
            const max = prices.length ? Math.max(...prices) : 0;
            const accCount = a.camera_options.reduce((s, c) => s + c.accessory_items.length, 0);
            return (
              <div key={a.id} style={{ ...S.section, marginBottom: 0, padding: 16, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                {a.image_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.image_url} alt="" style={{ width: 64, height: 48, objectFit: 'contain', background: '#0a0f1e', borderRadius: 8, border: '1px solid #1e293b' }} />
                )}
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, color: '#f1f5f9', fontSize: 15 }}>{a.name}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: st.color, background: st.bg, borderRadius: 999, padding: '2px 8px' }}>{st.label}</span>
                  </div>
                  <p style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                    {a.camera_options.length} Kamera{a.camera_options.length === 1 ? '' : 's'} · {accCount} Zubehör-Position{accCount === 1 ? '' : 'en'} ·{' '}
                    {min === max ? `${min.toFixed(2)} €` : `${min.toFixed(2)}–${max.toFixed(2)} €`}
                    {a.pricing_mode === 'perDay' ? ' /Tag' : ` (${a.fixed_days ?? '?'} Tage)`}
                  </p>
                  <p style={{ fontSize: 11, color: '#475569', marginTop: 2 }}>
                    {a.camera_options.map((c) => productName(c.product_id)).join(', ')}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" style={S.btnGhost} onClick={() => { setDraft(toDraft(a)); setError(''); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
                    Bearbeiten
                  </button>
                  <button type="button" style={{ ...S.btnGhost, color: '#f87171', borderColor: '#7f1d1d' }} onClick={() => remove(a.id)}>
                    Löschen
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
