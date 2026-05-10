'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import AdminBackLink from '@/components/admin/AdminBackLink';
import { shrinkImageFileIfNeeded } from '@/lib/shrink-image-client';

/**
 * Bulk-Upload fuer Belege.
 *
 * Bis zu 50 Dateien (PDF/JPG/PNG/WebP, je max 20 MB) auf einmal hochladen.
 * Pro Datei laeuft sequentiell:
 *   1. POST /api/admin/belege            (leeren Beleg anlegen)
 *   2. POST /api/admin/belege/[id]/anhaenge  (Datei hochladen + Duplikat-Check)
 *   3. POST /api/admin/belege/[id]/ocr   (fire-and-forget, Push am Ende)
 *
 * OCR laeuft im Hintergrund: Der Server-Request wird mit `keepalive: true`
 * abgesetzt und NICHT abgewartet. Der User kann die Seite verlassen — wenn die
 * Analyse durch ist, kommt eine Push-Notification (Permission `finanzen`) und
 * die Belege-Liste zeigt den fertigen Eintrag.
 *
 * Sequenziell fuer Schritte 1+2, weil:
 *   - Storage-Burst auf Supabase Free-Tier triggert sonst Throttle
 *   - parallele Beleg-Inserts haetten alle die gleiche Datums-Default-Sequenz
 *
 * Duplikate: Server antwortet mit 409 + existing_beleg_id wenn der File-Hash
 * schon mal hochgeladen wurde. Wir loeschen dann den frisch angelegten leeren
 * Beleg wieder und zeigen den Verweis im UI.
 */

const MAX_FILES = 50;
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const ACCEPTED = 'application/pdf,image/jpeg,image/png,image/webp';

type RowStatus =
  | 'pending'
  | 'uploading'
  | 'queued'        // hochgeladen, OCR laeuft im Hintergrund
  | 'duplicate'     // gleicher Datei-Hash existiert schon
  | 'error'
  | 'cancelled';

interface Row {
  id: string;
  file: File;
  status: RowStatus;
  belegId?: string;
  belegNr?: string;
  message?: string;
  duplicateBelegId?: string;
  duplicateBelegNr?: string | null;
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

    // 2. Datei hochladen — Duplikat-Check passiert im Server.
    // Foto-Belege > 3.5 MB werden im Browser verkleinert (Claude Vision 5 MB).
    const uploadFile = await shrinkImageFileIfNeeded(row.file);
    const fd = new FormData();
    fd.append('file', uploadFile);
    fd.append('kind', 'rechnung');
    const uploadRes = await fetch(`/api/admin/belege/${belegId}/anhaenge`, { method: 'POST', body: fd });

    if (uploadRes.status === 409) {
      const dup = (await uploadRes.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
        existing_beleg_id?: string;
        existing_beleg_nr?: string | null;
      };
      // Wenn Server das Duplikat-Signal liefert: leeren Beleg wieder loeschen
      // und Row als 'duplicate' markieren mit Verweis.
      if (dup.error === 'duplicate') {
        await fetch(`/api/admin/belege/${belegId}`, { method: 'DELETE' }).catch(() => {});
        patchRow(row.id, {
          status: 'duplicate',
          message: dup.message ?? 'Datei bereits vorhanden.',
          duplicateBelegId: dup.existing_beleg_id,
          duplicateBelegNr: dup.existing_beleg_nr ?? null,
          belegId: undefined,
          belegNr: undefined,
        });
        return;
      }
      // 409 mit anderer Bedeutung (z.B. festgeschrieben) — als Fehler behandeln
      throw new Error(dup.message ?? dup.error ?? 'Konflikt beim Upload');
    }

    if (!uploadRes.ok) {
      throw new Error((await uploadRes.json().catch(() => ({}))).error ?? 'Datei-Upload fehlgeschlagen');
    }

    // 3. OCR fire-and-forget — Server schickt am Ende eine Push-Notification
    //    an alle Admins mit `finanzen`-Permission. Wir warten NICHT auf die
    //    Antwort, der User kann die Seite verlassen.
    //
    //    `keepalive: true` sorgt dafuer, dass der Browser die Anfrage auch
    //    nach Tab-Close noch zu Ende sendet. Body ist klein genug fuer das
    //    64 KB-Limit.
    void fetch(`/api/admin/belege/${belegId}/ocr`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notify: true }),
      keepalive: true,
    }).catch((err) => {
      // Netzwerkfehler beim Auslösen — ignorieren, der User sieht den Beleg
      // trotzdem in der Liste mit ocr_status='running' und kann manuell neu
      // triggern.
      console.warn('[bulk] ocr trigger failed:', err);
    });

    patchRow(row.id, {
      status: 'queued',
      message: 'KI-Analyse läuft im Hintergrund — Push kommt, sobald fertig.',
    });
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
    queued: rows.filter((r) => r.status === 'queued').length,
    duplicate: rows.filter((r) => r.status === 'duplicate').length,
    error: rows.filter((r) => r.status === 'error').length,
  };

  function statusBadge(s: RowStatus) {
    if (s === 'pending') return <span className="text-xs px-2 py-0.5 rounded bg-slate-700/40 text-slate-300">⏳ wartet</span>;
    if (s === 'uploading') return <span className="text-xs px-2 py-0.5 rounded bg-blue-500/15 text-blue-300">📤 hochladen</span>;
    if (s === 'queued') return <span className="text-xs px-2 py-0.5 rounded bg-violet-500/15 text-violet-300">🤖 in Warteschlange</span>;
    if (s === 'duplicate') return <span className="text-xs px-2 py-0.5 rounded bg-amber-500/15 text-amber-300">⚠ Duplikat</span>;
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
            hochgeladen, geprüft (Duplikat-Erkennung) und im Hintergrund per KI ausgelesen. Du kannst die
            Seite verlassen — eine Push-Notification informiert dich, sobald die Analyse fertig ist.
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
                  r.status === 'duplicate' ? 'border-amber-500/40' :
                  r.status === 'queued' ? 'border-violet-500/40' :
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
                    {r.status === 'duplicate' && r.duplicateBelegId && (
                      <Link
                        href={`/admin/buchhaltung/belege/${r.duplicateBelegId}`}
                        className="text-xs text-amber-300 hover:text-amber-200 underline mt-1 inline-block"
                      >
                        → Bestehenden Beleg {r.duplicateBelegNr ?? 'öffnen'}
                      </Link>
                    )}
                  </div>
                  <div className="shrink-0 flex flex-col items-end gap-2">
                    {statusBadge(r.status)}
                    {r.belegId && r.status === 'queued' && (
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
        {!busy && counts.queued > 0 && (
          <div className="bg-violet-500/10 border border-violet-500/40 rounded p-3 text-sm text-violet-200">
            {counts.queued} Beleg(e) hochgeladen — KI-Analyse läuft im Hintergrund. Du kannst die Seite
            verlassen. Push-Notifications kommen, sobald jeder Beleg analysiert ist. Übersicht:{' '}
            <Link href="/admin/buchhaltung/belege" className="underline hover:text-violet-100">
              Belege-Liste
            </Link>
            .
          </div>
        )}
        {!busy && counts.duplicate > 0 && (
          <div className="bg-amber-500/10 border border-amber-500/40 rounded p-3 text-sm text-amber-200">
            {counts.duplicate} Datei(en) waren bereits vorhanden und wurden übersprungen.
          </div>
        )}
      </div>
    </div>
  );
}
