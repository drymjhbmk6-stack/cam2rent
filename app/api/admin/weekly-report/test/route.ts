import { NextRequest, NextResponse } from 'next/server';
import { sendWeeklyReport } from '@/lib/email';
import { createServiceClient } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';
import { getCurrentAdminUser } from '@/lib/admin-auth';

/**
 * POST /api/admin/weekly-report/test
 *
 * Manueller Test-Versand des Wochenberichts.
 * Body (optional): { email?: string } — wird ignoriert ausser fuer Owner.
 *
 * Empfaenger-Lock (Sweep 7 Vuln 8): Der Wochenbericht enthaelt Umsatz, offene
 * Rechnungen, Kundennamen + Adressen — also Finanz- + Kunden-PII. Bisher konnte
 * jeder Mitarbeiter mit `berichte`-Permission den Bericht an eine beliebige
 * externe E-Mail schicken (Datenleck).
 *
 * Neu:
 *  - Mitarbeiter (nicht-Owner): Empfaenger ist hart der gespeicherte
 *    weekly_report_config.email-Wert, Body-`email` wird ignoriert.
 *  - Owner: darf Body-`email` setzen (z.B. zum Test an alternative Adresse).
 */
export async function POST(req: NextRequest) {
  const me = await getCurrentAdminUser();
  if (!me) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { email?: string } = {};
  try {
    body = await req.json();
  } catch {
    // leerer Body ist OK
  }

  let recipient: string | undefined;
  if (me.role === 'owner' && body.email?.trim()) {
    recipient = body.email.trim();
  } else {
    // Mitarbeiter: harter Lock auf konfigurierten Empfaenger
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
  if (!recipient) {
    return NextResponse.json(
      { error: 'Kein Empfänger konfiguriert. Bitte unter Einstellungen → Wochenbericht hinterlegen.' },
      { status: 400 },
    );
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
