/**
 * Projektablage — Streaming-ZIP.
 *
 * Baut das Archiv Datei fuer Datei auf und schiebt die fertigen Bloecke sofort
 * zum Browser weiter. Dadurch bleibt der Speicherbedarf bei einer Datei
 * gleichzeitig, egal ob der Stand 5 MB oder 5 GB gross ist — ein Ansatz, der
 * erst alles einsammelt, wuerde den Container umbringen.
 *
 * `fflate` ist die einzige neue Abhaengigkeit dafuer: ~800 KB auf der Platte,
 * keine eigenen Sub-Abhaengigkeiten.
 */

import { Zip, ZipDeflate, ZipPassThrough } from 'fflate';

export interface ZipEintrag {
  /** Pfad im Archiv, z.B. 'src/lib/foo.php'. Bereits saniert. */
  relPfad: string;
  /** Signed URL zum Herunterladen aus dem Storage. */
  url: string;
}

/**
 * Endungen, bei denen Komprimieren nur CPU kostet: die Daten sind bereits
 * komprimiert. Alles andere (Code, Text, JSON) profitiert deutlich.
 */
const BEREITS_KOMPRIMIERT = [
  '.zip', '.gz', '.tgz', '.bz2', '.xz', '.7z', '.rar',
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.heic', '.avif',
  '.mp3', '.mp4', '.mov', '.webm', '.avi', '.mkv', '.m4a', '.ogg', '.flac',
  '.pdf', '.woff', '.woff2',
];

function istKomprimiert(pfad: string): boolean {
  const lower = pfad.toLowerCase();
  return BEREITS_KOMPRIMIERT.some((ext) => lower.endsWith(ext));
}

/** Wartet, bis der Verbraucher wieder aufnahmebereit ist (Rueckstau). */
async function warteAufAbfluss(controller: ReadableStreamDefaultController<Uint8Array>) {
  let runden = 0;
  while ((controller.desiredSize ?? 1) <= 0) {
    await new Promise((resolve) => setTimeout(resolve, 15));
    // Notbremse: wenn der Browser ~30 s nichts abholt, weiterschreiben statt
    // ewig zu haengen. Der Stream bricht dann notfalls mit einem Fehler ab.
    if (++runden > 2000) break;
  }
}

/**
 * Erzeugt den ZIP-Stream. Fehlerhafte Einzeldateien werden uebersprungen und
 * am Ende als `_FEHLENDE-DATEIEN.txt` ins Archiv gelegt — ein kaputter Link
 * soll nicht den kompletten Download zerstoeren.
 */
export function createZipStream(eintraege: ZipEintrag[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      let geschlossen = false;

      const zip = new Zip((err, chunk, final) => {
        if (geschlossen) return;
        if (err) {
          geschlossen = true;
          controller.error(err);
          return;
        }
        if (chunk && chunk.length > 0) {
          controller.enqueue(chunk);
        }
        if (final) {
          geschlossen = true;
          controller.close();
        }
      });

      // Bewusst NICHT awaiten: `start` soll sofort zurueckkehren, damit die
      // Antwort losgeht und nicht erst nach der letzten Datei.
      void (async () => {
        const fehler: string[] = [];

        try {
          for (const eintrag of eintraege) {
            if (geschlossen) return;

            let response: Response;
            try {
              response = await fetch(eintrag.url);
            } catch {
              fehler.push(eintrag.relPfad);
              continue;
            }
            if (!response.ok || !response.body) {
              fehler.push(eintrag.relPfad);
              continue;
            }

            const datei = istKomprimiert(eintrag.relPfad)
              ? new ZipPassThrough(eintrag.relPfad)
              : new ZipDeflate(eintrag.relPfad, { level: 6 });
            zip.add(datei);

            const reader = response.body.getReader();
            try {
              for (;;) {
                const { done, value } = await reader.read();
                if (done) break;
                if (value && value.length > 0) {
                  datei.push(value, false);
                  await warteAufAbfluss(controller);
                }
                if (geschlossen) return;
              }
              datei.push(new Uint8Array(0), true);
            } finally {
              reader.releaseLock();
            }
          }

          if (fehler.length > 0) {
            const hinweis = new ZipPassThrough('_FEHLENDE-DATEIEN.txt');
            zip.add(hinweis);
            const text =
              'Diese Dateien konnten nicht aus dem Speicher gelesen werden ' +
              'und fehlen im Archiv:\r\n\r\n' +
              fehler.join('\r\n') +
              '\r\n';
            hinweis.push(new TextEncoder().encode(text), true);
          }

          zip.end();
        } catch (err) {
          if (!geschlossen) {
            geschlossen = true;
            controller.error(err);
          }
        }
      })();
    },

    cancel() {
      // Browser hat abgebrochen — die Schleife oben bricht ueber `geschlossen`
      // nicht ab, aber der naechste enqueue-Versuch laeuft ins Leere.
    },
  });
}

/** Macht einen Dateinamen fuer den Content-Disposition-Header unschaedlich. */
export function safeZipFilename(name: string): string {
  const bereinigt = name
    .replace(/[/\\:*?"<>|\r\n]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  return bereinigt || 'projektstand';
}
