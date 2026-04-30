import { NextRequest, NextResponse } from 'next/server';
import { sendWeeklyReport } from '@/lib/email';
import { createServiceClient } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';

/**
 * POST /api/admin/weekly-report/test
 *
 * Manueller Test-Versand des Wochenberichts.
 * Body (optional): { email?: string }
 *
 * Wird durch die Middleware bereits gegen admin_token Cookie geschützt.
 */
export async function POST(req: NextRequest) {
  let body: { email?: string } = {};
  try {
    body = await req.json();
  } catch {
    // leerer Body ist OK
  }

  let recipient = body.email?.trim();
  if (!recipient) {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from('admin_settings')
      .select('value')
      .eq('key', 'weekly_report_config')
      .maybeSingle();
    if (data?.value) {
      const cfg = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
      recipient = cfg?.email;
    }
  }

  try {
    await sendWeeklyReport(recipient);

    await logAudit({
      action: 'weekly_report.test_send',
      entityType: 'weekly_report',
      entityLabel: recipient,
      request: req,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unbekannter Fehler' },
      { status: 500 },
    );
  }
}
