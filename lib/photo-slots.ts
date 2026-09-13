/**
 * Pflicht-Fotos bei Übergabe (Abholung) und Verpackungskontrolle (Versand).
 *
 * Regel (fachlich vorgegeben):
 *   1× Gesamtfoto von allem, was rausgeht
 *   + pro Kamera je ein Foto von VORNE und von der RÜCKSEITE
 *
 * Bei N Kameras sind das also `1 + 2 * N` Pflicht-Fotos. Zusätzliche Fotos
 * ("ggf. mehr") sind optional und werden als `extra` angehängt.
 *
 * Diese Datei ist bewusst PURE (keine DB, kein React) — sie ist damit sowohl
 * im Browser (Wizard-UI) als auch serverseitig (autoritative Pflichtprüfung)
 * nutzbar und isoliert unit-testbar. **Maßgeblich ist immer die Server-Seite:**
 * die Routen bauen die Slots aus `resolveBookingCameras(booking)` neu auf und
 * vertrauen NICHT der vom Client gemeldeten Slot-Liste.
 */

export type PhotoSlotKind = 'overview' | 'camera_front' | 'camera_back' | 'extra';

export interface PhotoSlotCamera {
  product_name?: string | null;
  serial_number?: string | null;
  unit_id?: string | null;
}

export interface PhotoSlot {
  /** Stabiler Schlüssel — auch der Form-Feld-Name (`photo_<key>`). */
  key: string;
  kind: PhotoSlotKind;
  /** Index in der Kamera-Liste der Buchung (null beim Gesamtfoto). */
  cameraIndex: number | null;
  /** Anzeigename der Kamera (null beim Gesamtfoto). */
  cameraLabel: string | null;
  /** Seriennummer, falls aufgelöst — nur zur Anzeige. */
  serial: string | null;
  /** Zugewiesene physische Einheit (product_units.id), falls vorhanden. */
  unitId: string | null;
  /** Überschrift im UI + im gespeicherten Datensatz. */
  title: string;
  /** Kurzer Hinweis, was fotografiert werden soll. */
  hint: string;
}

/** Schutzgrenze gegen absurde Kamera-Zahlen (Daten-/Eingabefehler). */
export const MAX_PHOTO_CAMERAS = 20;
/** Wie viele freiwillige Zusatzfotos höchstens angehängt werden dürfen. */
export const MAX_EXTRA_PHOTOS = 10;

export const OVERVIEW_SLOT_KEY = 'overview';

function cameraSlotKeys(index: number): { front: string; back: string } {
  return { front: `cam${index}_front`, back: `cam${index}_back` };
}

/**
 * Baut die Liste der PFLICHT-Fotos für eine Buchung.
 *
 * Ohne auflösbare Kamera (defensiv: kaputte/leere Daten) bleibt nur das
 * Gesamtfoto übrig — die Übergabe soll nie an einer Datenlücke scheitern.
 */
export function buildPhotoSlots(cameras: PhotoSlotCamera[] | null | undefined): PhotoSlot[] {
  const list = (Array.isArray(cameras) ? cameras : []).slice(0, MAX_PHOTO_CAMERAS);

  const slots: PhotoSlot[] = [
    {
      key: OVERVIEW_SLOT_KEY,
      kind: 'overview',
      cameraIndex: null,
      cameraLabel: null,
      serial: null,
      unitId: null,
      title: 'Gesamtfoto',
      hint: 'Alles zusammen im Bild: Kamera(s) + komplettes Zubehör.',
    },
  ];

  list.forEach((cam, i) => {
    const rawName = typeof cam?.product_name === 'string' ? cam.product_name.trim() : '';
    const label = rawName || `Kamera ${i + 1}`;
    const serial =
      typeof cam?.serial_number === 'string' && cam.serial_number.trim() !== ''
        ? cam.serial_number.trim()
        : null;
    const unitId =
      typeof cam?.unit_id === 'string' && cam.unit_id.trim() !== '' ? cam.unit_id.trim() : null;
    const keys = cameraSlotKeys(i);
    const suffix = list.length > 1 ? ` (${i + 1}/${list.length})` : '';

    slots.push({
      key: keys.front,
      kind: 'camera_front',
      cameraIndex: i,
      cameraLabel: label,
      serial,
      unitId,
      title: `${label}${suffix} — Vorderseite`,
      hint: 'Objektiv-Seite, Zustand erkennbar.',
    });
    slots.push({
      key: keys.back,
      kind: 'camera_back',
      cameraIndex: i,
      cameraLabel: label,
      serial,
      unitId,
      title: `${label}${suffix} — Rückseite`,
      hint: 'Display-/Rückseite, Zustand erkennbar.',
    });
  });

  return slots;
}

/** Form-Feld-Name für ein Pflicht-Foto. */
export function photoFieldName(slotKey: string): string {
  return `photo_${slotKey}`;
}

/** Form-Feld-Name für ein freiwilliges Zusatzfoto. */
export function extraPhotoFieldName(index: number): string {
  return `photo_extra_${index}`;
}

// ─── Gespeicherter Datensatz ────────────────────────────────────────────────

export interface StoredPhoto {
  /** Storage-Pfad im jeweiligen Bucket (KEINE Signed URL). */
  path: string;
  kind: PhotoSlotKind;
  /** Überschrift zum Zeitpunkt der Aufnahme (eingefroren). */
  title: string;
  cameraIndex?: number;
  cameraLabel?: string;
  unitId?: string;
}

/** Baut den zu speichernden Datensatz aus Slot + Storage-Pfad. */
export function storedPhotoFromSlot(slot: PhotoSlot, path: string): StoredPhoto {
  const entry: StoredPhoto = { path, kind: slot.kind, title: slot.title };
  if (slot.cameraIndex !== null) entry.cameraIndex = slot.cameraIndex;
  if (slot.cameraLabel) entry.cameraLabel = slot.cameraLabel;
  if (slot.unitId) entry.unitId = slot.unitId;
  return entry;
}

/**
 * Liest eine gespeicherte Foto-Liste defensiv ein (Altbestand, JSONB-Rohwert,
 * String aus einer JSONB-Spalte). Liefert immer ein Array.
 */
export function parseStoredPhotos(raw: unknown): StoredPhoto[] {
  let value = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) return [];
  const out: StoredPhoto[] = [];
  for (const item of value.slice(0, MAX_PHOTO_CAMERAS * 2 + 1 + MAX_EXTRA_PHOTOS)) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const path = typeof o.path === 'string' ? o.path.trim() : '';
    if (!path) continue;
    const kind: PhotoSlotKind =
      o.kind === 'overview' || o.kind === 'camera_front' || o.kind === 'camera_back' || o.kind === 'extra'
        ? o.kind
        : 'extra';
    const entry: StoredPhoto = {
      path,
      kind,
      title: typeof o.title === 'string' && o.title.trim() !== '' ? o.title.trim().slice(0, 200) : 'Foto',
    };
    if (typeof o.cameraIndex === 'number' && Number.isInteger(o.cameraIndex) && o.cameraIndex >= 0) {
      entry.cameraIndex = o.cameraIndex;
    }
    if (typeof o.cameraLabel === 'string' && o.cameraLabel.trim() !== '') {
      entry.cameraLabel = o.cameraLabel.trim().slice(0, 200);
    }
    if (typeof o.unitId === 'string' && o.unitId.trim() !== '') entry.unitId = o.unitId.trim().slice(0, 100);
    out.push(entry);
  }
  return out;
}

/**
 * Findet das Gesamtfoto in einer gespeicherten Liste — es bleibt aus
 * Rückwärtskompatibilität der "eine" Pfad in `bookings.pack_photo_url` bzw.
 * `handover_data.photoPath`.
 */
export function overviewPhotoPath(photos: StoredPhoto[]): string | null {
  return photos.find((p) => p.kind === 'overview')?.path ?? photos[0]?.path ?? null;
}

/**
 * Beschreibt fehlende Pflicht-Fotos für eine Fehlermeldung.
 * Leeres Array = alles vollständig.
 */
export function missingPhotoTitles(
  slots: PhotoSlot[],
  hasFile: (slotKey: string) => boolean,
): string[] {
  return slots.filter((s) => !hasFile(s.key)).map((s) => s.title);
}

/**
 * Sammelt ALLE Storage-Pfade eines Foto-Satzes (Liste + Legacy-Einzelfeld),
 * dedupliziert. Für das Aufräumen beim Zurücksetzen/Löschen — sonst bleiben
 * die Kamera-Fotos als verwaiste Objekte im Bucket liegen, wenn nur das
 * Gesamtfoto entfernt wird.
 */
export function collectPhotoPaths(legacyPath: unknown, photosRaw: unknown): string[] {
  const paths = new Set<string>();
  if (typeof legacyPath === 'string' && legacyPath.trim() !== '') paths.add(legacyPath.trim());
  for (const p of parseStoredPhotos(photosRaw)) paths.add(p.path);
  return [...paths];
}
