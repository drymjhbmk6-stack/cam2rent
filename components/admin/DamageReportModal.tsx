'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

interface BookingOption {
  id: string;
  product_name: string | null;
  customer_name: string | null;
  customer_email: string | null;
  status: string;
}

interface ItemRow {
  key: string;
  type: 'camera' | 'accessory';
  qty: number;
  name: string;
  code?: string;          // feste SN (Kamera) / Exemplar-Nr. (Zubehör), wenn zugewiesen
  snOptions?: string[];   // Kamera ohne feste SN → wählbare Inventar-Seriennummern
  custom?: boolean;       // manuell hinzugefügt
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

  // Strukturierte Felder — eine Zeile pro tatsächlichem Buchungs-Gegenstand.
  const [itemRows, setItemRows] = useState<ItemRow[]>([]);
  const [affected, setAffected] = useState<string[]>([]); // ausgewählte Row-Keys
  const [snChoice, setSnChoice] = useState<Record<string, string>>({}); // Kamera-SN-Wahl
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
  const [photos, setPhotos] = useState<{ file: File; shared: boolean }[]>([]);
  const [documents, setDocuments] = useState<{ file: File; shared: boolean }[]>([]);
  const [attachEmailHistory, setAttachEmailHistory] = useState(false);
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
      setItemRows([]);
      setAffected([]);
      setSnChoice({});
      setCustomItem('');
      setSchadensart('');
      setSchweregrad('');
      setFunktion('');
      setFestgestellt(todayIso());
      setAmount('');
      setNotifyCustomer(false);
      setDocuments([]);
      setAttachEmailHistory(false);
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

  // Gegenstände der ausgewählten/fixierten Buchung laden — eine Zeile pro
  // tatsächlichem Buchungs-Gegenstand (NICHT pro Inventar-Exemplar).
  useEffect(() => {
    if (!open || !effectiveBookingId) { setItemRows([]); return; }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/admin/booking/${encodeURIComponent(effectiveBookingId)}`);
        const json = await res.json();
        const b = json.booking || {};
        const rows: ItemRow[] = [];

        // 1) Kamera(s) — genau die Kameras der Buchung. SN aus der Zuweisung;
        //    ohne feste Zuweisung → Dropdown mit den Inventar-Seriennummern.
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

        // Modell-Seriennummern nur einmal je Modell laden (Cache).
        const serialCache: Record<string, string[]> = {};
        let camIdx = 0;
        for (const c of cams) {
          const nm = (c.product_name || '').trim();
          if (!nm) continue;
          const key = `cam-${camIdx++}`;
          if (c.serial_number) {
            rows.push({ key, type: 'camera', qty: 1, name: nm, code: c.serial_number });
            continue;
          }
          const cacheKey = nm.toLowerCase();
          if (!(cacheKey in serialCache)) {
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
                  .slice(0, 30);
              }
            } catch { /* Inventar-Lookup optional */ }
            serialCache[cacheKey] = serials;
          }
          rows.push({ key, type: 'camera', qty: 1, name: nm, snOptions: serialCache[cacheKey] });
        }

        // 2) Zubehör-Exemplar-Codes je accessory_id sammeln.
        const codesByAcc: Record<string, string[]> = {};
        (Array.isArray(b.unit_codes) ? b.unit_codes : []).forEach(
          (u: { accessory_id?: string; exemplar_code?: string }) => {
            if (!u.accessory_id || !u.exemplar_code) return;
            (codesByAcc[u.accessory_id] ||= []).push(u.exemplar_code);
          },
        );

        // 3) Zubehör — nur echte Teile (Set-Container ohne accessory_id raus).
        //    Einzeln getrackt → eine Zeile pro Exemplar-Nr.; sonst eine Zeile
        //    mit Stückzahl.
        (Array.isArray(b.resolved_items) ? b.resolved_items : []).forEach(
          (it: { name?: string; accessory_id?: string; qty?: number }, idx: number) => {
            if (!it?.name || !it.accessory_id) return;
            const codes = codesByAcc[it.accessory_id] || [];
            const qty = it.qty && it.qty > 0 ? it.qty : 1;
            if (codes.length > 0) {
              codes.forEach((code, ci) =>
                rows.push({ key: `acc-${idx}-${it.accessory_id}-${ci}`, type: 'accessory', qty: 1, name: it.name!, code }),
              );
              for (let i = 0; i < qty - codes.length; i++) {
                rows.push({ key: `acc-${idx}-${it.accessory_id}-x${i}`, type: 'accessory', qty: 1, name: it.name! });
              }
            } else {
              rows.push({ key: `acc-${idx}-${it.accessory_id}`, type: 'accessory', qty, name: it.name! });
            }
          },
        );

        if (!cancelled) setItemRows(rows);
      } catch {
        if (!cancelled) setItemRows([]);
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

  const toggleAffected = useCallback((key: string) => {
    setAffected((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }, []);

  const removeRow = useCallback((key: string) => {
    setItemRows((prev) => prev.filter((r) => r.key !== key));
    setAffected((prev) => prev.filter((k) => k !== key));
  }, []);

  const addCustomItem = useCallback(() => {
    const v = customItem.trim();
    if (!v) return;
    const key = `custom-${v.toLowerCase()}`;
    setItemRows((prev) => (prev.some((r) => r.key === key) ? prev : [...prev, { key, type: 'accessory', qty: 1, name: v, custom: true }]));
    setAffected((prev) => (prev.includes(key) ? prev : [...prev, key]));
    setCustomItem('');
  }, [customItem]);

  // Label einer Zeile für die "Betroffen:"-Zeile.
  const rowLabel = useCallback((r: ItemRow): string => {
    const sn = r.code || (r.snOptions?.length ? snChoice[r.key] : '') || '';
    const qtyP = r.qty > 1 ? `${r.qty}× ` : '';
    const snS = sn ? ` · ${r.type === 'camera' ? 'SN' : 'Nr.'} ${sn}` : '';
    return `${qtyP}${r.name}${snS}`;
  }, [snChoice]);

  const addPhotos = useCallback((files: FileList | null) => {
    if (!files) return;
    // WICHTIG: Dateien SYNCHRON einsammeln. Der onChange-Handler setzt direkt
    // nach diesem Aufruf `input.value = ''`, was die (live) FileList leert —
    // würde `Array.from(files)` erst im (verzögerten) setState-Updater laufen,
    // wäre die Liste leer und es käme nichts an ("nichts passiert").
    // Manche Quellen (Dropbox/WhatsApp) liefern leeren MIME-Typ → Endung prüfen.
    const isImage = (f: File) =>
      f.type.startsWith('image/') || /\.(jpe?g|png|webp|heic|heif|gif)$/i.test(f.name);
    const picked = Array.from(files).filter(isImage);
    if (picked.length === 0) return;
    setPhotos((prev) => {
      const next = [...prev];
      for (const f of picked) {
        if (next.length >= MAX_PHOTOS) break;
        next.push({ file: f, shared: false });
      }
      return next;
    });
  }, []);

  const addDocs = useCallback((files: FileList | null) => {
    if (!files) return;
    // Synchron einsammeln (siehe addPhotos) — sonst leert value='' die Liste.
    const picked = Array.from(files);
    if (picked.length === 0) return;
    setDocuments((prev) => {
      const next = [...prev];
      for (const f of picked) {
        if (next.length >= 15) break;
        next.push({ file: f, shared: false });
      }
      return next;
    });
  }, []);

  // Strukturierte Beschreibung zusammensetzen
  function buildDescription(): string {
    const lines: string[] = [];
    const affectedLabels = itemRows.filter((r) => affected.includes(r.key)).map(rowLabel);
    if (affectedLabels.length) lines.push(`Betroffen: ${affectedLabels.join(', ')}`);
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
      // Fotos: freigegebene getrennt, damit der Server sie als kundensichtbar markiert.
      for (const p of photos) fd.append(p.shared ? 'photos_shared' : 'photos', p.file);
      // Dokument-Anhänge analog.
      for (const d of documents) fd.append(d.shared ? 'documents_shared' : 'documents', d.file);
      if (attachEmailHistory) fd.append('attach_email_history', 'true');

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
                          onClick={() => { setSelectedId(b.id); setAffected([]); setSnChoice({}); }}
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

          {/* Betroffene Gegenstände — vertikale Liste, eine Zeile pro Gegenstand */}
          {effectiveBookingId && (
            <div>
              <label className={labelCls}>
                Betroffene Gegenstände <span className="text-brand-muted font-normal">(anhaken)</span>
              </label>
              {itemRows.length > 0 ? (
                <div className="rounded-lg border border-brand-border dark:border-slate-700 divide-y divide-brand-border dark:divide-slate-700 overflow-hidden">
                  {itemRows.map((row) => {
                    const on = affected.includes(row.key);
                    return (
                      <div
                        key={row.key}
                        className={`flex items-start gap-3 px-3 py-2.5 ${on ? 'bg-rose-50/60 dark:bg-rose-950/20' : 'bg-white dark:bg-slate-900/40'}`}
                      >
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => toggleAffected(row.key)}
                          className="mt-0.5 w-4 h-4 shrink-0 accent-rose-500"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-body text-brand-black dark:text-slate-200">
                            <span className="font-semibold tabular-nums">{row.qty}×</span> {row.name}
                            {row.code && (
                              <span className="text-brand-muted"> · {row.type === 'camera' ? 'SN' : 'Nr.'} {row.code}</span>
                            )}
                          </div>
                          {!row.code && row.type === 'camera' && (row.snOptions?.length ?? 0) > 0 && (
                            <select
                              value={snChoice[row.key] || ''}
                              onChange={(e) => setSnChoice((p) => ({ ...p, [row.key]: e.target.value }))}
                              className="mt-1.5 text-xs px-2 py-1 rounded border border-brand-border dark:border-slate-700 bg-white dark:bg-slate-900 text-brand-black dark:text-slate-100 outline-none"
                            >
                              <option value="">Seriennummer wählen…</option>
                              {row.snOptions!.map((sn) => (
                                <option key={sn} value={sn}>SN {sn}</option>
                              ))}
                            </select>
                          )}
                          {!row.code && row.type === 'camera' && (row.snOptions?.length ?? 0) === 0 && (
                            <p className="text-[11px] text-brand-muted mt-0.5">keine Seriennummer im Inventar hinterlegt</p>
                          )}
                        </div>
                        {row.custom && (
                          <button
                            type="button"
                            onClick={() => removeRow(row.key)}
                            className="text-brand-muted text-sm px-1 shrink-0"
                            aria-label="Entfernen"
                          >
                            ×
                          </button>
                        )}
                      </div>
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
            <p className="text-[11px] text-brand-muted mb-2">
              Standardmäßig <strong>nur intern</strong>. Häkchen &bdquo;Für Kunde&ldquo; gibt ein Foto zum Mitschicken frei
              (greift bei aktivierter Kunden-E-Mail).
            </p>
            {photos.length > 0 && (
              <div className="flex flex-wrap gap-3 mb-2">
                {photos.map((p, i) => (
                  <div key={i} className="w-24">
                    <div className="relative w-24 h-24 rounded-lg overflow-hidden border border-brand-border dark:border-slate-700">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={URL.createObjectURL(p.file)} alt={`Foto ${i + 1}`} className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setPhotos((prev) => prev.filter((_, idx) => idx !== i))}
                        className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/70 text-white text-xs leading-none flex items-center justify-center"
                        aria-label="Foto entfernen"
                      >
                        ×
                      </button>
                    </div>
                    <label className="flex items-center gap-1 mt-1 text-[11px] text-brand-muted cursor-pointer">
                      <input
                        type="checkbox"
                        checked={p.shared}
                        onChange={(e) => setPhotos((prev) => prev.map((x, idx) => idx === i ? { ...x, shared: e.target.checked } : x))}
                        className="w-3.5 h-3.5 accent-orange-500"
                      />
                      Für Kunde
                    </label>
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

          {/* Weitere Dokumente (PDF/Bild) */}
          <div>
            <label className={labelCls}>
              Weitere Dokumente <span className="text-brand-muted font-normal">(optional, PDF/Bild — z. B. Mailverlauf, Kostenvoranschlag)</span>
            </label>
            <p className="text-[11px] text-brand-muted mb-2">
              Standardmäßig <strong>nur intern</strong>. &bdquo;Für Kunde&ldquo; gibt ein Dokument zum Mitschicken frei.
            </p>
            {documents.length > 0 && (
              <div className="space-y-2 mb-2">
                {documents.map((d, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 p-2 rounded-lg border border-brand-border dark:border-slate-700 bg-brand-bg dark:bg-slate-900/40">
                    <span className="text-sm font-body text-brand-black dark:text-slate-200 truncate">{d.file.name}</span>
                    <div className="flex items-center gap-3 shrink-0">
                      <label className="flex items-center gap-1 text-[11px] text-brand-muted cursor-pointer">
                        <input
                          type="checkbox"
                          checked={d.shared}
                          onChange={(e) => setDocuments((prev) => prev.map((x, idx) => idx === i ? { ...x, shared: e.target.checked } : x))}
                          className="w-3.5 h-3.5 accent-orange-500"
                        />
                        Für Kunde
                      </label>
                      <button
                        type="button"
                        onClick={() => setDocuments((prev) => prev.filter((_, idx) => idx !== i))}
                        className="w-5 h-5 rounded-full bg-black/60 text-white text-xs leading-none flex items-center justify-center"
                        aria-label="Dokument entfernen"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {documents.length < 15 && (
              <input
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/webp"
                multiple
                onChange={(e) => { addDocs(e.target.files); e.target.value = ''; }}
                className="block w-full text-sm text-brand-muted file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-brand-bg dark:file:bg-slate-700 file:text-brand-black dark:file:text-slate-200"
              />
            )}
          </div>

          {/* E-Mail-Verlauf der Buchung anhängen (intern) */}
          <label className="flex items-start gap-3 p-3 rounded-lg border border-brand-border dark:border-slate-700 bg-brand-bg dark:bg-slate-900/40 cursor-pointer">
            <input
              type="checkbox"
              checked={attachEmailHistory}
              onChange={(e) => setAttachEmailHistory(e.target.checked)}
              className="mt-0.5 w-4 h-4 shrink-0 accent-orange-500"
            />
            <span className="text-sm font-body text-brand-black dark:text-slate-200">
              E-Mail-Verlauf der Buchung anhängen
              <span className="block text-xs text-brand-muted mt-0.5">
                Legt den protokollierten E-Mail-Verlauf der Buchung als PDF-Anhang an (intern, zur Dokumentation).
              </span>
            </span>
          </label>

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
