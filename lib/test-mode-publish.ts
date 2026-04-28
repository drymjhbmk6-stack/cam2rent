/**
 * Zentraler Schalter: Im Test-Modus echt auf Meta/Blog veroeffentlichen?
 *
 * Standardmaessig werden im Test-Modus keine Posts/Reels auf FB+IG hochgeladen
 * und keine Blog-Artikel publiziert (Schutz gegen ungewollte Reichweite +
 * Test-Content im Live-Feed). Mit dem Toggle unter
 * /admin/social/reels/einstellungen "Veroeffentlichung im Test-Modus" kann
 * der Admin den Schutz fuer alle drei Kanaele (Reels, Social-Posts, Blog)
 * gemeinsam deaktivieren.
 *
 * DB-Key: admin_settings.publish_in_test_mode (JSON: { "enabled": true })
 * Backward-Compat: liest auch das alte reels_settings.publish_in_test_mode,
 * falls die UI vor diesem Refactor verwendet wurde.
 */

import { createServiceClient } from '@/lib/supabase';

let cache: { value: boolean; ts: number } | null = null;
const CACHE_TTL_MS = 30_000;

function parseEnabled(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parseEnabled(parsed);
    } catch {
      return value === 'true';
    }
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if ('enabled' in obj) return Boolean(obj.enabled);
    if ('publish_in_test_mode' in obj) return Boolean(obj.publish_in_test_mode);
  }
  return false;
}

/** Lese-Cache invalidieren (z.B. nach Toggle in der UI). */
export function invalidatePublishInTestModeCache(): void {
  cache = null;
}

/**
 * true = im Test-Modus trotzdem echt auf Meta/Blog publishen.
 * false (Default) = der bisherige Test-Modus-Schutz greift.
 */
export async function shouldPublishInTestMode(): Promise<boolean> {
  const now = Date.now();
  if (cache && now - cache.ts < CACHE_TTL_MS) return cache.value;

  try {
    const supabase = createServiceClient();
    // Neuer Top-Level-Key
    const { data: top } = await supabase
      .from('admin_settings')
      .select('value')
      .eq('key', 'publish_in_test_mode')
      .maybeSingle();

    let enabled = parseEnabled(top?.value);

    // Backward-Compat: alter reels_settings-Key
    if (!enabled) {
      const { data: legacy } = await supabase
        .from('admin_settings')
        .select('value')
        .eq('key', 'reels_settings')
        .maybeSingle();
      if (legacy?.value) {
        const parsed =
          typeof legacy.value === 'string'
            ? (JSON.parse(legacy.value) as Record<string, unknown>)
            : (legacy.value as Record<string, unknown>);
        enabled = Boolean(parsed?.publish_in_test_mode);
      }
    }

    cache = { value: enabled, ts: now };
    return enabled;
  } catch {
    return false;
  }
}
