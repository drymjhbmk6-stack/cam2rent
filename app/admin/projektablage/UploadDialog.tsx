'use client';

/**
 * Projektablage — Ordner hochladen.
 *
 * Der Browser laedt die Dateien DIREKT zu Supabase (signierte Upload-URLs).
 * Der Server bekommt nur die Metadaten zu sehen — anders waeren grosse
 * Dateien nicht machbar, weil jeder serverseitige Upload-Pfad die Datei
 * komplett in den RAM liest.
 *
 * ZIP-Archive werden aus demselben Grund ebenfalls im Browser entpackt und
 * danach als normale Dateiliste durch dieselbe Pipeline geschickt — es gibt
 * KEINEN serverseitigen Entpack-Pfad.
 */

import { useCallback, useRef, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { unzip } from 'fflate';
import { Button, Modal } from '@/components/admin/ui';
import {
  shouldIgnorePath,
  sanitizeRelPath,
  baseName,
  fmtBytes,
  isZipFileName,
  UPLOAD_URL_BATCH,
  MAX_STAND_FILES,
  MAX_ZIP_BYTES,
} from '@/lib/projektablage-shared';

/** Wie viele Dateien gleichzeitig hochgeladen werden. */
const PARALLEL = 4;

/**
 * Eigener Storage-Client OHNE Sitzungsverwaltung.
 *
 * Der geteilte Browser-Client aus lib/supabase nutzt denselben
 * localStorage-Schluessel wie der Kunden-Login. Waere im selben Browser ein
 * Kunde angemeldet, schickte er dessen Token als Authorization-Header mit —
 * autorisiert wird der Upload aber allein durch das signierte Token. Mit
 * `persistSession: false` bleibt der Upload davon garantiert unberuehrt.
 */
function storageClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

interface GewaehlteDatei {
  file: File;
  relPfad: string;
}

interface UploadUrl {
  dateiId: string;
  relPfad: string;
  storagePfad: string;
  token: string;
}

/** Liest ein Verzeichnis vollstaendig aus — readEntries liefert nur Haeppchen. */
function readAllEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve) => {
    const alle: FileSystemEntry[] = [];
    const weiter = () => {
      reader.readEntries(
        (entries) => {
          if (entries.length === 0) {
            resolve(alle);
            return;
          }
          alle.push(...entries);
          weiter();
        },
        () => resolve(alle)
      );
    };
    weiter();
  });
}

function entryToFile(entry: FileSystemFileEntry): Promise<File | null> {
  return new Promise((resolve) => {
    entry.file(
      (file) => resolve(file),
      () => resolve(null)
    );
  });
}

/** Laeuft rekursiv durch einen hineingezogenen Ordner. */
async function sammleAusEntry(
  entry: FileSystemEntry,
  prefix: string,
  raus: GewaehlteDatei[]
): Promise<void> {
  const pfad = prefix ? `${prefix}/${entry.name}` : entry.name;

  if (entry.isFile) {
    const file = await entryToFile(entry as FileSystemFileEntry);
    if (file) raus.push({ file, relPfad: pfad });
    return;
  }

  if (entry.isDirectory) {
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    const kinder = await readAllEntries(reader);
    for (const kind of kinder) {
      if (raus.length > MAX_STAND_FILES * 2) return; // Notbremse
      await sammleAusEntry(kind, pfad, raus);
    }
  }
}

/**
 * Entpackt ein ZIP im Browser und liefert die enthaltenen Dateien mit ihrem
 * Pfad aus dem Archiv. Ordner-Eintraege (Laenge 0, Pfad endet auf '/') fallen
 * weg — die Ordnerstruktur steckt ohnehin in den Dateipfaden.
 *
 * Die Pfade laufen anschliessend durch `sanitizeRelPath` (Zip-Slip-Schutz),
 * das passiert zentral in `anwendenFilter`.
 */
async function entpackeZip(file: File): Promise<GewaehlteDatei[]> {
  if (file.size > MAX_ZIP_BYTES) {
    throw new Error(
      `„${file.name}" ist mit ${fmtBytes(file.size)} zu groß zum Entpacken im Browser ` +
        `(Grenze: ${fmtBytes(MAX_ZIP_BYTES)}). Bitte stattdessen den Ordner hochladen.`
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  // Jedes ZIP beginnt mit "PK" — sonst ist es eine umbenannte andere Datei.
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    throw new Error(`„${file.name}" ist keine gültige ZIP-Datei.`);
  }

  const entpackt = await new Promise<Record<string, Uint8Array>>((resolve, reject) => {
    unzip(bytes, (err, data) => (err ? reject(err) : resolve(data)));
  });

  const raus: GewaehlteDatei[] = [];
  for (const [pfad, inhalt] of Object.entries(entpackt)) {
    if (pfad.endsWith('/')) continue; // Ordner-Eintrag
    raus.push({
      file: new File([inhalt as BlobPart], baseName(pfad)),
      relPfad: pfad,
    });
  }
  return raus;
}

export default function UploadDialog({
  projektId,
  projektName,
  onClose,
  onFertig,
}: {
  projektId: string;
  projektName: string;
  onClose: () => void;
  onFertig: () => void;
}) {
  const [dateien, setDateien] = useState<GewaehlteDatei[]>([]);
  const [uebersprungen, setUebersprungen] = useState(0);
  const [ignorieren, setIgnorieren] = useState(true);
  const [notiz, setNotiz] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanText, setScanText] = useState('Ordner wird gelesen …');
  const [laeuft, setLaeuft] = useState(false);
  const [fertigeDateien, setFertigeDateien] = useState(0);
  const [fertigeBytes, setFertigeBytes] = useState(0);
  const [fehler, setFehler] = useState<string | null>(null);
  const [statusText, setStatusText] = useState('');

  const ordnerRef = useRef<HTMLInputElement>(null);
  const zipRef = useRef<HTMLInputElement>(null);
  const abbrechenRef = useRef(false);

  // Rohliste ohne Filter behalten, damit das Haekchen ohne erneutes
  // Einlesen umgeschaltet werden kann.
  const rohRef = useRef<GewaehlteDatei[]>([]);

  const anwendenFilter = useCallback((roh: GewaehlteDatei[], filtern: boolean) => {
    const gesehen = new Set<string>();
    const behalten: GewaehlteDatei[] = [];
    let raus = 0;

    for (const eintrag of roh) {
      const sauber = sanitizeRelPath(eintrag.relPfad);
      if (!sauber) {
        raus++;
        continue;
      }
      if (filtern && shouldIgnorePath(sauber)) {
        raus++;
        continue;
      }
      if (gesehen.has(sauber)) {
        raus++;
        continue;
      }
      gesehen.add(sauber);
      behalten.push({ file: eintrag.file, relPfad: sauber });
    }

    setDateien(behalten);
    setUebersprungen(raus);
  }, []);

  const uebernehmen = useCallback(
    (roh: GewaehlteDatei[]) => {
      rohRef.current = roh;
      anwendenFilter(roh, ignorieren);
    },
    [anwendenFilter, ignorieren]
  );

  /**
   * Nimmt die Rohauswahl entgegen und ersetzt enthaltene ZIP-Archive durch
   * ihren Inhalt. Alles andere wandert unveraendert weiter.
   */
  const verarbeiteAuswahl = useCallback(
    async (roh: GewaehlteDatei[]) => {
      if (!roh.some((d) => isZipFileName(d.file.name))) {
        uebernehmen(roh);
        return;
      }

      setScanText('Archiv wird entpackt …');
      setScanning(true);
      try {
        const raus: GewaehlteDatei[] = [];
        for (const eintrag of roh) {
          if (isZipFileName(eintrag.file.name)) {
            raus.push(...(await entpackeZip(eintrag.file)));
          } else {
            raus.push(eintrag);
          }
        }
        if (raus.length === 0) {
          setFehler('Das Archiv enthält keine Dateien.');
        }
        uebernehmen(raus);
      } catch (err) {
        setFehler(
          err instanceof Error && err.message
            ? err.message
            : 'Das Archiv konnte nicht entpackt werden. Ist es passwortgeschützt?'
        );
      } finally {
        setScanning(false);
        setScanText('Ordner wird gelesen …');
      }
    },
    [uebernehmen]
  );

  function toggleIgnorieren(next: boolean) {
    setIgnorieren(next);
    anwendenFilter(rohRef.current, next);
  }

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragActive(false);
    if (laeuft) return;

    setScanText('Ordner wird gelesen …');
    setScanning(true);
    setFehler(null);
    try {
      const raus: GewaehlteDatei[] = [];
      const entries: FileSystemEntry[] = [];

      // items muss synchron gelesen werden — nach dem ersten await ist die
      // DataTransfer-Liste leer.
      for (const item of Array.from(e.dataTransfer.items)) {
        const entry = item.webkitGetAsEntry?.();
        if (entry) entries.push(entry);
      }

      if (entries.length > 0) {
        for (const entry of entries) await sammleAusEntry(entry, '', raus);
      } else {
        // Browser ohne Verzeichnis-Unterstuetzung: wenigstens die Dateien
        for (const file of Array.from(e.dataTransfer.files)) {
          raus.push({ file, relPfad: file.name });
        }
      }

      if (raus.length === 0) {
        setFehler('Es wurden keine Dateien gefunden. Ziehe einen Ordner oder eine ZIP-Datei hinein.');
      }
      await verarbeiteAuswahl(raus);
    } catch {
      setFehler('Der Ordner konnte nicht gelesen werden. Nutze den Knopf „Ordner wählen".');
    } finally {
      setScanning(false);
    }
  }

  function handleOrdnerWahl(e: React.ChangeEvent<HTMLInputElement>) {
    const liste = e.target.files;
    if (!liste || liste.length === 0) return;
    const raus: GewaehlteDatei[] = Array.from(liste).map((file) => ({
      file,
      relPfad: file.webkitRelativePath || file.name,
    }));
    void verarbeiteAuswahl(raus);
    e.target.value = '';
  }

  function handleZipWahl(e: React.ChangeEvent<HTMLInputElement>) {
    const liste = e.target.files;
    if (!liste || liste.length === 0) return;
    const raus: GewaehlteDatei[] = Array.from(liste).map((file) => ({
      file,
      relPfad: file.name,
    }));
    void verarbeiteAuswahl(raus);
    e.target.value = '';
  }

  const gesamtBytes = dateien.reduce((s, d) => s + d.file.size, 0);

  async function starten() {
    if (dateien.length === 0 || laeuft) return;

    setLaeuft(true);
    setFehler(null);
    setFertigeDateien(0);
    setFertigeBytes(0);
    abbrechenRef.current = false;
    setStatusText('Stand wird angelegt …');

    try {
      // 1) Metadaten anlegen
      const anlegen = await fetch(`/api/admin/projektablage/${projektId}/staende`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notiz,
          dateien: dateien.map((d) => ({ relPfad: d.relPfad, groesse: d.file.size })),
        }),
      });
      const angelegt = await anlegen.json().catch(() => ({}));
      if (!anlegen.ok) {
        setFehler(angelegt.error ?? `Stand konnte nicht angelegt werden (HTTP ${anlegen.status}).`);
        setLaeuft(false);
        return;
      }

      const standId: string = angelegt.stand.id;
      const serverDateien: { id: string; relPfad: string }[] = angelegt.dateien ?? [];

      // Zuordnung Server-Zeile -> lokale Datei ueber den relativen Pfad
      const byPfad = new Map(dateien.map((d) => [d.relPfad, d.file]));
      const supabase = storageClient();
      const fehlgeschlagen: string[] = [];

      // 2) In Haeppchen: Upload-Adressen holen, dann parallel hochladen
      for (let i = 0; i < serverDateien.length; i += UPLOAD_URL_BATCH) {
        if (abbrechenRef.current) break;

        const batch = serverDateien.slice(i, i + UPLOAD_URL_BATCH);
        setStatusText(`Lade hoch … (${i + 1}–${Math.min(i + batch.length, serverDateien.length)} von ${serverDateien.length})`);

        const urlRes = await fetch(
          `/api/admin/projektablage/staende/${standId}/upload-urls`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dateiIds: batch.map((d) => d.id) }),
          }
        );
        const urlJson = await urlRes.json().catch(() => ({}));
        if (!urlRes.ok) {
          setFehler(urlJson.error ?? 'Upload-Adressen konnten nicht erzeugt werden.');
          break;
        }

        const urls: UploadUrl[] = urlJson.urls ?? [];
        let next = 0;

        async function arbeiter() {
          for (;;) {
            if (abbrechenRef.current) return;
            const index = next++;
            if (index >= urls.length) return;

            const eintrag = urls[index];
            const file = byPfad.get(eintrag.relPfad);
            if (!file) {
              fehlgeschlagen.push(eintrag.relPfad);
              continue;
            }

            const { error } = await supabase.storage
              .from(urlJson.bucket)
              .uploadToSignedUrl(eintrag.storagePfad, eintrag.token, file, {
                contentType: file.type || 'application/octet-stream',
                upsert: true,
              });

            if (error) {
              fehlgeschlagen.push(eintrag.relPfad);
            } else {
              setFertigeBytes((b) => b + file.size);
            }
            setFertigeDateien((n) => n + 1);
          }
        }

        await Promise.all(Array.from({ length: Math.min(PARALLEL, urls.length) }, arbeiter));
      }

      if (abbrechenRef.current) {
        setStatusText('Abgebrochen. Der unvollständige Stand kann in der Liste aufgeräumt werden.');
        setLaeuft(false);
        onFertig();
        return;
      }

      // 3) Abschliessen — der Server prüft selbst, was wirklich angekommen ist
      setStatusText('Wird abgeschlossen …');
      const fin = await fetch(`/api/admin/projektablage/staende/${standId}/finalize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const finJson = await fin.json().catch(() => ({}));
      if (!fin.ok) {
        setFehler(finJson.error ?? 'Der Stand konnte nicht abgeschlossen werden.');
        setLaeuft(false);
        return;
      }

      const fehlend: string[] = finJson.fehlend ?? [];
      if (fehlend.length > 0) {
        setFehler(
          `${fehlend.length} Datei(en) sind nicht angekommen und fehlen im Stand: ` +
            fehlend.slice(0, 5).join(', ') +
            (fehlend.length > 5 ? ' …' : '')
        );
        setLaeuft(false);
        onFertig();
        return;
      }

      onFertig();
      onClose();
    } catch {
      setFehler('Verbindung unterbrochen. Bitte erneut versuchen.');
      setLaeuft(false);
    }
  }

  const prozent = dateien.length > 0 ? Math.round((fertigeDateien / dateien.length) * 100) : 0;

  return (
    <Modal
      open
      onClose={laeuft ? () => undefined : onClose}
      title={`Neuen Stand hochladen — ${projektName}`}
      maxWidth={640}
      closeOnBackdrop={!laeuft}
      footer={
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          {laeuft ? (
            <Button variant="secondary" onClick={() => { abbrechenRef.current = true; }}>
              Abbrechen
            </Button>
          ) : (
            <>
              <Button variant="secondary" onClick={onClose}>Schließen</Button>
              <Button onClick={starten} disabled={dateien.length === 0 || scanning}>
                {dateien.length > 0 ? `${dateien.length} Dateien hochladen` : 'Hochladen'}
              </Button>
            </>
          )}
        </div>
      }
    >
      {!laeuft && (
        <>
          <div
            onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
            style={{
              border: `2px dashed ${dragActive ? 'var(--admin-accent)' : 'var(--admin-border)'}`,
              background: dragActive ? 'var(--admin-accent-soft)' : 'var(--admin-surface-2)',
              borderRadius: 12,
              padding: '28px 16px',
              textAlign: 'center',
              transition: 'all .15s',
            }}
          >
            <div style={{ fontSize: 32, marginBottom: 8 }}>📁</div>
            <p style={{ margin: '0 0 4px', fontWeight: 600, color: 'var(--admin-text)' }}>
              {scanning ? scanText : 'Projektordner oder ZIP-Datei hierher ziehen'}
            </p>
            <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--admin-text-dim)' }}>
              Die Ordnerstruktur bleibt erhalten. ZIP-Archive werden automatisch entpackt.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => ordnerRef.current?.click()}
                disabled={scanning}
              >
                Ordner wählen
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => zipRef.current?.click()}
                disabled={scanning}
              >
                ZIP wählen
              </Button>
            </div>
            <input
              ref={ordnerRef}
              type="file"
              multiple
              onChange={handleOrdnerWahl}
              style={{ display: 'none' }}
              {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
            />
            <input
              ref={zipRef}
              type="file"
              multiple
              accept=".zip,application/zip,application/x-zip-compressed"
              onChange={handleZipWahl}
              style={{ display: 'none' }}
            />
          </div>

          <label
            style={{
              display: 'flex', alignItems: 'flex-start', gap: 8,
              margin: '14px 0 4px', fontSize: 13, color: 'var(--admin-text-2)', cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={ignorieren}
              onChange={(e) => toggleIgnorieren(e.target.checked)}
              style={{ marginTop: 2 }}
            />
            <span>
              Abhängigkeiten und Build-Ordner überspringen
              <span style={{ display: 'block', color: 'var(--admin-text-dim)', fontSize: 12 }}>
                node_modules, .git, __pycache__, dist, vendor, Logs …
              </span>
            </span>
          </label>

          {dateien.length > 0 && (
            <div
              style={{
                margin: '12px 0', padding: '10px 12px', borderRadius: 10,
                background: 'var(--admin-surface-2)', border: '1px solid var(--admin-border)',
                fontSize: 13, color: 'var(--admin-text-2)',
              }}
            >
              <strong style={{ color: 'var(--admin-text)' }}>
                {dateien.length} Dateien · {fmtBytes(gesamtBytes)}
              </strong>
              {uebersprungen > 0 && (
                <span style={{ color: 'var(--admin-text-dim)' }}> · {uebersprungen} übersprungen</span>
              )}
            </div>
          )}

          <div style={{ marginTop: 12 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4, color: 'var(--admin-text-2)' }}>
              Notiz zu diesem Stand (optional)
            </label>
            <textarea
              value={notiz}
              onChange={(e) => setNotiz(e.target.value)}
              rows={2}
              placeholder="Was ist neu?"
              style={{
                width: '100%', padding: '8px 10px', borderRadius: 8, fontSize: 14,
                background: 'var(--admin-input-bg)', color: 'var(--admin-text)',
                border: '1px solid var(--admin-input-border)', resize: 'vertical',
              }}
            />
          </div>
        </>
      )}

      {laeuft && (
        <div style={{ padding: '8px 0' }}>
          <p style={{ margin: '0 0 10px', color: 'var(--admin-text)' }}>{statusText}</p>
          <div style={{ height: 10, borderRadius: 6, background: 'var(--admin-surface-2)', overflow: 'hidden' }}>
            <div
              style={{
                width: `${prozent}%`, height: '100%', background: 'var(--admin-accent)',
                transition: 'width .2s',
              }}
            />
          </div>
          <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--admin-text-dim)' }}>
            {fertigeDateien} von {dateien.length} Dateien · {fmtBytes(fertigeBytes)} von {fmtBytes(gesamtBytes)}
          </p>
          <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--admin-text-dim)' }}>
            Dieses Fenster bitte offen lassen, bis der Upload durch ist.
          </p>
        </div>
      )}

      {fehler && (
        <p
          style={{
            marginTop: 12, padding: '8px 10px', borderRadius: 8, fontSize: 13,
            background: 'rgba(220,38,38,0.12)', color: 'var(--admin-danger)',
          }}
        >
          {fehler}
        </p>
      )}
    </Modal>
  );
}
