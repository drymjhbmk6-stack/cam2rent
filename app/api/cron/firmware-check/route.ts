import { NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/cron-auth';
import { createServiceClient } from '@/lib/supabase';
import { acquireCronLock, releaseCronLock } from '@/lib/cron-lock';
import { isTestMode } from '@/lib/env-mode';
import { checkAllFirmware } from '@/lib/firmware/check-all';
import { createAdminNotification } from '@/lib/admin-notifications';

/**
 * Quartals-Firmware-Check für alle Kameras (alle 3 Monate).
 *
 * Crontab in Hetzner (alle 3 Monate am 1., 07:00 Berlin, --resolve umgeht Cloudflare):
 *   0 7 1 STAR_SLASH_3 * curl -s -X POST --resolve cam2rent.de:443:127.0.0.1 \
 *     -H "x-cron-secret: $CRON_SECRET" https://cam2rent.de/api/cron/firmware-check
 *   (STAR_SLASH_3 = das Cron-Sternchen-Slash-3, hier nur als Wort dargestellt,
 *   weil der JS-Block-Kommentar sonst vorzeitig endet.)
 *
 * Setting in `admin_settings.firmware_check_config`:
 *   { enabled: true, last_run_at?: ISO, last_run_summary?: {...} }
 */

export const runtime = 'nodejs';
export const maxDuration = 300;

interface FirmwareCheckConfig {
  enabled?: boolean;
  last_run_at?: string;
  last_run_summary?: {
    checked: number;
    errors: number;
    unsupported: number;
    updates: number;
  };
}

async function loadConfig(): Promise<FirmwareCheckConfig> {
  try {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from('admin_settings')
      .select('value')
      .eq('key', 'firmware_check_config')
      .maybeSingle();
    if (!data?.value) return {};
    return typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
  } catch {
    return {};
  }
}

async function saveLastRun(
  summary: { checked: number; errors: number; unsupported: number; updates: number },
): Promise<void> {
  try {
    const supabase = createServiceClient();
    const config = await loadConfig();
    await supabase.from('admin_settings').upsert(
      {
        key: 'firmware_check_config',
        value: {
          ...config,
          last_run_at: new Date().toISOString(),
          last_run_summary: summary,
        },
      },
      { onConflict: 'key' },
    );
  } catch (err) {
    console.error('[cron/firmware-check] saveLastRun failed:', err);
  }
}

export async function POST(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return runFirmwareCheck();
}

export async function GET(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return runFirmwareCheck();
}

async function runFirmwareCheck() {
  // Im Test-Modus keine Hersteller-Anfragen.
  if (await isTestMode()) {
    return NextResponse.json({ ok: true, skipped: 'test-mode' });
  }

  const config = await loadConfig();
  if (config.enabled === false) {
    return NextResponse.json({ ok: true, skipped: 'disabled via admin_settings' });
  }

  const lock = await acquireCronLock('firmware-check');
  if (!lock.acquired) {
    return NextResponse.json({ ok: true, skipped: lock.reason });
  }

  try {
    const supabase = createServiceClient();
    const summary = await checkAllFirmware(supabase);

    // Eine gebündelte Notification pro Lauf — verhindert Push-Storm.
    if (summary.updates.length > 0) {
      const previewLines = summary.updates
        .slice(0, 5)
        .map((u) => `• ${u.brand} ${u.model}: ${u.from ?? '—'} → ${u.to}`);
      const extra = summary.updates.length > 5 ? `\n…und ${summary.updates.length - 5} weitere` : '';
      await createAdminNotification(supabase, {
        type: 'firmware_update_available',
        title:
          summary.updates.length === 1
            ? 'Neue Firmware für 1 Kamera-Modell verfügbar'
            : `Neue Firmware für ${summary.updates.length} Kamera-Modelle verfügbar`,
        message: previewLines.join('\n') + extra,
        link: '/admin/firmware',
      });
    }

    await saveLastRun({
      checked: summary.checked,
      errors: summary.errors,
      unsupported: summary.unsupported,
      updates: summary.updates.length,
    });

    return NextResponse.json({ ok: true, summary });
  } catch (err) {
    console.error('[cron/firmware-check] Fehler:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unbekannter Fehler' },
      { status: 500 },
    );
  } finally {
    await releaseCronLock('firmware-check');
  }
}
