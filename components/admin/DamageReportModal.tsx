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

const MAX_PHOTOS = 5;

/**
 * Admin erstellt im Namen des Kunden eine Schadensmeldung — spiegelt den
 * Kunden-Flow (Beschreibung + Fotos). Ohne `bookingId` erscheint ein
 * Buchungs-Picker, sonst ist die Buchung fixiert.
 */
export default function DamageReportModal({ open, onClose, onSuccess, bookingId, bookingLabel }: Props) {
  const fixed = !!bookingId;

  const [bookings, setBookings] = useState<BookingOption[]>([]);
  const [loadingBookings, setLoadingBookings] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState('');

  const [description, setDescription] = useState('');
  const [adminNotes, setAdminNotes] = useState('');
  const [photos, setPhotos] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset bei jedem Öffnen
  useEffect(() => {
    if (open) {
      setDescription('');
      setAdminNotes('');
      setPhotos([]);
      setError(null);
      setSearch('');
      setSelectedId('');
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

  const effectiveBookingId = fixed ? bookingId! : selectedId;

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

  async function submit() {
    setError(null);
    if (!effectiveBookingId) {
      setError('Bitte eine Buchung auswählen.');
      return;
    }
    if (!description.trim()) {
      setError('Bitte eine Beschreibung eingeben.');
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('bookingId', effectiveBookingId);
      fd.append('description', description.trim());
      if (adminNotes.trim()) fd.append('admin_notes', adminNotes.trim());
      for (const p of photos) fd.append('photos', p);

      const res = await fetch('/api/admin/damage', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Schadensmeldung fehlgeschlagen.');

      onSuccess?.('Schadensmeldung erstellt.');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Erstellen.');
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

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
            Für den Kunden erfassen — Beschreibung und optional Fotos. Prüfung, Kaution und Abwicklung
            danach wie gewohnt unter &bdquo;Schadensmeldungen&ldquo;.
          </p>
        </div>

        <div className="p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-sm font-body text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          {/* Buchung */}
          <div>
            <label className="block text-sm font-body font-semibold text-brand-black dark:text-slate-200 mb-1.5">
              Buchung
            </label>
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
                  className="w-full px-3 py-2 rounded-lg border border-brand-border dark:border-slate-700 bg-white dark:bg-slate-900 text-base text-brand-black dark:text-slate-100 outline-none focus:border-accent-blue"
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
                          onClick={() => setSelectedId(b.id)}
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

          {/* Beschreibung */}
          <div>
            <label className="block text-sm font-body font-semibold text-brand-black dark:text-slate-200 mb-1.5">
              Beschreibung <span className="text-red-500">*</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              maxLength={2000}
              placeholder="Was ist beschädigt? Wo und wie ist der Schaden entstanden?"
              className="w-full px-3 py-2 rounded-lg border border-brand-border dark:border-slate-700 bg-white dark:bg-slate-900 text-base text-brand-black dark:text-slate-100 outline-none focus:border-accent-blue resize-none"
            />
            <p className="text-[11px] text-brand-muted mt-1 text-right">{description.length}/2000</p>
          </div>

          {/* Fotos */}
          <div>
            <label className="block text-sm font-body font-semibold text-brand-black dark:text-slate-200 mb-1.5">
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
            <label className="block text-sm font-body font-semibold text-brand-black dark:text-slate-200 mb-1.5">
              Interne Notizen <span className="text-brand-muted font-normal">(optional)</span>
            </label>
            <textarea
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value)}
              rows={2}
              placeholder="Nur intern sichtbar…"
              className="w-full px-3 py-2 rounded-lg border border-brand-border dark:border-slate-700 bg-white dark:bg-slate-900 text-base text-brand-black dark:text-slate-100 outline-none focus:border-accent-blue resize-none"
            />
          </div>
        </div>

        <div className="p-6 border-t border-brand-border dark:border-slate-700 flex justify-end gap-3">
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
