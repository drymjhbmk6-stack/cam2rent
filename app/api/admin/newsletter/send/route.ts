import { NextRequest, NextResponse } from 'next/server';
import { sendNewsletterToAllConfirmed, sendNewsletterTest } from '@/lib/newsletter';
import { logAudit } from '@/lib/audit';
import { getCurrentAdminUser } from '@/lib/admin-auth';

export const runtime = 'nodejs';
export const maxDuration = 300; // bis zu 5 Min, falls viele Empfaenger

/**
 * POST /api/admin/newsletter/send
 * Body:
 *   { subject, bodyHtml, mode: 'test', testEmail }  → Test an einzelne Adresse
 *   { subject, bodyHtml, mode: 'live' }             → Live an alle bestaetigten
 *
 * Live-Sendung Owner-only (Sweep 7 Vuln 5): Massenversand an alle bestaetigten
 * Newsletter-Abonnenten mit cam2rent-Branding ist eine Phishing-Waffe, wenn an
 * Mitarbeiter delegiert. Test-Versand bleibt fuer preise-Permission moeglich.
 * Live-Sendung loggt eine Audit-Zeile pro Run.
 */
export async function POST(req: NextRequest) {
  try {
    const me = await getCurrentAdminUser();
    if (!me) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const subject = String(body?.subject ?? '').trim();
    const bodyHtml = String(body?.bodyHtml ?? '').trim();
    const mode = body?.mode === 'test' ? 'test' : 'live';

    if (mode === 'live' && me.role !== 'owner') {
      return NextResponse.json(
        { error: 'Nur Owner dürfen den Live-Versand auslösen.' },
        { status: 403 },
      );
    }

    if (!subject || subject.length < 3) {
      return NextResponse.json({ error: 'Betreff zu kurz.' }, { status: 400 });
    }
    if (!bodyHtml || bodyHtml.length < 20) {
      return NextResponse.json({ error: 'Inhalt zu kurz.' }, { status: 400 });
    }

    if (mode === 'test') {
      const testEmail = String(body?.testEmail ?? '').trim().toLowerCase();
      if (!testEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testEmail)) {
        return NextResponse.json({ error: 'Ungültige Test-Adresse.' }, { status: 400 });
      }
      await sendNewsletterTest({ to: testEmail, subject, bodyHtml });
      return NextResponse.json({ success: true, mode: 'test', testEmail });
    }

    const result = await sendNewsletterToAllConfirmed({ subject, bodyHtml });

    await logAudit({
      action: 'newsletter.send_campaign',
      entityType: 'newsletter_campaign',
      changes: {
        subject,
        total: result.total,
        sent: result.sent,
        failed: result.failed,
      },
      request: req,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error('[admin/newsletter/send] Fehler:', err);
    return NextResponse.json(
      { error: (err as Error).message || 'Versand fehlgeschlagen.' },
      { status: 500 },
    );
  }
}
