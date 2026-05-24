import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { getCurrentAdminUser } from '@/lib/admin-auth';
import { logAudit } from '@/lib/audit';
import { checkAllFirmware } from '@/lib/firmware/check-all';
import { isTestMode } from '@/lib/env-mode';

/**
 * POST /api/admin/firmware/test
 * Führt einen kompletten Firmware-Check synchron aus (ohne Cron-Lock,
 * ohne Push-Notification — der Admin steht ja vorm Bildschirm).
 */
export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const me = await getCurrentAdminUser();
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (await isTestMode()) {
    return NextResponse.json(
      { error: 'Im Test-Modus wird kein echter Firmware-Check ausgeführt (Hersteller-APIs nicht hämmern).' },
      { status: 409 },
    );
  }

  try {
    const supabase = createServiceClient();
    const summary = await checkAllFirmware(supabase);
    await logAudit({
      action: 'firmware.check_run',
      entityType: 'firmware_check',
      changes: {
        checked: summary.checked,
        errors: summary.errors,
        unsupported: summary.unsupported,
        updates: summary.updates.length,
      },
      request: req,
    });
    return NextResponse.json({ ok: true, summary });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unbekannter Fehler' },
      { status: 500 },
    );
  }
}
