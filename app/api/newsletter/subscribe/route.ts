import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createServiceClient } from '@/lib/supabase';
import { sendAndLog } from '@/lib/email';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { BUSINESS } from '@/lib/business-config';
import { getSiteUrl, isTestMode } from '@/lib/env-mode';

export const runtime = 'nodejs';

const limiter = rateLimit({ maxAttempts: 5, windowMs: 60 * 60 * 1000 }); // 5/h pro IP

/**
 * POST /api/newsletter/subscribe
 * Body: { email, source? }
 * Loest Double-Opt-In aus: schreibt subscriber-Eintrag (confirmed=false) und
 * verschickt Bestaetigungsmail mit Token-Link.
 */
export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (!limiter.check(ip).success) {
    return NextResponse.json(
      { error: 'Zu viele Versuche. Bitte später erneut probieren.' },
      { status: 429 },
    );
  }

  try {
    const { email: rawEmail, source } = await req.json();
    const email = String(rawEmail ?? '').trim().toLowerCase();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Bitte gültige E-Mail-Adresse angeben.' }, { status: 400 });
    }

    const supabase = createServiceClient();

    // Schon bestaetigt aktiv? → freundlich antworten ohne neue Mail
    const { data: existing } = await supabase
      .from('newsletter_subscribers')
      .select('id, confirmed, unsubscribed')
      .ilike('email', email)
      .eq('confirmed', true)
      .eq('unsubscribed', false)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ success: true, alreadySubscribed: true });
    }

    // Token (32 zufaellige Bytes, hex)
    const token = crypto.randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const userAgent = req.headers.get('user-agent')?.slice(0, 200) ?? null;

    const { error: insertErr } = await supabase
      .from('newsletter_subscribers')
      .insert({
        email,
        confirm_token: token,
        confirm_token_expires_at: expiresAt,
        confirmed: false,
        source: source ? String(source).slice(0, 30) : 'home',
        signup_ip: ip,
        signup_user_agent: userAgent,
        is_test: await isTestMode(),
      });

    if (insertErr) {
      console.error('[newsletter/subscribe] DB-Fehler:', insertErr.message);
      return NextResponse.json({ error: 'Anmeldung fehlgeschlagen.' }, { status: 500 });
    }

    // Bestaetigungsmail
    const baseUrl = await getSiteUrl();
    const confirmUrl = `${baseUrl}/api/newsletter/confirm?token=${token}`;

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f0f0f0;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:24px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;max-width:560px;width:100%;">
        <tr><td style="background:#0a0a0a;padding:28px 32px;">
          <span style="font-size:20px;font-weight:700;color:#fff;letter-spacing:-0.5px;">cam<span style="color:#3b82f6;">2</span>rent</span>
        </td></tr>
        <tr><td style="padding:32px;">
          <h1 style="margin:0 0 12px;font-size:22px;font-weight:700;color:#0a0a0a;">Newsletter bestätigen</h1>
          <p style="margin:0 0 20px;font-size:15px;color:#6b7280;line-height:1.6;">
            Vielen Dank für deine Anmeldung! Bitte bestätige deine E-Mail-Adresse mit einem Klick:
          </p>
          <p style="margin:0 0 24px;text-align:center;">
            <a href="${confirmUrl}" style="display:inline-block;padding:14px 28px;background:#3b82f6;color:#fff;text-decoration:none;border-radius:10px;font-size:14px;font-weight:600;">
              Anmeldung bestätigen
            </a>
          </p>
          <p style="margin:0;font-size:12px;color:#94a3b8;line-height:1.5;">
            Falls der Button nicht klickt, kopiere diesen Link:<br/>
            <span style="word-break:break-all;color:#64748b;">${confirmUrl}</span>
          </p>
          <p style="margin:24px 0 0;font-size:12px;color:#94a3b8;">
            Du hast keinen Newsletter angefordert? Dann ignoriere diese Mail einfach — du wirst nicht eingetragen.
          </p>
        </td></tr>
        <tr><td style="background:#f9fafb;padding:20px 32px;border-top:1px solid #e5e7eb;">
          <p style="margin:0;font-size:11px;color:#9ca3af;text-align:center;">
            ${BUSINESS.name} · ${BUSINESS.addressLine}
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

    try {
      await sendAndLog({
        to: email,
        subject: 'Bestätige deine Newsletter-Anmeldung',
        html,
        emailType: 'newsletter_confirm',
      });
    } catch (e) {
      console.error('[newsletter/subscribe] Mail-Fehler:', e);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[newsletter/subscribe] Fehler:', err);
    return NextResponse.json({ error: 'Anmeldung fehlgeschlagen.' }, { status: 500 });
  }
}
