import { createServiceClient } from '@/lib/supabase';
import { sendAndLog } from '@/lib/email';
import { BUSINESS } from '@/lib/business-config';
import { getSiteUrl } from '@/lib/env-mode';

/**
 * Wraps die User-HTML in das cam2rent-Mail-Layout (Header + Footer mit
 * Pflicht-Abmeldelink). Jeder Empfaenger bekommt seinen eigenen Token-Link.
 */
export function buildNewsletterEmailHtml(opts: {
  bodyHtml: string;
  unsubscribeUrl: string;
  baseUrl: string;
}): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f0f0f0;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:24px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;max-width:600px;width:100%;">
        <tr><td style="background:#0a0a0a;padding:24px 32px;">
          <span style="font-size:20px;font-weight:700;color:#fff;letter-spacing:-0.5px;">cam<span style="color:#3b82f6;">2</span>rent</span>
        </td></tr>
        <tr><td style="padding:32px;color:#1a1a1a;font-size:15px;line-height:1.6;">
          ${opts.bodyHtml}
        </td></tr>
        <tr><td style="background:#f9fafb;padding:20px 32px;border-top:1px solid #e5e7eb;">
          <p style="margin:0 0 8px;font-size:11px;color:#9ca3af;text-align:center;">
            ${BUSINESS.name} · ${BUSINESS.addressLine}
          </p>
          <p style="margin:0;font-size:11px;color:#9ca3af;text-align:center;">
            <a href="${opts.unsubscribeUrl}" style="color:#9ca3af;">Vom Newsletter abmelden</a>
            ·
            <a href="${opts.baseUrl}/datenschutz" style="color:#9ca3af;">Datenschutz</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

interface SendResult {
  total: number;
  sent: number;
  failed: number;
  errors: string[];
}

/**
 * Verschickt eine Newsletter-Mail an alle bestaetigten + nicht abgemeldeten
 * Empfaenger. Chunked in 25er-Bloecken, damit Resend nicht ratelimited.
 */
export async function sendNewsletterToAllConfirmed(opts: {
  subject: string;
  bodyHtml: string;
}): Promise<SendResult> {
  const supabase = createServiceClient();
  const baseUrl = await getSiteUrl();

  const { data: subs, error } = await supabase
    .from('newsletter_subscribers')
    .select('id, email, unsubscribe_token')
    .eq('confirmed', true)
    .eq('unsubscribed', false);

  if (error) throw new Error(error.message);

  const result: SendResult = {
    total: subs?.length ?? 0,
    sent: 0,
    failed: 0,
    errors: [],
  };

  if (!subs || subs.length === 0) return result;

  const CHUNK = 25;
  for (let i = 0; i < subs.length; i += CHUNK) {
    const chunk = subs.slice(i, i + CHUNK);
    await Promise.allSettled(
      chunk.map(async (sub) => {
        const unsubscribeUrl = `${baseUrl}/api/newsletter/unsubscribe?token=${sub.unsubscribe_token}`;
        const html = buildNewsletterEmailHtml({
          bodyHtml: opts.bodyHtml,
          unsubscribeUrl,
          baseUrl,
        });
        try {
          await sendAndLog({
            to: sub.email,
            subject: opts.subject,
            html,
            emailType: 'newsletter_campaign',
          });
          result.sent++;
        } catch (err) {
          result.failed++;
          if (result.errors.length < 5) {
            result.errors.push(`${sub.email}: ${(err as Error).message}`);
          }
        }
      }),
    );
    // Kurze Pause zwischen Chunks gegen Resend-Burst-Limit
    if (i + CHUNK < subs.length) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  return result;
}

/**
 * Test-Versand an eine einzelne E-Mail (z.B. an den eingeloggten Admin).
 * Nutzt einen Dummy-Token im Unsubscribe-Link.
 */
export async function sendNewsletterTest(opts: {
  to: string;
  subject: string;
  bodyHtml: string;
}): Promise<void> {
  const baseUrl = await getSiteUrl();
  const html = buildNewsletterEmailHtml({
    bodyHtml: opts.bodyHtml,
    unsubscribeUrl: `${baseUrl}/api/newsletter/unsubscribe?token=DUMMY_TEST_TOKEN`,
    baseUrl,
  });
  await sendAndLog({
    to: opts.to,
    subject: `[TEST] ${opts.subject}`,
    html,
    emailType: 'newsletter_test',
  });
}
