import { createServiceClient } from '@/lib/supabase';

/**
 * Generischer Re-Entry-Schutz fuer Cron-Jobs ueber `admin_settings`.
 *
 * Hintergrund: Coolify-Restart + Crontab-Tick koennen einen Cron-Endpoint
 * gleichzeitig zweimal triggern. Ohne Lock duplizieren sich Mails / Stornos /
 * Mahnungen / Refunds. Pattern uebernommen von `cron/social-generate`.
 *
 * Verwendung:
 *
 *   const lock = await acquireCronLock('verification-auto-cancel');
 *   if (!lock.acquired) return NextResponse.json({ skipped: lock.reason });
 *   try {
 *     // ... Cron-Logik
 *   } finally {
 *     await releaseCronLock('verification-auto-cancel');
 *   }
 *
 * Stale-Locks (laenger als `STALE_AFTER_MINUTES` aktiv) werden automatisch
 * uebernommen — das deckt den Fall ab, dass der Vorgaenger-Lauf abgestuerzt ist
 * und das `release` nie ausgefuehrt wurde.
 */

const STALE_AFTER_MINUTES = 15;

interface LockState {
  status: 'running' | 'idle';
  started_at: string;
  pid?: string;
}

interface AcquireResult {
  acquired: boolean;
  reason?: string;
  staleOverride?: boolean;
}

function settingKey(name: string): string {
  return `cron_lock_${name}`;
}

export async function acquireCronLock(name: string): Promise<AcquireResult> {
  const supabase = createServiceClient();
  const key = settingKey(name);

  const { data: row } = await supabase
    .from('admin_settings')
    .select('value')
    .eq('key', key)
    .maybeSingle();

  let staleOverride = false;
  if (row?.value) {
    let parsed: LockState | null = null;
    try {
      parsed = typeof row.value === 'string'
        ? (JSON.parse(row.value) as LockState)
        : (row.value as LockState);
    } catch {
      parsed = null;
    }
    if (parsed?.status === 'running' && parsed.started_at) {
      const ageMs = Date.now() - new Date(parsed.started_at).getTime();
      if (Number.isFinite(ageMs) && ageMs < STALE_AFTER_MINUTES * 60 * 1000) {
        return {
          acquired: false,
          reason: `cron '${name}' laeuft bereits seit ${Math.floor(ageMs / 1000)}s`,
        };
      }
      staleOverride = true;
    }
  }

  const lockState: LockState = {
    status: 'running',
    started_at: new Date().toISOString(),
  };

  // Upsert auf admin_settings (Primaerschluessel = key)
  const { error } = await supabase
    .from('admin_settings')
    .upsert({ key, value: lockState }, { onConflict: 'key' });

  if (error) {
    console.error(`[cron-lock] acquire ${name} failed:`, error);
    // Im Fehlerfall lieber laufen lassen als alle Crons stillzulegen.
    return { acquired: true, reason: 'upsert_failed' };
  }

  return { acquired: true, staleOverride };
}

export async function releaseCronLock(name: string): Promise<void> {
  const supabase = createServiceClient();
  const key = settingKey(name);
  try {
    await supabase
      .from('admin_settings')
      .upsert(
        { key, value: { status: 'idle', started_at: new Date().toISOString() } },
        { onConflict: 'key' },
      );
  } catch (err) {
    console.error(`[cron-lock] release ${name} failed:`, err);
  }
}

/**
 * Conveniences-Wrapper: laeuft die uebergebene Funktion mit Lock,
 * gibt das Resultat (oder `null` wenn skipped) zurueck.
 */
export async function withCronLock<T>(
  name: string,
  fn: () => Promise<T>,
): Promise<{ skipped: false; result: T } | { skipped: true; reason: string }> {
  const lock = await acquireCronLock(name);
  if (!lock.acquired) {
    return { skipped: true, reason: lock.reason ?? 'locked' };
  }
  try {
    const result = await fn();
    return { skipped: false, result };
  } finally {
    await releaseCronLock(name);
  }
}
