/**
 * Magic-Byte-Check für Bild-Uploads.
 *
 * Der vom Browser gemeldete `file.type` (MIME) ist vom Client kontrollierbar
 * und darf nicht als Sicherheitsgrenze dienen. Diese Utilities prüfen die
 * tatsächliche Binär-Signatur der ersten Bytes.
 *
 * Unterstützt: JPEG, PNG, WebP, HEIC/HEIF, GIF.
 */

export type DetectedImageType = 'jpeg' | 'png' | 'webp' | 'heic' | 'heif' | 'gif' | null;

export type DetectedFileType = DetectedImageType | 'pdf';

export function detectFileType(buffer: Buffer | Uint8Array): DetectedFileType | null {
  if (buffer.length < 4) return null;
  // PDF: "%PDF-"
  if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
    return 'pdf';
  }
  return detectImageType(buffer);
}

export function detectImageType(buffer: Buffer | Uint8Array): DetectedImageType {
  if (buffer.length < 12) return null;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpeg';

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  )
    return 'png';

  // GIF: "GIF87a" oder "GIF89a"
  if (
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x38 &&
    (buffer[4] === 0x37 || buffer[4] === 0x39) &&
    buffer[5] === 0x61
  )
    return 'gif';

  // WebP: "RIFF" + 4 bytes size + "WEBP"
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  )
    return 'webp';

  // HEIC/HEIF: "ftyp" bei offset 4, dann brand code
  if (
    buffer[4] === 0x66 &&
    buffer[5] === 0x74 &&
    buffer[6] === 0x79 &&
    buffer[7] === 0x70
  ) {
    const brand = String.fromCharCode(buffer[8], buffer[9], buffer[10], buffer[11]);
    if (brand === 'heic' || brand === 'heix' || brand === 'hevc' || brand === 'hevx') return 'heic';
    if (brand === 'mif1' || brand === 'msf1' || brand === 'heim' || brand === 'heis') return 'heif';
  }

  return null;
}

/**
 * Prüft, ob der Buffer ein echtes Bild (einer der erlaubten Typen) ist.
 */
export function isAllowedImage(
  buffer: Buffer | Uint8Array,
  allowed: DetectedImageType[] = ['jpeg', 'png', 'webp', 'heic', 'heif'],
): boolean {
  const detected = detectImageType(buffer);
  return detected !== null && allowed.includes(detected);
}
