'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

interface BookingOption {
  id: string;
  product_name: string | null;
  customer_name: string | null;
  customer_email: string | null;
  status: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess?: (msg: string) => void;
  /** Wenn gesetzt: Buchung ist fixiert, kein Auswahl-Picker. */
  bookingId?: string;
  /** Optionaler Anzeige-Text für die fixierte Buchung. */
  bookingLabel?: string;
}

const MAX_PHOTOS = 20;

const SCHADENSART_OPTIONS = [
  'Kratzer / Gebrauchsspuren',
  'Bruch / Riss',
  'Sturzschaden',
  'Wasser- / Feuchtigkeitsschaden',
  'Linse beschädigt',
  'Display beschädigt',
  'Funktionsstörung / Defekt',
  'Fehlendes / verlorenes Teil',
  'Starke Verschmutzung',
  'Sonstiges',
];

const SCHWEREGRAD = [
  { value: 'keine', label: 'Keine', color: '#64748b' },
  { value: 'leicht', label: 'Leicht', color: '#10b981' },
  { value: 'mittel', label: 'Mittel', color: '#f59e0b' },
  { value: 'schwer', label: 'Schwer', color: '#ef4444' },
];

const FUNKTION = [
  { value: 'ja', label: 'Ja' },
  { value: 'eingeschraenkt', label: 'Eingeschränkt' },
  { value: 'nein', label: 'Nein' },
];

const FUNKTION_LABEL: Record<string, string> = {
  ja: 'voll funktionsfähig',
  eingeschraenkt: 'eingeschränkt funktionsfähig',
  nein: 'nicht funktionsfähig',
};

function todayIso(): string {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

function isoToDe(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

/**
 * Admin erstellt im Namen des Kunden eine ausführliche Schadensmeldung.
 * Strukturierte Felder (betroffene Gegenstände, Schadensart, Schweregrad,
 * Funktionsfähigkeit, Datum, geschätzte Höhe) werden zu einer sauber
 * formatierten Schadensbeschreibung zusammengesetzt; die geschätzte Höhe
 * fließt zusätzlich in `damage_amount`. Ohne `bookingId` erscheint ein
 * Buchungs-Picker, sonst ist die Buchung fixiert.
 */
export default function DamageReportModal({ open, onClose, onSuccess, bookingId, bookingLabel }: Props) {
  const fixed = !!bookingId;

  const [bookings, setBookings] = useState<BookingOption[]>([]);
  const [loadingBookings, setLoadingBookings] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState('');

  // Strukturierte Felder
  const [items, setItems] = useState<string[]>([]); // verfügbare Gegenstände (Chips)
  const [affected, setAffected] = useState<string[]>([]); // ausgewählte Gegenstände
  const [customItem, setCustomItem] = useState('');
  const [schadensart, setSchadensart] = useState('');
  const [schweregrad, setSchweregrad] = useState('');
  const [funktion, setFunktion] = useState('');
  const [festgestellt, setFestgestellt] = useState(todayIso());
  const [description, setDescription] = useState('');
  const [befund, setBefund] = useState('');
  const [amount, setAmount] = useState('');
  const [adminNotes, setAdminNotes] = useState('');
  const [notifyCustomer, setNotifyCustomer] = useState(false);
  const [photos, setPhotos] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveBookingId = fixed ? bookingId! : selectedId;

  // Reset bei jedem Öffnen
  useEffect(() => {
    if (open) {
      setDescription('');
      setBefund('');
      setAdminNotes('');
      setPhotos([]);
      setError(null);
      setSearch('');
      setSelectedId('');
      setItems([]);
      setAffected([]);
      setCustomItem('');
      setSchadensart('');
      setSchweregrad('');
      setFunktion('');
      setFestgestellt(todayIso());
      setAmount('');
      setNotifyCustomer(false);
    }
  }, [open]);

  // Buchungsliste nur laden, wenn kein festes bookingId
  useEffect(() => {
    if (!open || fixed) return;
    let cancelled = false;
    (async () => {
      setLoadingBookings(true);
      try {
        const res = await fetch('/api/admin/alle-buchungen');
        const json = await res.json();
        if (!cancelled) setBookings(json.bookings || []);
      } catch {
        if (!cancelled) setBookings([]);
      } finally {
        if (!cancelled) setLoadingBookings(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, fixed]);

  // Gegenstände der ausgewählten/fixierten Buchung laden (für Chips)
  useEffect(() => {
    if (!open || !effectiveBookingId) { setItems([]); return; }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/admin/booking/${encodeURIComponent(effectiveBookingId)}`);
        const json = await res.json();
        const b = json.booking || {};
        const names: string[] = [];

        // 1) Kamera(s) — Seriennummer aus der Zuweisung, sonst die
        //    Modell-Seriennummern aus dem Inventar als auswählbare Chips
        //    anbieten (Buchung ohne feste unit_id → Admin wählt das Exemplar).
        const cams: { product_name?: string; serial_number?: string | null }[] =
          Array.isArray(b.cameras_resolved) && b.cameras_resolved.length > 0
            ? b.cameras_resolved
            : String(b.product_name || '')
                .split(',')
                .map((n: string) => n.trim())
                .filter(Boolean)
                .map((n: string, i: number) => ({
                  product_name: n,
                  serial_number: i === 0 ? (b.serial_number ?? null) : null,
                }));

        const modelLookedUp = new Set<string>();
        for (const c of cams) {
          const nm = (c.product_name || '').trim();
          if (!nm) continue;
          if (c.serial_number) {
            names.push(`${nm} · SN ${c.serial_number}`);
            continue;
          }
          // Keine feste Zuweisung → Modell-Seriennummern aus dem Inventar holen.
          if (modelLookedUp.has(nm.toLowerCase())) continue;
          modelLookedUp.add(nm.toLowerCase());
          let serials: string[] = [];
          try {
            const r = await fetch(
              `/api/admin/booking/${encodeURIComponent(effectiveBookingId)}/camera-exemplars?product_name=${encodeURIComponent(nm)}`,
            );
            if (r.ok) {
              const j = await r.json();
              serials = (Array.isArray(j.units) ? j.units : [])
                .map((u: { exemplar_code?: string }) => (u.exemplar_code || '').trim())
                .filter(Boolean)
                .slice(0, 20);
            }
          } catch { /* Inventar-Lookup optional */ }
          if (serials.length > 0) {
            serials.forEach((code) => names.push(`${nm} · SN ${code}`));
          } else {
            names.push(nm);
          }
        }

        // 2) Zubehör-Exemplar-Codes je accessory_id sammeln.
        const codesByAcc: Record<string, string[]> = {};
        (Array.isArray(b.unit_codes) ? b.unit_codes : []).forEach(
          (u: { accessory_id?: string; exemplar_code?: string }) => {
            if (!u.accessory_id || !u.exemplar_code) return;
            (codesByAcc[u.accessory_id] ||= []).push(u.exemplar_code);
          },
        );

        // 3) Zubehör-Positionen — nur echte Teile (Set-Container-Zeilen ohne
        //    accessory_id werden übersprungen). Exemplar-Nr. anhängen wenn da.
        (Array.isArray(b.resolved_items) ? b.resolved_items : []).forEach(
          (it: { name?: string; accessory_id?: string; qty?: number }) => {
            if (!it?.name || !it.accessory_id) return;
            const codes = codesByAcc[it.accessory_id] || [];
            const qty = it.qty && it.qty > 0 ? it.qty : 1;
            if (codes.length > 0) {
              codes.forEach((code) => names.push(`${it.name} · Nr. ${code}`));
              for (let i = 0; i < qty - codes.length; i++) names.push(it.name!);
            } else {
              names.push(qty > 1 ? `${it.name} (×${qty})` : it.name!);
            }
          },
        );

        const unique = [...new Set(names)];
        if (!cancelled) setItems(unique);
      } catch {
        if (!cancelled) setItems([]);
      }
    })();
    return () => { cancelled = true; };
  }, [open, effectiveBookingId]);

  const filteredBookings = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q
      ? bookings.filter((b) =>
          [b.id, b.product_name, b.customer_name, b.customer_email]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(q)),
        )
      : bookings;
    return list.slice(0, 30);
  }, [bookings, search]);

  const toggleAffected = useCallback((name: string) => {
    setAffected((prev) => (prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]));
  }, []);

  const addCustomItem = useCallback(() => {
    const v = customItem.trim();
    if (!v) return;
    setAffected((prev) => (prev.includes(v) ? prev : [...prev, v]));
    setItems((prev) => (prev.includes(v) ? prev : [...prev, v]));
    setCustomItem('');
  }, [customItem]);

  const addPhotos = useCallback((files: FileList | null) => {
    if (!files) return;
    setPhotos((prev) => {
      const next = [...prev];
      for (const f of Array.from(files)) {
        if (next.length >= MAX_PHOTOS) break;
        if (f.type.startsWith('image/')) next.push(f);
      }
      return next;
    });
  }, []);

  // Strukturierte Beschreibung zusammensetzen
  function buildDescription(): string {
    const lines: string[] = [];
    if (affected.length) lines.push(`Betroffen: ${affected.join(', ')}`);
    if (schadensart) lines.push(`Schadensart: ${schadensart}`);
    if (schweregrad) {
      const s = SCHWEREGRAD.find((x) => x.value === schweregrad);
      lines.push(`Schweregrad: ${s?.label ?? schweregrad}`);
    }
    if (funktion) lines.push(`Funktionsfähig: ${FUNKTION_LABEL[funktion] ?? funktion}`);
    if (festgestellt) lines.push(`Festgestellt am: ${isoToDe(festgestellt)}`);
    const header = lines.join('\n');
    const body = description.trim();
    const bef = befund.trim();
    const parts: string[] = [];
    if (header) parts.push(header);
    // Bei zusätzlichem Befund beide Blöcke klar beschriften.
    parts.push(bef ? `Angaben des Kunden:\n${body}` : body);
    if (bef) parts.push(`Befund & Instandsetzung:\n${bef}`);
    return parts.join('\n\n');
  }

  async function submit() {
    setError(null);
    if (!effectiveBookingId) { setError('Bitte eine Buchung auswählen.'); return; }
    if (!description.trim()) { setError('Bitte eine Beschreibung eingeben.'); return; }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('bookingId', effectiveBookingId);
      fd.append('description', buildDescription());
      if (adminNotes.trim()) fd.append('admin_notes', adminNotes.trim());
      if (amount.trim()) fd.append('damage_amount', amount.trim());
      if (notifyCustomer) fd.append('notify_customer', 'true');
      for (const p of photos) fd.append('photos', p);

      const res = await fetch('/api/admin/damage', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Schadensmeldung fehlgeschlagen.');

      let msg = 'Schadensmeldung erstellt.';
      if (notifyCustomer) {
        msg += json.emailSent
          ? ' Kunde per E-Mail informiert.'
          : ` E-Mail an Kunden nicht gesendet${json.emailError ? ` (${json.emailError})` : ''}.`;
      }
      onSuccess?.(msg);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Erstellen.');
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  const labelCls = 'block text-sm font-body font-semibold text-brand-black dark:text-slate-200 mb-1.5';
  const inputCls =
    'w-full px-3 py-2 rounded-lg border border-brand-border dark:border-slate-700 bg-white dark:bg-slate-900 text-base text-brand-black dark:text-slate-100 outline-none focus:border-accent-blue';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-brand-border dark:border-slate-700">
          <h3 className="font-heading font-bold text-lg text-brand-black dark:text-white">
            Schadensmeldung erstellen
          </h3>
          <p className="text-xs font-body text-brand-muted mt-1">
            Für den Kunden erfassen. Prüfung, Kaution und Abwicklung danach wie gewohnt unter
            &bdquo;Schadensmeldungen&ldquo;.
          </p>
        </div>

        <div className="p-6 space-y-5">
          {error && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-sm font-body text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          {/* Buchung */}
          <div>
            <label className={labelCls}>Buchung</label>
            {fixed ? (
              <div className="px-3 py-2 rounded-lg bg-brand-bg dark:bg-slate-900/40 border border-brand-border dark:border-slate-700 text-sm font-body text-brand-black dark:text-slate-200">
                <span className="font-mono">{bookingId}</span>
                {bookingLabel && <span className="text-brand-muted"> — {bookingLabel}</span>}
              </div>
            ) : (
              <>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buchung suchen (ID, Kunde, Kamera, E-Mail)…"
                  className={inputCls}
                />
                <div className="mt-2 max-h-52 overflow-y-auto rounded-lg border border-brand-border dark:border-slate-700 divide-y divide-brand-border dark:divide-slate-700">
                  {loadingBookings ? (
                    <p className="text-sm text-brand-muted p-3 text-center">Lädt…</p>
                  ) : filteredBookings.length === 0 ? (
                    <p className="text-sm text-brand-muted p-3 text-center">Keine Treffer.</p>
                  ) : (
                    filteredBookings.map((b) => {
                      const active = b.id === selectedId;
                      return (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => { setSelectedId(b.id); setAffected([]); }}
                          className={`w-full text-left px-3 py-2 transition-colors ${
                            active
                              ? 'bg-accent-blue/10 dark:bg-accent-blue/20'
                              : 'hover:bg-brand-bg dark:hover:bg-slate-900/50'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-xs text-brand-black dark:text-slate-200">{b.id}</span>
                            <span className="text-[11px] text-brand-muted">{b.status}</span>
                          </div>
                          <div className="text-sm text-brand-black dark:text-slate-200 truncate">
                            {b.customer_name || '–'} · {b.product_name || '–'}
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </>
            )}
          </div>

          {/* Betroffene Gegenstände */}
          {effectiveBookingId && (
            <div>
              <label className={labelCls}>
                Betroffene Gegenstände <span className="text-brand-muted font-normal">(auswählen)</span>
              </label>
              {items.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {items.map((name) => {
                    const on = affected.includes(name);
                    return (
                      <button
                        key={name}
                        type="button"
                        onClick={() => toggleAffected(name)}
                        className={`px-3 py-1.5 rounded-full text-sm font-body border transition-colors ${
                          on
                            ? 'bg-rose-500 border-rose-500 text-white'
                            : 'bg-white dark:bg-slate-900 border-brand-border dark:border-slate-700 text-brand-black dark:text-slate-200 hover:border-rose-400'
                        }`}
                      >
                        {on ? '✓ ' : ''}{name}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-brand-muted">Keine Positionen geladen — nutze das Feld unten oder die Beschreibung.</p>
              )}
              <div className="flex gap-2 mt-2">
                <input
                  type="text"
                  value={customItem}
                  onChange={(e) => setCustomItem(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomItem(); } }}
                  placeholder="Weiterer Gegenstand…"
                  className={inputCls}
                />
                <button
                  type="button"
                  onClick={addCustomItem}
                  className="px-4 py-2 rounded-lg text-sm font-heading font-semibold bg-brand-bg dark:bg-slate-700 text-brand-black dark:text-slate-200 shrink-0"
                >
                  + Hinzufügen
                </button>
              </div>
            </div>
          )}

          {/* Schadensart + Schweregrad */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Schadensart</label>
              <select
                value={schadensart}
                onChange={(e) => setSchadensart(e.target.value)}
                className={inputCls}
              >
                <option value="">— bitte wählen —</option>
                {SCHADENSART_OPTIONS.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Schweregrad</label>
              <div className="flex gap-2">
                {SCHWEREGRAD.map((s) => {
                  const on = schweregrad === s.value;
                  return (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => setSchweregrad(on ? '' : s.value)}
                      className="flex-1 px-3 py-2 rounded-lg text-sm font-heading font-semibold border transition-colors"
                      style={{
                        background: on ? s.color : 'transparent',
                        borderColor: on ? s.color : undefined,
                        color: on ? '#fff' : undefined,
                      }}
                    >
                      <span className={on ? '' : 'text-brand-black dark:text-slate-200'}>{s.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Funktionsfähigkeit + Datum */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Noch funktionsfähig?</label>
              <div className="flex gap-2">
                {FUNKTION.map((f) => {
                  const on = funktion === f.value;
                  return (
                    <button
                      key={f.value}
                      type="button"
                      onClick={() => setFunktion(on ? '' : f.value)}
                      className={`flex-1 px-2 py-2 rounded-lg text-sm font-heading font-semibold border transition-colors ${
                        on
                          ? 'bg-accent-blue border-accent-blue text-white'
                          : 'bg-white dark:bg-slate-900 border-brand-border dark:border-slate-700 text-brand-black dark:text-slate-200'
                      }`}
                    >
                      {f.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <label className={labelCls}>Schaden festgestellt am</label>
              <input
                type="date"
                value={festgestellt}
                onChange={(e) => setFestgestellt(e.target.value)}
                className={inputCls}
              />
            </div>
          </div>

          {/* Beschreibung (Angaben des Kunden) */}
          <div>
            <label className={labelCls}>
              Beschreibung <span className="text-red-500">*</span>
              <span className="text-brand-muted font-normal"> — Angaben des Kunden</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              maxLength={2000}
              placeholder="Was ist beschädigt? Wo und wie ist der Schaden entstanden? Wie äußert er sich?"
              className={`${inputCls} resize-none`}
            />
            <p className="text-[11px] text-brand-muted mt-1 text-right">{description.length}/2000</p>
          </div>

          {/* Befund & Instandsetzung (Bearbeiter, kundensichtbar) */}
          <div>
            <label className={labelCls}>
              Befund &amp; Instandsetzung <span className="text-brand-muted font-normal">(optional)</span>
            </label>
            <textarea
              value={befund}
              onChange={(e) => setBefund(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="Vom Bearbeiter: festgestellter Schaden bei der Prüfung + geplante/erfolgte Instandsetzungsmaßnahme…"
              className={`${inputCls} resize-none`}
            />
            <p className="text-[11px] text-brand-muted mt-1">
              Wird dem Kunden mitgeteilt (erscheint in der Kunden-E-Mail), sofern du &bdquo;Kunde per E-Mail informieren&ldquo; anhakst.
            </p>
          </div>

          {/* Geschätzte Schadenshöhe */}
          <div>
            <label className={labelCls}>
              Geschätzte Schadenshöhe (€) <span className="text-brand-muted font-normal">(optional)</span>
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="z. B. 89,90"
              className={`${inputCls} sm:max-w-[200px]`}
            />
            <p className="text-[11px] text-brand-muted mt-1">
              Wird als vorläufige Schadenshöhe übernommen — endgültig in der Abwicklung anpassbar.
            </p>
          </div>

          {/* Fotos */}
          <div>
            <label className={labelCls}>
              Fotos <span className="text-brand-muted font-normal">(optional, max {MAX_PHOTOS})</span>
            </label>
            {photos.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {photos.map((p, i) => (
                  <div key={i} className="relative w-20 h-20 rounded-lg overflow-hidden border border-brand-border dark:border-slate-700">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={URL.createObjectURL(p)} alt={`Foto ${i + 1}`} className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setPhotos((prev) => prev.filter((_, idx) => idx !== i))}
                      className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/70 text-white text-xs leading-none flex items-center justify-center"
                      aria-label="Foto entfernen"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
            {photos.length < MAX_PHOTOS && (
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => { addPhotos(e.target.files); e.target.value = ''; }}
                className="block w-full text-sm text-brand-muted file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-brand-bg dark:file:bg-slate-700 file:text-brand-black dark:file:text-slate-200"
              />
            )}
          </div>

          {/* Admin-Notizen */}
          <div>
            <label className={labelCls}>
              Interne Notizen <span className="text-brand-muted font-normal">(optional)</span>
            </label>
            <textarea
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value)}
              rows={2}
              placeholder="Nur intern sichtbar…"
              className={`${inputCls} resize-none`}
            />
          </div>

          {/* Kunde informieren */}
          <label className="flex items-start gap-3 p-3 rounded-lg border border-brand-border dark:border-slate-700 bg-brand-bg dark:bg-slate-900/40 cursor-pointer">
            <input
              type="checkbox"
              checked={notifyCustomer}
              onChange={(e) => setNotifyCustomer(e.target.checked)}
              className="mt-0.5 w-4 h-4 shrink-0 accent-orange-500"
            />
            <span className="text-sm font-body text-brand-black dark:text-slate-200">
              Kunde per E-Mail informieren
              <span className="block text-xs text-brand-muted mt-0.5">
                Sendet dem Kunden eine Info &bdquo;Schaden an deiner Miete dokumentiert&ldquo; mit
                Kamera, Beschreibung und Fotoanzahl. Nur wenn eine E-Mail-Adresse hinterlegt ist.
              </span>
            </span>
          </label>
        </div>

        <div className="p-6 border-t border-brand-border dark:border-slate-700 flex justify-end gap-3 sticky bottom-0 bg-white dark:bg-slate-800">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-5 py-2 rounded-lg text-sm font-heading font-semibold bg-brand-bg dark:bg-slate-700 text-brand-muted dark:text-slate-200 disabled:opacity-50"
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy || !description.trim() || !effectiveBookingId}
            className="px-5 py-2 rounded-lg text-sm font-heading font-semibold bg-orange-500 text-white hover:bg-orange-600 transition-colors disabled:opacity-40"
          >
            {busy ? 'Wird erstellt…' : 'Schadensmeldung erstellen'}
          </button>
        </div>
      </div>
    </div>
  );
}
