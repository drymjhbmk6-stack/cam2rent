/**
 * Client-seitige Foto-Kompression vor dem Upload (Übergabe + Verpackung).
 *
 * iPhone-Fotos sind oft 3–8 MB (HEIC oder JPEG). Auf instabilem Mobilfunk
 * (Tower-Wechsel, 5G→4G, Roaming) reißt der Upload großer Bodies mit
 * "TypeError: NetworkError"/Connection-Reset gerne ab. ~1 MB als Zieldatei
 * reicht für Doku-Foto-Qualität und kommt zuverlässig durch.
 *
 * Seit die Übergabe und die Verpackungskontrolle MEHRERE Pflicht-Fotos
 * verlangen (Gesamtfoto + pro Kamera vorne/hinten), ist das umso wichtiger:
 * unkomprimiert wären das schnell 20–40 MB pro Absenden.
 *
 * Strategie: createImageBitmap akzeptiert auch HEIC/HEIF auf iOS Safari und
 * konvertiert intern. Skaliert auf max 1920×1920 (long edge) und encodiert
 * als JPEG quality 0.85. Bei Fehler/fehlendem Browser-Support wird das
 * Original zurückgegeben — die Funktion darf einen Upload nie verhindern.
 *
 * Abgrenzung zu `lib/shrink-image-client.ts`: das ist der Beleg-/OCR-Pfad mit
 * eigener, iterativer Ziel-Byte-Logik (Claude-Vision-Limit). Hier geht es um
 * Doku-Fotos mit fester Kantenlänge — bewusst getrennt gehalten.
 */
export async function compressPhotoIfLarge(file: File): Promise<File> {
  // Schon klein genug → unverändert lassen
  if (file.size <= 1.2 * 1024 * 1024) return file;
  // Browser-Support-Check
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return file;

  const bitmap = await createImageBitmap(file);
  try {
    const MAX_DIM = 1920;
    let width = bitmap.width;
    let height = bitmap.height;
    if (width > MAX_DIM || height > MAX_DIM) {
      const ratio = Math.min(MAX_DIM / width, MAX_DIM / height);
      width = Math.round(width * ratio);
      height = Math.round(height * ratio);
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.85),
    );
    if (!blob || blob.size >= file.size) return file;
    const baseName = file.name.replace(/\.[^.]+$/, '') || 'photo';
    return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' });
  } finally {
    if (typeof bitmap.close === 'function') bitmap.close();
  }
}
