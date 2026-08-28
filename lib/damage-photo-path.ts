/**
 * Normalisiert einen Eintrag aus `damage_reports.photos` zu einem Storage-Pfad.
 *
 * Hintergrund (Audit K-5): Bis Sweep 9 wurde die volle Public-URL gespeichert,
 * seither der reine Storage-Pfad. `supabase-sec-04-damage-photos-backfill.sql`
 * stellt die Altbestände um — bis das Skript gelaufen ist, liegen beide Formen
 * gemischt vor.
 *
 * Der Helfer macht die Anzeige unabhängig davon, ob der Backfill schon lief:
 * Aus einer Alt-URL wird der Pfad herausgeschnitten, ein Pfad bleibt unverändert.
 * Damit rendert das Admin-UI in JEDEM Fall über `/api/admin/damage-photo-url`
 * (signierte URL, 5 Min) und nie mehr die öffentliche URL direkt — genau das
 * verlangt K-5, und der Bucket kann unabhängig vom Deploy-Zeitpunkt privat
 * geschaltet werden.
 *
 * Beispiele:
 *   "C2R-2621-003/17512-a1b2c3.jpg"                          → unverändert
 *   "C2R-2621-003/<uuid>/17512-a1b2c3.jpg"                   → unverändert
 *   "https://x.supabase.co/storage/v1/object/public/damage-photos/C2R-…/a.jpg"
 *                                                            → "C2R-…/a.jpg"
 */
export function toDamagePhotoPath(urlOrPath: string): string {
  if (!urlOrPath) return urlOrPath;
  const marker = '/damage-photos/';
  const idx = urlOrPath.indexOf(marker);
  if (idx === -1) return urlOrPath;
  // Alles vor dem Bucketnamen abschneiden, danach einen etwaigen Query-String.
  return urlOrPath.slice(idx + marker.length).split('?')[0];
}

/** Fertige Anzeige-URL für ein Schadensfoto (immer über die signierte Route). */
export function damagePhotoSrc(urlOrPath: string): string {
  return `/api/admin/damage-photo-url?path=${encodeURIComponent(toDamagePhotoPath(urlOrPath))}`;
}
