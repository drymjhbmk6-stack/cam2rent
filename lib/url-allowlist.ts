/**
 * Zentrale URL-Allowlist fuer server-seitige fetch()-Calls auf user-influencbare
 * URLs. Schliesst SSRF auf interne Adressen (Loopback, RFC1918, Cloud-Metadata)
 * aus und beschraenkt erlaubte Hosts auf bekannte Quellen.
 *
 * Eingebaut von Sweep 5 (publisher.ts cropImageForPlatform) als private
 * Funktion `isAllowedSourceUrl`. Sweep 7 zieht das in eine zentrale Lib,
 * damit Music-URLs (reels), externe Bild-Downloads und kuenftige Features
 * den gleichen Schutz bekommen — sonst poppt der Bug bei jedem neuen Feature
 * wieder auf.
 */

/** Loopback + RFC1918 + Cloud-Metadata-Hosts blocken. */
function isPrivateOrInternalHost(host: string): boolean {
  if (!host) return true;
  const h = host.toLowerCase();
  if (h === 'localhost' || h === '0.0.0.0' || h === '127.0.0.1' || h === '::1') return true;
  if (h === '169.254.169.254' || h === 'metadata.google.internal') return true;
  if (/^10\./.test(h)) return true;
  if (/^192\.168\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  if (/^127\./.test(h)) return true;
  if (/^169\.254\./.test(h)) return true;
  if (/^fd[0-9a-f]{2}:/i.test(h)) return true;
  if (/^fe80::/i.test(h)) return true;
  return false;
}

/** Pruefung gegen Suffix-Allowlist (.supabase.co matcht alles auf supabase.co etc.). */
function matchesAllowlist(host: string, allowed: string[]): boolean {
  const h = host.toLowerCase();
  return allowed.some((entry) =>
    entry.startsWith('.') ? h.endsWith(entry) : h === entry,
  );
}

/**
 * Bild-Quellen fuer cropImageForPlatform und aehnliche Workflows
 * (Social-Posts, Blog-Bilder).
 */
export function isAllowedImageSourceUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:') return false;
    if (isPrivateOrInternalHost(u.hostname)) return false;
    return matchesAllowlist(u.hostname, [
      '.supabase.co',
      '.supabase.in',
      'images.unsplash.com',
      'plus.unsplash.com',
      'oaidalleapiprodscus.blob.core.windows.net',
      'cam2rent.de',
      'test.cam2rent.de',
    ]);
  } catch {
    return false;
  }
}

/**
 * Stock-Footage + Audio-Quellen fuer Reel-Renderer.
 * Erlaubt zusaetzlich Pexels und Pixabay (CDNs + APIs).
 */
export function isAllowedStockUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:') return false;
    if (isPrivateOrInternalHost(u.hostname)) return false;
    return matchesAllowlist(u.hostname, [
      '.supabase.co',
      '.supabase.in',
      'videos.pexels.com',
      'images.pexels.com',
      'cdn.pexels.com',
      'www.pexels.com',
      'pixabay.com',
      'cdn.pixabay.com',
      'cam2rent.de',
      'test.cam2rent.de',
    ]);
  } catch {
    return false;
  }
}

/** Unsplash-Allowlist (fuer Picker, Blog-Import, Seasonal). */
export function isUnsplashUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:') return false;
    return [
      'images.unsplash.com',
      'plus.unsplash.com',
      'api.unsplash.com',
      'unsplash.com',
    ].includes(u.hostname);
  } catch {
    return false;
  }
}
