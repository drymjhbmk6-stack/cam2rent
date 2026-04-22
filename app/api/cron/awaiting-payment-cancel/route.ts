import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { verifyCronAuth } from '@/lib/cron-auth';
import { isTestMode } from '@/lib/env-mode';
import { getStripe } from '@/lib/stripe';

export const runtime = 'nodejs';
export const maxDuration = 180;

interface CancelHoursSetting {
  versand?: number;
  abholung?: number;
}

/**
 * GET/POST /api/cron/awaiting-payment-cancel
 *
 * Storniert alle Buchungen im Status 'awaiting_payment' deren Mietbeginn naeher
 * rueckt als die konfigurierte Frist:
 *   - Versand:   Default 48h vor rental_from
 *   - Abholung:  Default 24h vor rental_from
 *
 * Schritte pro Buchung:
 *   1. Stripe Payment Link deaktivieren (damit der Kunde nicht mehr zahlen kann)
 *   2. Buchung auf status='cancelled' setzen, Grund in notes
 *   3. E-Mail an Kunden (Info zur Stornierung)
 *
 * Empfohlener Crontab (taeglich 00:05):
 *   5 0 * * * curl -s -X POST -H "x-cron-secret: CRON_SECRET" https://cam2rent.de/api/cron/awaiting-payment-cancel
 *
 * Einmal taeglich reicht aus: die Deadline ist ein absoluter Zeitpunkt.
 * Ob der Cron 2 Minuten oder 24h nach Deadline laeuft ist egal — der
 * Auto-Storno bleibt logisch korrekt. Weniger Stripe-API-Calls.
 */
async function handle(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (await isTestMode()) {
    // Im Test-Modus keine echten Stripe-Calls
    return NextResponse.json({ skipped: 'test_mode' });
  }

  const supabase = createServiceClient();

  // Deadline-Settings laden
  let versandHours = 48;
  let abholungHours = 24;
  try {
    const { data } = await supabase.from('admin_settings').select('value').eq('key', 'awaiting_payment_cancel_hours').maybeSingle();
    if (data?.value) {
      const parsed: CancelHoursSetting = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
      if (Number.isFinite(parsed.versand)) versandHours = Number(parsed.versand);
      if (Number.isFinite(parsed.abholung)) abholungHours = Number(parsed.abholung);
    }
  } catch { /* default */ }

  // Alle offenen awaiting_payment-Buchungen laden
  const { data: pending, error } = await supabase
    .from('bookings')
    .select('id, rental_from, delivery_mode, customer_email, customer_name, product_name, price_total, stripe_payment_link_id, created_at')
    .eq('status', 'awaiting_payment')
    .order('rental_from', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!pending || pending.length === 0) {
    return NextResponse.json({ checked: 0, cancelled: 0 });
  }

  const now = Date.now();
  const stripe = await getStripe();
  const results: Array<{ id: string; action: 'cancelled' | 'kept'; reason?: string; error?: string }> = [];

  for (const b of pending) {
    const mode = b.delivery_mode ?? 'versand';
    const hoursBefore = mode === 'abholung' ? abholungHours : versandHours;
    const rentalStart = new Date(b.rental_from).getTime();
    const deadline = rentalStart - hoursBefore * 60 * 60 * 1000;

    // Grace-Period: mindestens 1h nach Erstellung warten (falls rental_from schon sehr nah ist)
    const createdMs = new Date(b.created_at).getTime();
    const minAgeMs = 60 * 60 * 1000;

    if (now < deadline) {
      results.push({ id: b.id, action: 'kept', reason: `${Math.round((deadline - now) / 3600_000)}h bis Deadline` });
      continue;
    }
    if (now - createdMs < minAgeMs) {
      results.push({ id: b.id, action: 'kept', reason: 'Grace-Period (< 1h alt)' });
      continue;
    }

    // Cancel-Flow
    let stripeErr: string | undefined;
    if (b.stripe_payment_link_id) {
      try {
        await stripe.paymentLinks.update(b.stripe_payment_link_id, { active: false });
      } catch (err) {
        stripeErr = err instanceof Error ? err.message : String(err);
        console.warn(`[awaiting-payment-cancel] Stripe deactivate fehlgeschlagen fuer ${b.id}:`, stripeErr);
        // Trotzdem weiter stornieren — Link bleibt bei Stripe aktiv, ist aber egal
      }
    }

    const cancelReason = `Auto-Storno: unbezahlt, Deadline (${hoursBefore}h vor Mietbeginn) erreicht.`;
    const { error: upErr } = await supabase
      .from('bookings')
      .update({
        status: 'cancelled',
        notes: cancelReason,
      })
      .eq('id', b.id);

    if (upErr) {
      results.push({ id: b.id, action: 'kept', error: upErr.message });
      continue;
    }

    // E-Mail non-blocking
    if (b.customer_email) {
      try {
        const { sendAndLog } = await import('@/lib/email');
        await sendAndLog({
          to: b.customer_email,
          subject: `Deine Buchung ${b.id} wurde storniert`,
          html: `
            <div style="font-family: 'DM Sans', Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 16px;">
              <h1 style="font-size: 22px; font-weight: 700; color: #1a1a1a;">Buchung ${b.id} storniert</h1>
              <p style="color: #64748b; font-size: 15px; line-height: 1.6;">
                Hallo ${b.customer_name || 'dort'},<br/><br/>
                leider konnten wir bis zur Frist keine Zahlung für deine Buchung "<strong>${b.product_name}</strong>" (Start ${b.rental_from}) verbuchen.
                Die Buchung wurde daher automatisch storniert.
              </p>
              <p style="color: #64748b; font-size: 14px; line-height: 1.6;">
                Wenn du dein Gerät trotzdem noch mieten möchtest, leg die Buchung einfach neu an — ab dem Zeitpunkt der Zahlung ist die Kamera wieder für dich reserviert.
              </p>
              <p style="color: #94a3b8; font-size: 12px; margin-top: 24px;">
                Viele Grüße<br/>cam2rent
              </p>
            </div>
          `,
          bookingId: b.id,
          emailType: 'auto_cancel_payment',
        });
      } catch (mailErr) {
        console.warn('[awaiting-payment-cancel] Mail-Fehler:', mailErr);
      }
    }

    results.push({ id: b.id, action: 'cancelled', reason: `${hoursBefore}h-Deadline`, error: stripeErr });
  }

  return NextResponse.json({
    checked: pending.length,
    cancelled: results.filter((r) => r.action === 'cancelled').length,
    settings: { versandHours, abholungHours },
    results,
  });
}

export async function GET(req: NextRequest) { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }
