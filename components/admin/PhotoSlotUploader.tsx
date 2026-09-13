'use client';

import { useEffect, useState } from 'react';
import {
  MAX_EXTRA_PHOTOS,
  type PhotoSlot,
} from '@/lib/photo-slots';

/**
 * Pflicht-Foto-Erfassung für Übergabe (Abholung) und Verpackungskontrolle
 * (Versand) — geteilte Komponente, damit beide Workflows identisch aussehen
 * und sich identisch verhalten.
 *
 * Pro Position (Gesamtfoto / Kamera vorne / Kamera hinten) je ein Kamera- und
 * ein Galerie-Button (`capture="environment"` öffnet auf dem Handy direkt die
 * Rückkamera; ohne `capture` die Foto-Mediathek). Darunter optionale
 * Zusatzfotos.
 *
 * Die Komponente hält KEINEN eigenen Datei-State — Dateien liegen beim
 * Aufrufer (der sie beim Absenden in das FormData packt). Nur die
 * Vorschau-Data-URLs werden hier lokal gehalten.
 */

const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

export interface PhotoSlotUploaderProps {
  /** Pflicht-Positionen, aus `buildPhotoSlots()`. */
  slots: PhotoSlot[];
  /** Aktuelle Dateien je Slot-Key. */
  files: Record<string, File>;
  onSetFile: (slotKey: string, file: File | null) => void;
  /** Freiwillige Zusatzfotos. */
  extras: File[];
  onSetExtras: (files: File[]) => void;
  /** Muss innerhalb einer Seite eindeutig sein (input-IDs). */
  idPrefix: string;
  /** Überschrift + Einleitung — je Workflow leicht unterschiedlich. */
  title?: string;
  intro?: string;
  disabled?: boolean;
}

export default function PhotoSlotUploader({
  slots,
  files,
  onSetFile,
  extras,
  onSetExtras,
  idPrefix,
  title = 'Fotos (Pflicht)',
  intro,
  disabled = false,
}: PhotoSlotUploaderProps) {
  const [error, setError] = useState('');
  const doneCount = slots.filter((s) => !!files[s.key]).length;
  const allDone = doneCount >= slots.length;

  function accept(file: File | undefined | null, apply: (f: File) => void) {
    if (!file) return;
    if (file.size > MAX_PHOTO_BYTES) {
      setError(`"${file.name}" ist zu groß (max 10 MB).`);
      return;
    }
    setError('');
    apply(file);
  }

  return (
    <div className="mb-5">
      <div className="flex items-center justify-between gap-3 mb-1.5">
        <label className="block text-xs uppercase tracking-wider text-[var(--admin-text-dim)]">
          {title}
        </label>
        <span
          className={`text-xs font-semibold tabular-nums ${
            allDone ? 'text-emerald-400' : 'text-amber-400'
          }`}
        >
          {allDone ? '✓ ' : ''}
          {doneCount}/{slots.length}
        </span>
      </div>
      <p className="text-xs text-[var(--admin-text-dim)] mb-3">
        {intro ??
          'Pflicht: ein Gesamtfoto von allem, was rausgeht — und pro Kamera je ein Foto von vorne und von der Rückseite.'}
      </p>

      <div className="space-y-3">
        {slots.map((slot) => (
          <SlotCard
            key={slot.key}
            slot={slot}
            file={files[slot.key] ?? null}
            inputId={`${idPrefix}-${slot.key}`}
            disabled={disabled}
            onPick={(f) => accept(f, (file) => onSetFile(slot.key, file))}
            onClear={() => onSetFile(slot.key, null)}
          />
        ))}
      </div>

      {/* Freiwillige Zusatzfotos */}
      <div className="mt-4 pt-3 border-t border-[var(--admin-faint)]">
        <div className="flex items-center justify-between gap-3 mb-2">
          <span className="text-xs uppercase tracking-wider text-[var(--admin-text-dim)]">
            Weitere Fotos (optional)
          </span>
          <span className="text-xs text-[var(--admin-text-dim)] tabular-nums">
            {extras.length}/{MAX_EXTRA_PHOTOS}
          </span>
        </div>
        <p className="text-xs text-[var(--admin-text-dim)] mb-2">
          z.B. vorhandene Kratzer, Seriennummern-Schild, Zubehör im Detail.
        </p>

        {extras.length > 0 && (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-2">
            {extras.map((f, i) => (
              <ExtraThumb
                key={`${f.name}-${f.lastModified}-${i}`}
                file={f}
                disabled={disabled}
                onRemove={() => onSetExtras(extras.filter((_, idx) => idx !== i))}
              />
            ))}
          </div>
        )}

        {extras.length < MAX_EXTRA_PHOTOS && (
          <>
            <input
              id={`${idPrefix}-extra-camera`}
              type="file"
              accept="image/*"
              capture="environment"
              disabled={disabled}
              onChange={(e) => {
                accept(e.target.files?.[0], (file) => onSetExtras([...extras, file]));
                e.target.value = '';
              }}
              className="hidden"
            />
            <input
              id={`${idPrefix}-extra-gallery`}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
              multiple
              disabled={disabled}
              onChange={(e) => {
                const picked = Array.from(e.target.files ?? []);
                const room = MAX_EXTRA_PHOTOS - extras.length;
                const ok = picked.filter((f) => f.size <= MAX_PHOTO_BYTES).slice(0, room);
                if (ok.length < picked.length) setError('Einige Fotos wurden übersprungen (max 10 MB bzw. Limit erreicht).');
                else setError('');
                if (ok.length > 0) onSetExtras([...extras, ...ok]);
                e.target.value = '';
              }}
              className="hidden"
            />
            <div className="flex gap-2">
              <label
                htmlFor={`${idPrefix}-extra-camera`}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-admin-surface-2 border border-[var(--admin-input-border)] text-admin-text text-xs font-medium transition-colors ${
                  disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-[var(--admin-faint)]'
                }`}
              >
                <span>📷</span>
                <span>Foto aufnehmen</span>
              </label>
              <label
                htmlFor={`${idPrefix}-extra-gallery`}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-admin-surface-2 border border-[var(--admin-input-border)] text-admin-text text-xs font-medium transition-colors ${
                  disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-[var(--admin-faint)]'
                }`}
              >
                <span>🖼</span>
                <span>Galerie</span>
              </label>
            </div>
          </>
        )}
      </div>

      {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
      {!allDone && (
        <p className="text-xs text-amber-400 mt-2">
          ⚠ Noch offen: {slots.filter((s) => !files[s.key]).map((s) => s.title).join(' · ')}
        </p>
      )}
    </div>
  );
}

// ─── Einzelne Pflicht-Position ──────────────────────────────────────────────

function SlotCard({
  slot, file, inputId, disabled, onPick, onClear,
}: {
  slot: PhotoSlot;
  file: File | null;
  inputId: string;
  disabled: boolean;
  onPick: (f: File | undefined) => void;
  onClear: () => void;
}) {
  const preview = useObjectUrl(file);

  return (
    <div
      className={`rounded-lg border p-3 transition-colors ${
        file
          ? 'bg-emerald-500/5 border-emerald-600/50'
          : 'bg-[var(--admin-bg)] border-[var(--admin-faint)]'
      }`}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-admin-text flex items-center gap-1.5">
            <span>{file ? '✓' : slot.kind === 'overview' ? '📦' : '📷'}</span>
            <span className="truncate">{slot.title}</span>
          </p>
          <p className="text-xs text-[var(--admin-text-dim)] mt-0.5">
            {slot.hint}
            {slot.serial && <> · Seriennr.: <span className="font-mono">{slot.serial}</span></>}
          </p>
        </div>
      </div>

      <input
        id={`${inputId}-camera`}
        type="file"
        accept="image/*"
        capture="environment"
        disabled={disabled}
        onChange={(e) => { onPick(e.target.files?.[0]); e.target.value = ''; }}
        className="hidden"
      />
      <input
        id={`${inputId}-gallery`}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        disabled={disabled}
        onChange={(e) => { onPick(e.target.files?.[0]); e.target.value = ''; }}
        className="hidden"
      />

      {preview ? (
        <div className="space-y-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview}
            alt={slot.title}
            className="w-full max-h-48 object-contain rounded-lg bg-[var(--admin-bg)] border border-admin-border"
          />
          <div className="flex gap-2">
            <label
              htmlFor={`${inputId}-camera`}
              className={`flex-1 text-center px-3 py-2 rounded-lg bg-admin-surface-2 border border-[var(--admin-input-border)] text-admin-text text-xs font-medium ${
                disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-[var(--admin-faint)]'
              }`}
            >
              📷 Neu aufnehmen
            </label>
            <button
              type="button"
              disabled={disabled}
              onClick={onClear}
              className="px-3 py-2 rounded-lg text-xs text-admin-muted hover:text-admin-text underline disabled:opacity-50"
            >
              Entfernen
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <label
            htmlFor={`${inputId}-camera`}
            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-admin-accent text-slate-950 text-sm font-medium transition-colors ${
              disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-admin-accent-hover'
            }`}
          >
            <span>📷</span>
            <span>Foto aufnehmen</span>
          </label>
          <label
            htmlFor={`${inputId}-gallery`}
            className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-admin-surface-2 border border-[var(--admin-input-border)] text-admin-text text-sm font-medium transition-colors ${
              disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-[var(--admin-faint)]'
            }`}
          >
            <span>🖼</span>
            <span className="sr-only sm:not-sr-only">Galerie</span>
          </label>
        </div>
      )}
    </div>
  );
}

function ExtraThumb({ file, disabled, onRemove }: { file: File; disabled: boolean; onRemove: () => void }) {
  const preview = useObjectUrl(file);
  return (
    <div className="relative group">
      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={preview}
          alt={file.name}
          className="w-full aspect-square object-cover rounded-lg bg-[var(--admin-bg)] border border-[var(--admin-faint)]"
        />
      ) : (
        <div className="w-full aspect-square rounded-lg bg-[var(--admin-bg)] border border-[var(--admin-faint)]" />
      )}
      <button
        type="button"
        disabled={disabled}
        onClick={onRemove}
        aria-label="Foto entfernen"
        className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-red-600 text-white text-xs font-bold flex items-center justify-center shadow disabled:opacity-50"
      >
        ✕
      </button>
    </div>
  );
}

/**
 * Object-URL für die Vorschau. Bewusst `createObjectURL` statt FileReader —
 * kein Base64-Blowup im Speicher bei mehreren 5-MB-Handyfotos. Die URL wird
 * beim Wechsel/Unmount wieder freigegeben.
 */
function useObjectUrl(file: File | null): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file) { setUrl(null); return; }
    const next = URL.createObjectURL(file);
    setUrl(next);
    // Kein Ref-Guard hier: unter React StrictMode laeuft der Effekt doppelt,
    // ein "schon gesehen"-Guard wuerde die URL im ersten Durchlauf freigeben
    // und im zweiten keine neue erzeugen → leere Vorschau.
    return () => URL.revokeObjectURL(next);
  }, [file]);

  return url;
}
