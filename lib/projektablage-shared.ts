/**
 * Projektablage — reine Hilfsfunktionen ohne Server-Abhaengigkeiten.
 *
 * BEWUSST getrennt von `lib/projektablage.ts`: diese Datei wird auch vom
 * Browser importiert (Upload-Seite). `lib/projektablage.ts` zieht ueber
 * `getCurrentAdminUser()` `next/headers` herein und darf deshalb NIE im
 * Client landen.
 */

export const PROJEKTABLAGE_BUCKET = 'projekt-ablage';

/** 1 GB pro Einzeldatei. */
export const MAX_FILE_BYTES = 1024 * 1024 * 1024;
/** 5 GB pro Stand (Summe aller Dateien eines Uploads). */
export const MAX_STAND_BYTES = 5 * 1024 * 1024 * 1024;
/** Obergrenze fuer die Dateianzahl eines Standes. */
export const MAX_STAND_FILES = 5000;
/** Maximale Laenge eines relativen Pfads. */
export const MAX_PATH_LENGTH = 400;
/** Maximale Ordnertiefe. */
export const MAX_PATH_DEPTH = 40;
/** Wie viele Upload-URLs pro Anfrage ausgegeben werden. */
export const UPLOAD_URL_BATCH = 100;

/**
 * Groesste ZIP-Datei, die der Browser beim Upload entpacken darf.
 *
 * Das Entpacken laeuft bewusst im Browser (nicht auf dem Server), damit die
 * bestehende Direkt-Upload-Pipeline unveraendert greift und kein Archiv durch
 * den RAM des Node-Prozesses wandert. Der Preis: das entpackte Archiv liegt
 * kurz komplett im Browser-Speicher. 300 MB ist die Grenze, ab der ein Tab
 * auf schwaecheren Geraeten kippen kann — darueber ist der Ordner-Upload
 * (Datei fuer Datei, kein Zwischenspeicher) der richtige Weg.
 */
export const MAX_ZIP_BYTES = 300 * 1024 * 1024;

/** Heisst diese Datei nach einem ZIP-Archiv? */
export function isZipFileName(name: string): boolean {
  return typeof name === 'string' && name.toLowerCase().endsWith('.zip');
}

/**
 * Ordner/Dateien, die beim Ordner-Upload standardmaessig uebersprungen werden.
 * Ohne diese Liste landen bei einem Node- oder Python-Projekt zehntausende
 * Dateien in der Ablage, die beim naechsten `npm install` ohnehin neu entstehen.
 *
 * Verzeichnisnamen matchen auf JEDES Pfadsegment, Endungen auf den Dateinamen.
 */
export const IGNORE_DIRS = [
  'node_modules',
  '.git',
  '.svn',
  '.hg',
  '.next',
  '.nuxt',
  '.turbo',
  '.cache',
  '.parcel-cache',
  '.pytest_cache',
  '.mypy_cache',
  '__pycache__',
  '.venv',
  'venv',
  'env',
  'dist',
  'build',
  'out',
  'target',
  'vendor',
  'coverage',
  '.idea',
  '.vscode',
  '.gradle',
  'Pods',
];

export const IGNORE_FILES = ['.DS_Store', 'Thumbs.db', 'desktop.ini', '.env.local'];

export const IGNORE_EXTENSIONS = ['.log', '.pyc', '.pyo', '.class', '.o', '.obj'];

/**
 * Soll dieser relative Pfad beim Ordner-Upload uebersprungen werden?
 * Erwartet einen bereits normalisierten Pfad mit '/' als Trenner.
 */
export function shouldIgnorePath(relPath: string): boolean {
  const parts = relPath.split('/');
  const fileName = parts[parts.length - 1] ?? '';

  // Verzeichnisnamen: alle Segmente ausser dem Dateinamen pruefen
  for (let i = 0; i < parts.length - 1; i++) {
    if (IGNORE_DIRS.includes(parts[i])) return true;
  }
  if (IGNORE_FILES.includes(fileName)) return true;

  const lower = fileName.toLowerCase();
  return IGNORE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/**
 * Saeubert einen vom Browser gelieferten relativen Pfad.
 *
 * Der Rueckgabewert landet ausschliesslich in der DB-Spalte `rel_pfad` und
 * spaeter als Eintragsname im ZIP — NIE in einem Storage- oder
 * Dateisystempfad (dort steht eine UUID). Der Sanitizer ist trotzdem streng,
 * damit ein praeparierter Pfad beim Entpacken des ZIPs auf dem Rechner des
 * Nutzers nicht ausbrechen kann ("Zip Slip").
 *
 * Gibt `null` zurueck, wenn nichts Brauchbares uebrig bleibt.
 */
export function sanitizeRelPath(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;

  const normalized = raw
    .replace(/\\/g, '/')
    // NUL + Steuerzeichen entfernen (kein Regex-Range-Escape noetig)
    .split('')
    .filter((ch) => {
      const code = ch.charCodeAt(0);
      return code > 31 && code !== 127;
    })
    .join('');

  const parts = normalized
    .split('/')
    .map((p) => p.trim())
    // '.' und '..' fliegen raus, ebenso leere Segmente (// oder fuehrender /)
    .filter((p) => p !== '' && p !== '.' && p !== '..')
    // Windows-Laufwerksbuchstaben ('C:') am Anfang sind kein sinnvoller Teil
    // eines relativen Pfads
    .filter((p) => !/^[a-zA-Z]:$/.test(p));

  if (parts.length === 0) return null;
  if (parts.length > MAX_PATH_DEPTH) return null;

  const out = parts.join('/');
  if (out.length > MAX_PATH_LENGTH) return null;

  return out;
}

/** Dateiname aus einem relativen Pfad. */
export function baseName(relPath: string): string {
  const parts = relPath.split('/');
  return parts[parts.length - 1] || relPath;
}

/** Bytes menschenlesbar — bewusst mit deutschem Dezimalkomma. */
export function fmtBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  const rounded = value >= 100 ? value.toFixed(0) : value.toFixed(1);
  return `${rounded.replace('.', ',')} ${units[unitIndex]}`;
}

/**
 * Prueft, ob ein (komplett empfangenes) ZIP sauber abgeschlossen ist.
 *
 * Jedes ZIP endet mit dem „End of Central Directory"-Eintrag (Signatur
 * `50 4b 05 06`), der unter anderem die Anzahl der enthaltenen Eintraege
 * traegt. Fehlt er, wurde die Uebertragung mittendrin abgebrochen — das
 * Archiv laesst sich dann nicht oeffnen. Hinter dem Eintrag darf noch ein
 * Kommentar von bis zu 65535 Bytes stehen, deshalb wird der Schwanz der
 * Datei rueckwaerts durchsucht.
 *
 * Liefert die Eintragszahl, oder `null`, wenn kein Abschluss zu finden ist.
 * Reine Funktion — laeuft im Browser wie im Test.
 */
export function zipAbschlussPruefen(bytes: Uint8Array): { eintraege: number } | null {
  const MIN = 22; // feste Laenge des EOCD ohne Kommentar
  if (bytes.length < MIN) return null;
  const start = Math.max(0, bytes.length - MIN - 65535);
  for (let i = bytes.length - MIN; i >= start; i--) {
    if (bytes[i] === 0x50 && bytes[i + 1] === 0x4b && bytes[i + 2] === 0x05 && bytes[i + 3] === 0x06) {
      const kommentarLaenge = bytes[i + 20] | (bytes[i + 21] << 8);
      // Der Kommentar muss exakt bis zum Dateiende reichen, sonst ist das
      // nur ein zufaelliges Byte-Muster mitten in den Daten.
      if (i + MIN + kommentarLaenge !== bytes.length) continue;
      const eintraege = bytes[i + 10] | (bytes[i + 11] << 8);
      return { eintraege };
    }
  }
  return null;
}

/**
 * Wie `zipAbschlussPruefen`, aber fuer die Stueckliste eines Streaming-
 * Downloads: es wird nur der Schwanz zusammengefuegt, nicht die ganze Datei.
 */
export function zipAbschlussAusTeilen(teile: Uint8Array[]): { eintraege: number } | null {
  const BEDARF = 22 + 65535;
  const schwanz: Uint8Array[] = [];
  let summe = 0;
  for (let i = teile.length - 1; i >= 0 && summe < BEDARF; i--) {
    schwanz.unshift(teile[i]);
    summe += teile[i].length;
  }
  const buf = new Uint8Array(summe);
  let pos = 0;
  for (const t of schwanz) {
    buf.set(t, pos);
    pos += t.length;
  }
  return zipAbschlussPruefen(buf);
}
