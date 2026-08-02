/**
 * Sanitizer + Defensiv-Helfer für die Verbrauchsartikel-API (POST/PATCH).
 * Geteilt zwischen `route.ts` und `[id]/route.ts`.
 */

/** Zubehör-Verknüpfungen: getrimmte, nicht-leere, deduplizierte IDs (max 50). */
export function sanitizeLinkedIds(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of input) {
    if (typeof raw !== 'string') continue;
    const t = raw.trim().slice(0, 200);
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= 50) break;
  }
  return out;
}

/** Freitext-Notiz: getrimmt, max 2000 Zeichen, leer → null. */
export function sanitizeNotiz(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const t = input.trim().slice(0, 2000);
  return t.length > 0 ? t : null;
}

/** Erkennt „neue Spalte fehlt"-Fehler (Migration nicht erneut ausgeführt). */
export const MISSING_NEW_COL_RE =
  /deduct_trigger|linked_accessory_ids|linked_accessory_id|image_url|notiz|column|schema cache|PGRST/i;

/** Deutsche Warnung, wenn die neuen Spalten nicht gespeichert werden konnten. */
export const NEW_COL_WARNING =
  'Foto, Notiz und Zubehör-Verknüpfung konnten nicht gespeichert werden — bitte die Migration `supabase-verbrauchsartikel.sql` (erneut) ausführen.';

/** Die additiven Spalten aus einem Payload entfernen (für den Retry). */
export function stripNewCols(payload: Record<string, unknown>): void {
  delete payload.deduct_trigger;
  delete payload.linked_accessory_ids;
  delete payload.linked_accessory_id;
  delete payload.image_url;
  delete payload.notiz;
}
