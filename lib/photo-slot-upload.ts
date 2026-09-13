import { detectImageType, isAllowedImage } from '@/lib/file-type-check';
import {
  MAX_EXTRA_PHOTOS,
  OVERVIEW_SLOT_KEY,
  extraPhotoFieldName,
  photoFieldName,
  storedPhotoFromSlot,
  type PhotoSlot,
  type StoredPhoto,
} from '@/lib/photo-slots';

/**
 * Server-seitiger Upload der Pflicht-Fotos (Übergabe + Verpackungskontrolle).
 *
 * **Autoritativ:** die Slot-Liste kommt vom Aufrufer aus `buildPhotoSlots()`
 * über die DB-Kameras — NICHT aus dem Request. Ein manipulierter Client kann
 * die Pflichtfotos also nicht wegdefinieren.
 *
 * Bei einem Fehler mitten in der Schleife werden die bereits hochgeladenen
 * Dateien wieder entfernt, damit keine verwaisten Storage-Objekte liegen
 * bleiben (Upload ist NICHT transaktional).
 */

export const MAX_PHOTO_SIZE = 10 * 1024 * 1024; // 10 MB

export interface UploadPhotoSlotsArgs {
  bucket: string;
  /** Präfix im Bucket — hier immer die Buchungsnummer. */
  bookingId: string;
  formData: FormData;
  slots: PhotoSlot[];
  /**
   * Bucket bei "not found" einmalig anlegen (privat). Nur dort einschalten,
   * wo das bisher schon so lief (Übergabe) — der Versand-Bucket existiert.
   */
  createBucketIfMissing?: boolean;
}

export type UploadPhotoSlotsResult =
  | { ok: true; photos: StoredPhoto[] }
  | { ok: false; status: number; error: string };

function extFor(type: ReturnType<typeof detectImageType>): { ext: string; mime: string } {
  switch (type) {
    case 'jpeg': return { ext: 'jpg', mime: 'image/jpeg' };
    case 'png': return { ext: 'png', mime: 'image/png' };
    case 'webp': return { ext: 'webp', mime: 'image/webp' };
    case 'heic':
    case 'heif': return { ext: 'heic', mime: 'image/heic' };
    default: return { ext: 'bin', mime: 'application/octet-stream' };
  }
}

/** Holt eine Datei aus dem FormData, wenn sie wirklich eine nicht-leere Datei ist. */
function fileFrom(formData: FormData, field: string): File | null {
  const v = formData.get(field);
  return v instanceof File && v.size > 0 ? v : null;
}

export async function uploadPhotoSlots(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  { bucket, bookingId, formData, slots, createBucketIfMissing = false }: UploadPhotoSlotsArgs,
): Promise<UploadPhotoSlotsResult> {
  // 1) Dateien einsammeln + Vollständigkeit prüfen (vor dem ersten Upload,
  //    damit bei fehlenden Fotos gar nichts in den Storage wandert).
  const picked: { slot: PhotoSlot; file: File }[] = [];
  const missing: string[] = [];

  for (const slot of slots) {
    let file = fileFrom(formData, photoFieldName(slot.key));
    // Rückwärtskompatibel: ein alter Client schickt nur `photo` (= Gesamtfoto).
    if (!file && slot.key === OVERVIEW_SLOT_KEY) file = fileFrom(formData, 'photo');
    if (!file) { missing.push(slot.title); continue; }
    picked.push({ slot, file });
  }

  if (missing.length > 0) {
    return {
      ok: false,
      status: 400,
      error: `Es fehlen Pflicht-Fotos: ${missing.join(', ')}.`,
    };
  }

  // 2) Freiwillige Zusatzfotos anhängen.
  const extras: File[] = [];
  for (let i = 0; i < MAX_EXTRA_PHOTOS; i++) {
    const f = fileFrom(formData, extraPhotoFieldName(i));
    if (f) extras.push(f);
  }

  // 3) Alles prüfen + hochladen.
  const uploaded: string[] = [];
  const photos: StoredPhoto[] = [];
  let bucketEnsured = false;

  const cleanup = async () => {
    if (uploaded.length === 0) return;
    try {
      await supabase.storage.from(bucket).remove(uploaded);
    } catch {
      // best-effort — ein verwaister Upload ist besser als ein Abbruch hier
    }
  };

  const uploadOne = async (
    file: File,
    label: string,
    slotKey: string,
  ): Promise<{ ok: true; path: string } | { ok: false; status: number; error: string }> => {
    if (file.size > MAX_PHOTO_SIZE) {
      return { ok: false, status: 400, error: `Foto "${label}" ist zu groß (max 10 MB).` };
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    if (!isAllowedImage(buffer)) {
      return {
        ok: false,
        status: 400,
        error: `Foto "${label}": Format nicht unterstützt (JPEG/PNG/WebP/HEIC erlaubt).`,
      };
    }
    const { ext, mime } = extFor(detectImageType(buffer));
    // Zeitstempel + Slot im Pfad → stabil sortierbar, kollisionsfrei bei
    // mehreren Fotos in derselben Millisekunde.
    const path = `${bookingId}/${Date.now()}-${slotKey}.${ext}`;

    const doUpload = () =>
      supabase.storage.from(bucket).upload(path, buffer, { contentType: mime, upsert: true });

    let { error } = await doUpload();

    if (
      error &&
      createBucketIfMissing &&
      !bucketEnsured &&
      /bucket not found|not found/i.test(error.message || '')
    ) {
      bucketEnsured = true;
      const { error: createErr } = await supabase.storage.createBucket(bucket, {
        public: false,
        fileSizeLimit: MAX_PHOTO_SIZE,
        allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'],
      });
      // "already exists" = Race mit einem parallelen Request → trotzdem retry
      if (createErr && !/already exists|exists/i.test(createErr.message || '')) {
        return {
          ok: false,
          status: 500,
          error: `Foto-Upload fehlgeschlagen: Bucket konnte nicht angelegt werden (${createErr.message}).`,
        };
      }
      ({ error } = await doUpload());
    }

    if (error) {
      console.error(`[photo-upload] ${bucket} upload error:`, error);
      return { ok: false, status: 500, error: `Foto-Upload fehlgeschlagen: ${error.message}` };
    }
    return { ok: true, path };
  };

  for (const { slot, file } of picked) {
    const res = await uploadOne(file, slot.title, slot.key);
    if (!res.ok) { await cleanup(); return res; }
    uploaded.push(res.path);
    photos.push(storedPhotoFromSlot(slot, res.path));
  }

  for (let i = 0; i < extras.length; i++) {
    const res = await uploadOne(extras[i], `Zusatzfoto ${i + 1}`, `extra${i}`);
    if (!res.ok) { await cleanup(); return res; }
    uploaded.push(res.path);
    photos.push({ path: res.path, kind: 'extra', title: `Weiteres Foto ${i + 1}` });
  }

  return { ok: true, photos };
}


/**
 * Liest `bookings.pack_photos` defensiv nach — die Migration
 * `supabase-pack-photos.sql` steht ggf. noch aus, dann liefert die Funktion
 * `null` und der Aufrufer faellt auf `pack_photo_url` (Gesamtfoto) zurueck.
 * Bewusst als eigener Lookup, damit die bestehenden (expliziten) Selects der
 * Aufrufer unveraendert bleiben koennen.
 */
export async function loadPackPhotosRaw(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  bookingId: unknown,
): Promise<unknown> {
  if (typeof bookingId !== 'string' || bookingId.trim() === '') return null;
  try {
    const { data, error } = await supabase
      .from('bookings')
      .select('pack_photos')
      .eq('id', bookingId)
      .maybeSingle();
    if (error) return null;
    return (data as { pack_photos?: unknown } | null)?.pack_photos ?? null;
  } catch {
    return null;
  }
}


/**
 * Leert `bookings.pack_photos` beim Zuruecksetzen des Pack-Workflows.
 *
 * Bewusst ein EIGENER, best-effort Update statt eines Feldes im Merge-Payload
 * der Aufrufer: die Migration `supabase-pack-photos.sql` steht ggf. noch aus,
 * und ein unbekanntes Feld wuerde dort sonst den kompletten (fachlich
 * wichtigen) Update mitreissen.
 *
 * Ohne dieses Leeren wuerde nach einem Reset eine veraltete Foto-Liste
 * stehenbleiben und die photo-url-Route Signed URLs fuer bereits geloeschte
 * Dateien erzeugen.
 */
export async function clearPackPhotos(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  bookingId: unknown,
): Promise<void> {
  if (typeof bookingId !== 'string' || bookingId.trim() === '') return;
  try {
    await supabase.from('bookings').update({ pack_photos: [] }).eq('id', bookingId);
  } catch {
    // Migration ausstehend / transienter Fehler → best-effort
  }
}
