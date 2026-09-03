/**
 * Projektablage — serverseitige Helfer (Owner-Gate, Storage).
 *
 * NICHT im Browser importieren: `getCurrentAdminUser()` zieht `next/headers`
 * herein. Reine Hilfsfunktionen liegen in `lib/projektablage-shared.ts`.
 */

import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getCurrentAdminUser } from '@/lib/admin-auth';
import type { AdminUser } from '@/lib/admin-users';
import { PROJEKTABLAGE_BUCKET, MAX_FILE_BYTES } from '@/lib/projektablage-shared';

type OwnerGuard =
  | { ok: true; me: AdminUser }
  | { ok: false; res: NextResponse };

/**
 * Owner-Gate. Die Projektablage ist privat — Mitarbeiter haben dort auch mit
 * `system`-Berechtigung nichts zu suchen.
 *
 * Es gibt bewusst KEINEN Owner-Permission-Key (siehe lib/admin-users.ts);
 * das ist im Repo durchgaengig route-intern geloest (Muster: /api/admin/2fa/*).
 * Der Master-Passwort-Login (`legacy-env`) hat Rolle owner und kommt durch —
 * die Ablage braucht keine `admin_user_id`, sie ist nicht pro Konto getrennt.
 */
export async function guardOwner(): Promise<OwnerGuard> {
  const me = await getCurrentAdminUser();
  if (!me) {
    return { ok: false, res: NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 }) };
  }
  if (me.role !== 'owner') {
    return {
      ok: false,
      res: NextResponse.json({ error: 'Nur der Inhaber darf die Projektablage nutzen.' }, { status: 403 }),
    };
  }
  return { ok: true, me };
}

/** Fehlende Migration erkennen — Lesepfade liefern dann leere Listen. */
export function isMissingTable(err: unknown): boolean {
  const msg = (err as { message?: string } | null)?.message ?? '';
  const code = (err as { code?: string } | null)?.code ?? '';
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    /relation .* does not exist/i.test(msg) ||
    /projekt_ablage/i.test(msg) && /does not exist|schema cache/i.test(msg)
  );
}

/** Fehlender Storage-Bucket. */
export function isMissingBucket(err: unknown): boolean {
  const msg = (err as { message?: string } | null)?.message ?? '';
  return /bucket not found|bucket.*not.*exist|not found/i.test(msg);
}

/**
 * Legt den Bucket bei Bedarf an. Muster aus
 * app/api/admin/return-label/[id]/route.ts — "already exists" ist ein Rennen
 * mit einem parallelen Request und kein Fehler.
 *
 * Gibt eine Fehlermeldung zurueck, wenn der Bucket nicht verfuegbar gemacht
 * werden konnte, sonst null.
 */
export async function ensureBucket(supabase: SupabaseClient): Promise<string | null> {
  const { data, error } = await supabase.storage.getBucket(PROJEKTABLAGE_BUCKET);
  if (data && !error) return null;
  if (error && !isMissingBucket(error)) {
    return error.message || 'Storage nicht erreichbar.';
  }

  const { error: createErr } = await supabase.storage.createBucket(PROJEKTABLAGE_BUCKET, {
    public: false,
    fileSizeLimit: MAX_FILE_BYTES,
    // Bewusst KEINE allowedMimeTypes: die Ablage nimmt jeden Dateityp
    // (php, py, Binaries ...). Der Schutz liegt im privaten Bucket,
    // im Owner-Gate und im erzwungenen Download.
  });
  if (createErr && !/already exists|exists/i.test(createErr.message || '')) {
    return createErr.message || 'Bucket konnte nicht angelegt werden.';
  }
  return null;
}

/** Loescht Storage-Objekte in Haeppchen — `remove()` mag keine Riesenlisten. */
export async function removeStorageObjects(
  supabase: SupabaseClient,
  paths: string[]
): Promise<void> {
  const batchSize = 100;
  for (let i = 0; i < paths.length; i += batchSize) {
    const batch = paths.slice(i, i + batchSize);
    if (batch.length === 0) continue;
    try {
      await supabase.storage.from(PROJEKTABLAGE_BUCKET).remove(batch);
    } catch {
      // best-effort: ein haengendes Objekt darf das Loeschen nicht blockieren
    }
  }
}

/**
 * Raeumt den Storage-Ordner eines Standes leer.
 *
 * Primaerquelle sind die in der DB hinterlegten Pfade. Zusaetzlich wird der
 * Ordner aufgelistet, um Objekte zu erwischen, deren DB-Zeile fehlt (z.B.
 * abgebrochener Upload). Der Ordner ist flach (`<projekt>/<stand>/<uuid>`),
 * ein einzelner `list()`-Aufruf reicht also.
 */
export async function purgeStandStorage(
  supabase: SupabaseClient,
  projektId: string,
  standId: string,
  knownPaths: string[]
): Promise<void> {
  if (knownPaths.length > 0) {
    await removeStorageObjects(supabase, knownPaths);
  }

  const prefix = `${projektId}/${standId}`;
  try {
    let offset = 0;
    for (;;) {
      const { data, error } = await supabase.storage
        .from(PROJEKTABLAGE_BUCKET)
        .list(prefix, { limit: 1000, offset });
      if (error || !data || data.length === 0) break;
      await removeStorageObjects(
        supabase,
        data.map((entry) => `${prefix}/${entry.name}`)
      );
      if (data.length < 1000) break;
      offset += data.length;
    }
  } catch {
    // Storage nicht erreichbar — DB-Zeilen werden trotzdem entfernt.
  }
}
