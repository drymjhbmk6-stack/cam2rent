import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { sendAndLog } from '@/lib/email';
import { BUSINESS } from '@/lib/business-config';

/**
 * POST /api/survey
 * Speichert Kundenfeedback nach Rückgabe.
 * Body: { bookingId, rating (1-5), feedback (optional text), email (optional für Gutschein) }
 *
 * Wenn Rating >= 4 UND Email mitgegeben:
 *  → Erstellt automatisch einen personalisierten Gutschein (10% Rabatt, 90 Tage gültig)
 *  → Sendet Email mit Gutschein-Code
 *  → Gutschein erscheint im Admin-Bereich unter /admin/gutscheine
 */

const REWARD_DISCOUNT = 10; // 10% Rabatt
const REWARD_VALIDITY_DAYS = 90;
const REWARD_MIN_ORDER = 50; // Mindestbestellwert 50 €

function generateCouponCode(bookingId: string): string {
  // Eindeutiger Code: DANKE-{BookingID-Kurz}-{Random}
  const short = bookingId.replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(-6);
  const random = Math.random().toString(36).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
  return `DANKE-${short}-${random}`;
}

export async function POST(req: NextRequest) {
  try {
    const { bookingId, rating, feedback, email } = await req.json() as {
      bookingId: string;
      rating: number;
      feedback?: string;
      email?: string;
    };

    if (!bookingId || !rating || rating < 1 || rating > 5) {
      return NextResponse.json({ error: 'Ungültige Daten.' }, { status: 400 });
    }

    const supabase = createServiceClient();

    // Buchung laden für Kontext
    const { data: booking } = await supabase
      .from('bookings')
      .select('customer_name, customer_email, product_name')
      .eq('id', bookingId)
      .maybeSingle();

    // Survey in reviews-Tabelle speichern
    const { error } = await supabase.from('reviews').insert({
      booking_id: bookingId,
      customer_name: booking?.customer_name ?? '',
      customer_email: booking?.customer_email ?? '',
      product_name: booking?.product_name ?? '',
      rating,
      comment: feedback || null,
      source: 'survey',
      status: rating >= 4 ? 'approved' : 'pending',
    });

    if (error) {
      console.error('Survey save error:', error);
    }

    // Gutschein erstellen wenn Rating >= 4 und Email vorhanden
    let couponCode: string | null = null;
    let emailSent = false;
    let emailError: string | null = null;
    const targetEmail = email?.trim() || booking?.customer_email;

    if (rating >= 4 && targetEmail) {
      // Prüfen ob Buchung schon Gutschein bekommen hat (Duplikat-Schutz)
      const { data: existingCoupon } = await supabase
        .from('coupons')
        .select('code')
        .eq('target_user_email', targetEmail)
        .ilike('description', `%Bewertung%${bookingId}%`)
        .maybeSingle();

      if (existingCoupon) {
        couponCode = existingCoupon.code;
      } else {
        // Neuen Code generieren (mit Kollisionsschutz)
        let code = generateCouponCode(bookingId);
        for (let i = 0; i < 5; i++) {
          const { data: dup } = await supabase.from('coupons').select('id').eq('code', code).maybeSingle();
          if (!dup) break;
          code = generateCouponCode(bookingId);
        }

        const now = new Date();
        const validUntil = new Date(now.getTime() + REWARD_VALIDITY_DAYS * 24 * 60 * 60 * 1000);

        const { data: newCoupon, error: couponError } = await supabase
          .from('coupons')
          .insert({
            code,
            type: 'percent',
            value: REWARD_DISCOUNT,
            description: `Dankeschön für die Bewertung (Buchung ${bookingId})`,
            target_type: 'user',
            target_user_email: targetEmail,
            valid_from: now.toISOString(),
            valid_until: validUntil.toISOString(),
            max_uses: 1,
            min_order_value: REWARD_MIN_ORDER,
            once_per_customer: true,
            not_combinable: false,
            active: true,
          })
          .select('code')
          .single();

        if (couponError) {
          console.error('Coupon creation error:', couponError);
        } else {
          couponCode = newCoupon?.code ?? null;
        }
      }

      // Email mit Gutschein-Code senden
      if (couponCode) {
        try {
          await sendCouponEmail(targetEmail, booking?.customer_name ?? 'Kamera-Fan', couponCode);
          emailSent = true;
        } catch (e) {
          console.error('Coupon email error:', e);
          emailError = e instanceof Error ? e.message : 'Unbekannt';
        }
      }
    }

    return NextResponse.json({
      success: true,
      couponCode: couponCode ? couponCode : undefined,
      discount: couponCode ? REWARD_DISCOUNT : undefined,
      emailSent,
      emailError,
    });
  } catch (err) {
    console.error('Survey error:', err);
    return NextResponse.json({ error: 'Fehler.' }, { status: 500 });
  }
}

async function sendCouponEmail(email: string, name: string, code: string) {
  const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? BUSINESS.url;
  const subject = `Dein ${REWARD_DISCOUNT}% Gutschein als Dankeschön`;

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f0f0f0;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:24px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;max-width:560px;width:100%;">
        <tr><td style="background:#0a0a0a;padding:28px 32px;">
          <span style="font-size:20px;font-weight:700;color:#fff;letter-spacing:-0.5px;">cam<span style="color:#3b82f6;">2</span>rent</span>
        </td></tr>
        <tr><td style="padding:32px;">
          <h1 style="margin:0 0 12px;font-size:22px;font-weight:700;color:#0a0a0a;">Vielen Dank für dein Feedback!</h1>
          <p style="margin:0 0 24px;font-size:15px;color:#6b7280;line-height:1.6;">
            Hallo ${name},<br><br>
            wir freuen uns sehr, dass dir unser Service gefallen hat!
            Als kleines Dankeschön bekommst du einen <strong>${REWARD_DISCOUNT}% Gutschein</strong> für deine nächste Buchung.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;background:#fef3c7;border:2px dashed #f59e0b;border-radius:10px;">
            <tr><td style="padding:24px;text-align:center;">
              <p style="margin:0 0 6px;font-size:13px;font-weight:600;color:#92400e;text-transform:uppercase;letter-spacing:0.8px;">Dein Gutschein-Code</p>
              <p style="margin:0 0 8px;font-family:monospace;font-size:24px;font-weight:700;color:#78350f;letter-spacing:1px;">${code}</p>
              <p style="margin:0;font-size:12px;color:#a16207;">${REWARD_DISCOUNT}% Rabatt · gültig ${REWARD_VALIDITY_DAYS} Tage · ab ${REWARD_MIN_ORDER} €</p>
            </td></tr>
          </table>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0 8px;">
            <tr><td align="center">
              <a href="${BASE_URL}/kameras" style="display:inline-block;padding:14px 32px;background:#0a0a0a;color:#fff;text-decoration:none;border-radius:10px;font-size:14px;font-weight:600;">
                Jetzt neue Buchung starten
              </a>
            </td></tr>
          </table>
          <p style="margin:24px 0 0;font-size:12px;color:#9ca3af;line-height:1.5;text-align:center;">
            Der Code ist persönlich für dich hinterlegt und kann einmal verwendet werden.
          </p>
        </td></tr>
        <tr><td style="background:#f9fafb;padding:20px 32px;border-top:1px solid #e5e7eb;">
          <p style="margin:0;font-size:11px;color:#9ca3af;text-align:center;">
            ${BUSINESS.name} · ${BUSINESS.addressLine}<br>
            <a href="${BASE_URL}" style="color:#9ca3af;">${BUSINESS.domain}</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  await sendAndLog({
    to: email,
    subject,
    html,
    emailType: 'review_reward_coupon',
  });
}
