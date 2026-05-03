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

export type DetectedVideoType = 'mp4' | 'mov' | 'webm' | null;

export type DetectedFileType = DetectedImageType | DetectedVideoType | 'pdf';

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

/**
 * Video-Magic-Byte-Erkennung (MP4/MOV/WebM).
 * MP4/MOV teilen sich das ISO-BMFF-Format ("ftyp"-Box bei Offset 4).
 * Der Brand-Code dahinter unterscheidet die Varianten.
 */
export function detectVideoType(buffer: Buffer | Uint8Array): DetectedVideoType {
  if (buffer.length < 12) return null;

  // WebM: 1A 45 DF A3 (EBML Header)
  if (
    buffer[0] === 0x1a &&
    buffer[1] === 0x45 &&
    buffer[2] === 0xdf &&
    buffer[3] === 0xa3
  ) {
    return 'webm';
  }

  // ISO-BMFF: "ftyp" bei Offset 4
  if (
    buffer[4] === 0x66 &&
    buffer[5] === 0x74 &&
    buffer[6] === 0x79 &&
    buffer[7] === 0x70
  ) {
    const brand = String.fromCharCode(buffer[8], buffer[9], buffer[10], buffer[11]);
    // QuickTime MOV
    if (brand === 'qt  ') return 'mov';
    // Diverse MP4-Brands
    if (
      brand === 'mp41' ||
      brand === 'mp42' ||
      brand === 'isom' ||
      brand === 'iso2' ||
      brand === 'iso4' ||
      brand === 'iso5' ||
      brand === 'iso6' ||
      brand === 'avc1' ||
      brand === 'dash' ||
      brand === 'f4v ' ||
      brand === 'M4V ' ||
      brand === 'M4A '
    ) {
      return 'mp4';
    }
    // HEIC-Brands wurden schon in detectImageType abgefangen, alles andere mit ftyp
    // behandeln wir als MP4-kompatibel (konservativ — das sind Containerformate,
    // die Browser/FFmpeg dekodieren).
    const heifBrands = ['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1', 'heim', 'heis'];
    if (!heifBrands.includes(brand)) return 'mp4';
  }

  return null;
}

/**
 * Prueft, ob der Buffer ein echtes Video (einer der erlaubten Typen) ist.
 */
export function isAllowedVideo(
  buffer: Buffer | Uint8Array,
  allowed: DetectedVideoType[] = ['mp4', 'mov', 'webm'],
): boolean {
  const detected = detectVideoType(buffer);
  return detected !== null && allowed.includes(detected);
}

export type DetectedAudioType = 'mp3' | 'wav' | 'ogg' | 'flac' | 'm4a' | null;

/**
 * Audio-Magic-Byte-Erkennung. Reichlich tolerant fuer MP3 (Frame-Sync FF E0..FF FF
 * im ersten Block) + ID3v2-Tag-Header. Auch WAV, OGG, FLAC und M4A werden erkannt.
 */
export function detectAudioType(buffer: Buffer | Uint8Array): DetectedAudioType {
  if (buffer.length < 12) return null;

  // ID3v2 ("ID3"): MP3 mit Tags
  if (buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) return 'mp3';

  // MP3 Frame-Sync: FF Ex / Fx (11 Bits = 1)
  if (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0) {
    // Layer-Bits != 00, Version-Bits != 01 (reserviert) — grobes Sanity-Check
    const layer = (buffer[1] >> 1) & 0x03;
    const version = (buffer[1] >> 3) & 0x03;
    if (layer !== 0 && version !== 1) return 'mp3';
  }

  // RIFF + WAVE
  if (
    buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
    buffer[8] === 0x57 && buffer[9] === 0x41 && buffer[10] === 0x56 && buffer[11] === 0x45
  ) return 'wav';

  // OggS
  if (buffer[0] === 0x4f && buffer[1] === 0x67 && buffer[2] === 0x67 && buffer[3] === 0x53) return 'ogg';

  // fLaC
  if (buffer[0] === 0x66 && buffer[1] === 0x4c && buffer[2] === 0x61 && buffer[3] === 0x43) return 'flac';

  // M4A: ftyp + Brand 'M4A '
  if (
    buffer[4] === 0x66 && buffer[5] === 0x74 && buffer[6] === 0x79 && buffer[7] === 0x70 &&
    buffer[8] === 0x4d && buffer[9] === 0x34 && buffer[10] === 0x41 && buffer[11] === 0x20
  ) return 'm4a';

  return null;
}

/** Prueft, ob der Buffer ein echtes Audio (einer der erlaubten Typen) ist. */
export function isAllowedAudio(
  buffer: Buffer | Uint8Array,
  allowed: DetectedAudioType[] = ['mp3', 'wav', 'ogg', 'flac', 'm4a'],
): boolean {
  const detected = detectAudioType(buffer);
  return detected !== null && allowed.includes(detected);
}
