'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import AdminBackLink from '@/components/admin/AdminBackLink';

/**
 * Bulk-Upload fuer Belege.
 *
 * Bis zu 10 Dateien (PDF/JPG/PNG/WebP, je max 20 MB) auf einmal hochladen.
 * Pro Datei laeuft sequentiell:
 *   1. POST /api/admin/belege            (leeren Beleg anlegen)
 *   2. POST /api/admin/belege/[id]/anhaenge  (Datei hochladen)
 *   3. POST /api/admin/belege/[id]/ocr   (Claude liest Daten aus)
 *
 * Sequenziell statt parallel, weil:
 *   - Claude-API ist rate-limitiert (parallel = 429-Storm)
 *   - jeder OCR-Call kostet Geld (Cancel-Knopf bricht den Rest ab)
 *   - Storage-Burst auf Supabase Free-Tier triggert sonst Throttle
 *
 * OCR-Fehler sind nicht fatal — der Beleg ist trotzdem angelegt, der User
 * pflegt die Daten danach manuell. Die Status-Karte zeigt den OCR-Fehler
 * separat (gelb) statt komplett rot.
 */

const MAX_FILES = 10;
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const ACCEPTED = 'application/pdf,image/jpeg,image/png,image/webp';

type RowStatus =
  | 'pending'
  | 'uploading'
  | 'ocr'
  | 'done'
  | 'done_no_ocr'
  | 'error'
  | 'cancelled';

interface Row {
  id: string;
  file: File;
  status: RowStatus;
  belegId?: string;
  belegNr?: string;
  message?: string;
  ocrWarning?: string;
}

export default function BelegeBulkUploadPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const cancelRef = useRef(false);

  function pickFiles(fs: FileList | null) {
    if (!fs) return;
    const list = Array.from(fs);
    const accepted: Row[] = [];
    const errors: string[] = [];
    for (const f of list) {
      if (rows.length + accepted.length >= MAX_FILES) {
        errors.push(`Maximal ${MAX_FILES} Dateien — ${f.name} übersprungen.`);
        continue;
      }
      if (f.size > MAX_FILE_BYTES) {
        errors.push(`${f.name}: zu groß (max 20 MB).`);
        continue;
      }
      const ok = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(f.type);
      if (!ok) {
        errors.push(`${f.name}: nicht unterstütztes Format (PDF/JPG/PNG/WebP).`);
        continue;
      }
      accepted.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        file: f,
        status: 'pending',
      });
    }
    setRows((prev) => [...prev, ...accepted]);
    if (errors.length) alert(errors.join('\n'));
  }

  function removeRow(id: string) {
    if (busy) return;
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  function clearAll() {
    if (busy) return;
    setRows([]);
    if (inputRef.current) inputRef.current.value = '';
  }

  function patchRow(id: string, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  async function processOne(row: Row): Promise<void> {
    // 1. leeren Beleg anlegen
    patchRow(row.id, { status: 'uploading', message: 'Beleg wird angelegt…' });
    const createRes = await fetch('/api/admin/belege', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        beleg_datum: new Date().toISOString().slice(0, 10),
        quelle: 'upload',
        ist_eigenbeleg: false,
        positionen: [],
      }),
    });
    if (!createRes.ok) {
      throw new Error((await createRes.json().catch(() => ({}))).error ?? 'Beleg konnte nicht angelegt werden');
    }
    const createJson = await createRes.json();
    const belegId = createJson.beleg.id as string;
    const belegNr = createJson.beleg.beleg_nr as string;
    patchRow(row.id, { belegId, belegNr, message: 'Datei wird hochgeladen…' });

    // 2. Datei hochladen
    const fd = new FormData();
    fd.append('file', row.file);
    fd.append('kind', 'rechnung');
    const uploadRes = await fetch(`/api/admin/belege/${belegId}/anhaenge`, { method: 'POST', body: fd });
    if (!uploadRes.ok) {
      throw new Error((await uploadRes.json().catch(() => ({}))).error ?? 'Datei-Upload fehlgeschlagen');
    }

    // 3. OCR — soft-fail. Beleg ist trotzdem angelegt; User pflegt manuell.
    patchRow(row.id, { status: 'ocr', message: 'OCR liest Daten aus…' });
    const ocrRes = await fetch(`/api/admin/belege/${belegId}/ocr`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (!ocrRes.ok) {
      const err = (await ocrRes.json().catch(() => ({}))).error ?? `OCR-HTTP ${ocrRes.status}`;
      patchRow(row.id, {
        status: 'done_no_ocr',
        message: undefined,
        ocrWarning: err,
      });
      return;
    }
    patchRow(row.id, { status: 'done', message: undefined, ocrWarning: undefined });
  }

  async function processAll() {
    if (rows.length === 0) return;
    setBusy(true);
    cancelRef.current = false;
    try {
      // Snapshot der zu verarbeitenden Zeilen, damit Re-Renders die Schleife
      // nicht durcheinanderbringen.
      const queue = rows.filter((r) => r.status === 'pending' || r.status === 'error');
      for (const row of queue) {
        if (cancelRef.current) {
          patchRow(row.id, { status: 'cancelled', message: 'Abgebrochen' });
          continue;
        }
        try {
          await processOne(row);
        } catch (err) {
          patchRow(row.id, {
            status: 'error',
            message: (err as Error).message || 'Unbekannter Fehler',
          });
        }
      }
    } finally {
      setBusy(false);
      cancelRef.current = false;
    }
  }

  function cancelAll() {
    cancelRef.current = true;
  }

  const counts = {
    total: rows.length,
    pending: rows.filter((r) => r.status === 'pending').length,
    done: rows.filter((r) => r.status === 'done' || r.status === 'done_no_ocr').length,
    error: rows.filter((r) => r.status === 'error').length,
  };

  function statusBadge(s: RowStatus) {
    if (s === 'pending') return <span className="text-xs px-2 py-0.5 rounded bg-slate-700/40 text-slate-300">⏳ wartet</span>;
    if (s === 'uploading') return <span className="text-xs px-2 py-0.5 rounded bg-blue-500/15 text-blue-300">📤 hochladen</span>;
    if (s === 'ocr') return <span className="text-xs px-2 py-0.5 rounded bg-violet-500/15 text-violet-300">🤖 OCR…</span>;
    if (s === 'done') return <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300">✅ fertig</span>;
    if (s === 'done_no_ocr') return <span className="text-xs px-2 py-0.5 rounded bg-amber-500/15 text-amber-300">⚠ ohne OCR</span>;
    if (s === 'error') return <span className="text-xs px-2 py-0.5 rounded bg-red-500/15 text-red-300">❌ Fehler</span>;
    return <span className="text-xs px-2 py-0.5 rounded bg-slate-700/40 text-slate-400">— abgebrochen</span>;
  }

  function fmtSize(b: number) {
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
    return `${(b / 1024 / 1024).toFixed(1)} MB`;
  }

  return (
    <div className="min-h-dvh bg-[#0a0f1e] text-slate-200 p-4">
      <AdminBackLink href="/admin/buchhaltung/belege" />
      <div className="max-w-3xl mx-auto mt-4 space-y-4">
        <div>
          <h1 className="text-2xl font-heading">Bulk-Upload Belege</h1>
          <p className="text-sm text-slate-400 mt-1">
            Bis zu {MAX_FILES} Dateien (PDF, JPG, PNG, WebP — je max 20 MB) auf einmal. Jede Datei wird
            angelegt, hochgeladen und per KI ausgelesen. Klassifizierung passiert danach pro Beleg.
          </p>
        </div>

        {/* Upload-Zone */}
        <section className="bg-[#111827] border border-dashed border-slate-700 rounded p-4">
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ACCEPTED}
            onChange={(e) => pickFiles(e.target.files)}
            disabled={busy || rows.length >= MAX_FILES}
            className="block w-full text-sm text-slate-300 file:mr-3 file:py-2 file:px-3 file:rounded file:border-0 file:bg-cyan-500 file:text-slate-900 file:font-semibold hover:file:bg-cyan-400 disabled:opacity-40"
          />
          <p className="text-xs text-slate-500 mt-2">
            {rows.length}/{MAX_FILES} Dateien ausgewählt.
            {rows.length >= MAX_FILES && ' Maximum erreicht.'}
          </p>
        </section>

        {/* Aktionen */}
        {rows.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {!busy ? (
              <button
                onClick={processAll}
                disabled={counts.pending + counts.error === 0}
                className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-900 rounded font-semibold disabled:opacity-40"
              >
                {counts.error > 0 && counts.pending === 0
                  ? `${counts.error} Fehler erneut versuchen`
                  : `${counts.pending} Datei(en) verarbeiten`}
              </button>
            ) : (
              <button
                onClick={cancelAll}
                className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/40 rounded font-semibold"
              >
                Abbrechen
              </button>
            )}
            <button
              onClick={clearAll}
              disabled={busy}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded disabled:opacity-40"
            >
              Liste leeren
            </button>
          </div>
        )}

        {/* Status-Karten */}
        {rows.length > 0 && (
          <section className="space-y-2">
            {rows.map((r) => (
              <div
                key={r.id}
                className={`bg-[#111827] border rounded p-3 ${
                  r.status === 'error' ? 'border-red-500/40' :
                  r.status === 'done_no_ocr' ? 'border-amber-500/40' :
                  r.status === 'done' ? 'border-emerald-500/40' :
                  'border-slate-800'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-sm truncate">{r.file.name}</div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {fmtSize(r.file.size)} · {r.file.type || 'unbekannt'}
                      {r.belegNr && ` · ${r.belegNr}`}
                    </div>
                    {r.message && <div className="text-xs text-slate-400 mt-1">{r.message}</div>}
                    {r.ocrWarning && (
                      <div className="text-xs text-amber-300 mt-1">
                        OCR-Hinweis: {r.ocrWarning} — Beleg ist angelegt, du kannst die Daten manuell ergänzen.
                      </div>
                    )}
                  </div>
                  <div className="shrink-0 flex flex-col items-end gap-2">
                    {statusBadge(r.status)}
                    {r.belegId && (r.status === 'done' || r.status === 'done_no_ocr') && (
                      <Link
                        href={`/admin/buchhaltung/belege/${r.belegId}`}
                        className="text-xs text-cyan-400 hover:text-cyan-300"
                      >
                        Öffnen →
                      </Link>
                    )}
                    {!busy && r.status === 'pending' && (
                      <button
                        onClick={() => removeRow(r.id)}
                        className="text-xs text-red-400 hover:text-red-300"
                      >
                        entfernen
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </section>
        )}

        {/* Footer-Bilanz */}
        {!busy && counts.done > 0 && (
          <div className="bg-emerald-500/10 border border-emerald-500/40 rounded p-3 text-sm text-emerald-200">
            {counts.done} Beleg(e) angelegt. Klassifizierung erfolgt pro Beleg unter{' '}
            <Link href="/admin/buchhaltung/belege" className="underline hover:text-emerald-100">
              Belege-Übersicht
            </Link>
            .
          </div>
        )}
      </div>
    </div>
  );
}
