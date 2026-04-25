import { NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/cron-auth';
import { createServiceClient } from '@/lib/supabase';
import { sendWeeklyReport } from '@/lib/email';
import { acquireCronLock, releaseCronLock } from '@/lib/cron-lock';

/**
 * Wöchentlicher Zusammenfassungs-Bericht.
 *
 * Setup in Hetzner-Crontab (Sonntag 18:30 Berliner Zeit):
 *   30 18 * * 0 curl -s -X POST -H "x-cron-secret: $CRON_SECRET" \
 *     https://cam2rent.de/api/cron/weekly-report
 *
 * Admin kann das Feature an-/ausschalten + Empfänger anpassen unter
 * admin_settings.weekly_report_config = { enabled: true, email: "kontakt@..." }
 * (Default: aktiviert, Empfänger = ADMIN_EMAIL env / BUSINESS.emailKontakt).
 */

interface WeeklyReportConfig {
  enabled?: boolean;
  email?: string;
}

async function loadConfig(): Promise<WeeklyReportConfig> {
  try {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from('admin_settings')
      .select('value')
      .eq('key', 'weekly_report_config')
      .maybeSingle();
    if (!data?.value) return {};
    return typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
  } catch {
    return {};
  }
}

export async function POST(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return runWeeklyReport();
}

// GET erlaubt auch — manchmal bequemer im Hetzner-Crontab. Auth bleibt gleich.
export async function GET(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return runWeeklyReport();
}

async function runWeeklyReport() {
  const config = await loadConfig();

  if (config.enabled === false) {
    return NextResponse.json({ ok: true, skipped: 'disabled via admin_settings' });
  }

  // Re-Entry-Schutz: Sonntag 18:30 ist eine sehr schmale Zeitscheibe.
  // Coolify-Redeploy + Crontab-Tick koennten den Bericht zweimal verschicken.
  const lock = await acquireCronLock('weekly-report');
  if (!lock.acquired) {
    return NextResponse.json({ ok: true, skipped: lock.reason });
  }
  try {
    await sendWeeklyReport(config.email);
    return NextResponse.json({ ok: true, sentTo: config.email ?? 'default' });
  } catch (err) {
    console.error('[cron/weekly-report] Fehler:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unbekannter Fehler' },
      { status: 500 },
    );
  } finally {
    await releaseCronLock('weekly-report');
  }
}
