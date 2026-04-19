import { NextRequest, NextResponse } from 'next/server';
import { sendAndLog } from '@/lib/email';
import { BUSINESS } from '@/lib/business-config';
import { checkAdminAuth } from '@/lib/admin-auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

// Defense-in-Depth: Falls Admin-Cookie kompromittiert wäre,
// kann der Endpoint nicht für E-Mail-Spam missbraucht werden.
const testEmailLimiter = rateLimit({ maxAttempts: 10, windowMs: 60_000 });

/**
 * GET /api/admin/test-email?to=your@email.de
 * Sendet eine Test-Email und gibt Fehler detailliert zurück.
 * Hilft bei Resend-Konfigurationsproblemen.
 */
export async function GET(req: NextRequest) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }

  const { success } = testEmailLimiter.check(getClientIp(req));
  if (!success) {
    return NextResponse.json(
      { error: 'Zu viele Test-E-Mails. Bitte kurz warten.' },
      { status: 429 },
    );
  }

  const to = req.nextUrl.searchParams.get('to');
  if (!to || !to.includes('@')) {
    return NextResponse.json({ error: 'Parameter "to" (Email) erforderlich.' }, { status: 400 });
  }

  const hasResendKey = !!process.env.RESEND_API_KEY;
  const fromEmail = process.env.FROM_EMAIL ?? BUSINESS.email;

  if (!hasResendKey) {
    return NextResponse.json({
      error: 'RESEND_API_KEY nicht gesetzt.',
      hasResendKey: false,
      fromEmail,
    }, { status: 500 });
  }

  try {
    await sendAndLog({
      to,
      subject: 'Test-Email von cam2rent',
      html: `<h1>Test erfolgreich!</h1><p>Wenn du diese Email siehst, funktioniert Resend korrekt.</p><p>Absender: ${fromEmail}</p><p>Empfänger: ${to}</p>`,
      emailType: 'test',
    });

    return NextResponse.json({
      success: true,
      message: 'Email erfolgreich gesendet. Prüfe auch den Spam-Ordner!',
      from: fromEmail,
      to,
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unbekannter Fehler';
    return NextResponse.json({
      error: 'Email-Versand fehlgeschlagen.',
      details: errorMessage,
      hasResendKey: true,
      fromEmail,
      hint: errorMessage.includes('verify') || errorMessage.includes('domain')
        ? 'Domain nicht bei Resend verifiziert. Öffne resend.com/domains und verifiziere cam2rent.de'
        : errorMessage.includes('testing') || errorMessage.includes('sandbox')
        ? 'Resend ist im Sandbox-Modus. Du kannst nur an deine Registrierungs-Email senden.'
        : 'Prüfe Resend-Dashboard: API-Key gültig? Domain verifiziert?',
    }, { status: 500 });
  }
}
