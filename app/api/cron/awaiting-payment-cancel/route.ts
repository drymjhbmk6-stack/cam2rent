import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { verifyCronAuth } from '@/lib/cron-auth';
import { isTestMode } from '@/lib/env-mode';
import { getStripe } from '@/lib/stripe';
import { getBerlinOffsetString } from '@/lib/timezone';

export const runtime = 'nodejs';
export const maxDuration = 180;

interface DeadlineRule {
  days_before_rental: number;    // Wieviele Tage vor rental_from
  cutoff_hour_berlin: number;    // Uhrzeit (0-23) an dem Stichtag, Berlin-Zeit
}

interface CancelRulesSetting {
  versand?: DeadlineRule;
  abholung?: DeadlineRule;
}

const DEFAULT_RULES: Required<CancelRulesSetting> = {
  versand: { days_before_rental: 3, cutoff_hour_berlin: 18 },  // Mi 18 bei Fr-Miete = 2 volle Tage (Mi+Do)
  abholung: { days_before_rental: 1, cutoff_hour_berlin: 18 }, // Do 18 bei Fr-Miete
};

/**
 * Empfohlener Crontab:
 *   Variante A (praeziser, wenn cron TZ= unterstuetzt):
 *     TZ=Europe/Berlin
 *     1 18 * * *  curl -s -X POST -H "x-cron-secret: $CRON_SECRET" https://cam2rent.de/api/cron/awaiting-payment-cancel
 *   Variante B (stuendlich, DST-proof):
 *     5 * * * *  curl -s ...
 */

/**
 * Berechnet den Deadline-Zeitpunkt in UTC fuer eine gegebene Buchung.
 *
 *  deadline = (rental_from − daysBefore Tage) um cutoffHour Berlin-Zeit
 *
 * rental_from ist eine Date-Spalte (YYYY-MM-DD). Wir interpretieren sie als
 * Berlin-Mitternacht des Mietbeginn-Tags und rechnen Berlin-Zeit zurueck.
 */
function computeDeadlineUTC(rentalFromStr: string, rule: DeadlineRule): Date {
  const [yStr, mStr, dStr] = rentalFromStr.split('-');
  const y = parseInt(yStr, 10);
  const m = parseInt(mStr, 10);
  const d = parseInt(dStr, 10);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    throw new Error(`Ungueltiges rental_from: ${rentalFromStr}`);
  }

  // Stichtag = rental_from - daysBefore Tage (im Berlin-Kalender)
  // Wir nutzen Date.UTC fuer die Tagesarithmetik und lassen dann Berlin-Offset zum Deadline-Zeitpunkt ermitteln
  const pivotUTC = new Date(Date.UTC(y, m - 1, d - rule.days_before_rental));
  const pivotYear = pivotUTC.getUTCFullYear();
  const pivotMonth = pivotUTC.getUTCMonth() + 1;
  const pivotDay = pivotUTC.getUTCDate();
  const dateStr = `${pivotYear}-${String(pivotMonth).padStart(2, '0')}-${String(pivotDay).padStart(2, '0')}`;

  // Wir konstruieren "YYYY-MM-DDTHH:00:00+OFFSET" — der Offset wird zum
  // Pivot-Datum ermittelt (CEST vs. CET). Ein kurzer Approximations-Pass reicht:
  // erst mal Offset bei Pivot-Mittag als Approximation, dann finalen Offset
  // am Deadline-Zeitpunkt selbst.
  const approxAt = new Date(`${dateStr}T12:00:00Z`);
  const offset = getBerlinOffsetString(approxAt);
  const hh = String(rule.cutoff_hour_berlin).padStart(2, '0');
  return new Date(`${dateStr}T${hh}:00:00${offset}`);
}

async function handle(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (await isTestMode()) {
    return NextResponse.json({ skipped: 'test_mode' });
  }

  const supabase = createServiceClient();

  // Regeln laden
  const rules: Required<CancelRulesSetting> = { ...DEFAULT_RULES };
  try {
    const { data } = await supabase.from('admin_settings').select('value').eq('key', 'awaiting_payment_cancel_rules').maybeSingle();
    if (data?.value) {
      const parsed: CancelRulesSetting = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
      if (parsed.versand) rules.versand = { ...DEFAULT_RULES.versand, ...parsed.versand };
      if (parsed.abholung) rules.abholung = { ...DEFAULT_RULES.abholung, ...parsed.abholung };
    }
  } catch { /* default */ }

  // Offene awaiting_payment-Buchungen laden
  const { data: pending, error } = await supabase
    .from('bookings')
    .select('id, rental_from, delivery_mode, customer_email, customer_name, product_name, price_total, stripe_payment_link_id, created_at')
    .eq('status', 'awaiting_payment')
    .order('rental_from', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!pending || pending.length === 0) return NextResponse.json({ checked: 0, cancelled: 0, rules });

  const nowMs = Date.now();
  const stripe = await getStripe();
  const results: Array<{ id: string; action: 'cancelled' | 'kept'; reason?: string; error?: string; deadline?: string }> = [];

  for (const b of pending) {
    const mode: 'versand' | 'abholung' = b.delivery_mode === 'abholung' ? 'abholung' : 'versand';
    const rule = rules[mode];

    let deadline: Date;
    try {
      deadline = computeDeadlineUTC(b.rental_from, rule);
    } catch (err) {
      results.push({ id: b.id, action: 'kept', error: err instanceof Error ? err.message : 'Deadline-Berechnung fehlgeschlagen' });
      continue;
    }

    // Grace-Period: mindestens 1h nach Erstellung warten
    const createdMs = new Date(b.created_at).getTime();
    const minAgeMs = 60 * 60 * 1000;

    if (nowMs < deadline.getTime()) {
      results.push({ id: b.id, action: 'kept', reason: `${Math.round((deadline.getTime() - nowMs) / 3600_000)}h bis Deadline`, deadline: deadline.toISOString() });
      continue;
    }
    if (nowMs - createdMs < minAgeMs) {
      results.push({ id: b.id, action: 'kept', reason: 'Grace-Period (<1h alt)', deadline: deadline.toISOString() });
      continue;
    }

    // Payment Link deaktivieren
    let stripeErr: string | undefined;
    if (b.stripe_payment_link_id) {
      try {
        await stripe.paymentLinks.update(b.stripe_payment_link_id, { active: false });
      } catch (err) {
        stripeErr = err instanceof Error ? err.message : String(err);
        console.warn(`[awaiting-payment-cancel] Stripe deactivate fehlgeschlagen fuer ${b.id}:`, stripeErr);
      }
    }

    const reasonText = `Auto-Storno: unbezahlt, Deadline ${deadline.toISOString()} erreicht (${rule.days_before_rental}T vor Mietbeginn, ${rule.cutoff_hour_berlin}:00 Berlin).`;
    const { error: upErr } = await supabase
      .from('bookings')
      .update({ status: 'cancelled', notes: reasonText })
      .eq('id', b.id);

    if (upErr) {
      results.push({ id: b.id, action: 'kept', error: upErr.message });
      continue;
    }

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
                leider konnten wir bis zur Zahlungsfrist keine Zahlung für deine Buchung "<strong>${b.product_name}</strong>" (Start ${b.rental_from}) verbuchen. Die Buchung wurde daher automatisch storniert.
              </p>
              <p style="color: #64748b; font-size: 14px; line-height: 1.6;">
                Wenn du dein Gerät trotzdem noch mieten möchtest, leg die Buchung einfach neu an — ab dem Zeitpunkt der Zahlung ist die Kamera wieder für dich reserviert.
              </p>
              <p style="color: #94a3b8; font-size: 12px; margin-top: 24px;">Viele Grüße<br/>cam2rent</p>
            </div>
          `,
          bookingId: b.id,
          emailType: 'auto_cancel_payment',
        });
      } catch (mailErr) {
        console.warn('[awaiting-payment-cancel] Mail-Fehler:', mailErr);
      }
    }

    results.push({ id: b.id, action: 'cancelled', reason: `${rule.days_before_rental}T/${rule.cutoff_hour_berlin}h`, deadline: deadline.toISOString(), error: stripeErr });
  }

  return NextResponse.json({
    checked: pending.length,
    cancelled: results.filter((r) => r.action === 'cancelled').length,
    rules,
    results,
  });
}

export async function GET(req: NextRequest) { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }
