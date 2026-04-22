import { createServiceClient } from '@/lib/supabase';

/**
 * Baut den Betreff + HTML-Body fuer die Zahlungs-Link-E-Mail + berechnet
 * die Deadline anhand `admin_settings.awaiting_payment_cancel_rules`.
 *
 * Wird sowohl von `approve-booking` (initialer Versand) als auch von
 * `resend-payment-link` (manueller Re-Send aus Admin-UI) genutzt.
 */
export async function buildPaymentLinkEmail(opts: {
  bookingId: string;
  customerName: string | null;
  productName: string;
  days: number;
  rentalFrom: string;
  rentalTo: string;
  priceTotal: number;
  deliveryMode: 'versand' | 'abholung';
  paymentUrl: string;
}): Promise<{ subject: string; html: string }> {
  const supabase = createServiceClient();

  const rules = {
    versand: { days_before_rental: 3, cutoff_hour_berlin: 18 },
    abholung: { days_before_rental: 1, cutoff_hour_berlin: 18 },
  };
  try {
    const { data: ruleSetting } = await supabase
      .from('admin_settings')
      .select('value')
      .eq('key', 'awaiting_payment_cancel_rules')
      .maybeSingle();
    if (ruleSetting?.value) {
      const parsed = typeof ruleSetting.value === 'string' ? JSON.parse(ruleSetting.value) : ruleSetting.value;
      if (parsed?.versand) rules.versand = { ...rules.versand, ...parsed.versand };
      if (parsed?.abholung) rules.abholung = { ...rules.abholung, ...parsed.abholung };
    }
  } catch {
    // default rules
  }

  const rule = rules[opts.deliveryMode];

  let deadlineLabel = 'vor Mietbeginn';
  try {
    const [y, m, d] = String(opts.rentalFrom).split('-').map((s) => parseInt(s, 10));
    const pivot = new Date(Date.UTC(y, m - 1, d - rule.days_before_rental));
    const dateStr = `${pivot.getUTCFullYear()}-${String(pivot.getUTCMonth() + 1).padStart(2, '0')}-${String(pivot.getUTCDate()).padStart(2, '0')}`;
    const { getBerlinOffsetString } = await import('@/lib/timezone');
    const offset = getBerlinOffsetString(new Date(`${dateStr}T12:00:00Z`));
    const deadlineDate = new Date(`${dateStr}T${String(rule.cutoff_hour_berlin).padStart(2, '0')}:00:00${offset}`);
    deadlineLabel = deadlineDate.toLocaleString('de-DE', {
      timeZone: 'Europe/Berlin',
      weekday: 'long',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }) + ' Uhr';
  } catch {
    // fallback label
  }

  const priceFmt = Number(opts.priceTotal).toFixed(2).replace('.', ',');
  const customerName = opts.customerName || 'dort';

  const subject = `Zahlungs-Link zu Buchung ${opts.bookingId}`;
  const html = `
    <div style="font-family: 'DM Sans', Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 16px;">
      <div style="text-align: center; margin-bottom: 24px;">
        <span style="font-weight: 900; font-size: 20px; letter-spacing: -0.5px;">
          cam<span style="color: #3b82f6;">2</span>rent
        </span>
      </div>

      <h1 style="font-size: 22px; font-weight: 700; margin-bottom: 8px; color: #1a1a1a;">
        Dein Zahlungs-Link
      </h1>
      <p style="color: #64748b; font-size: 15px; line-height: 1.6; margin-bottom: 24px;">
        Hallo ${customerName},<br/>
        hier ist der Zahlungs-Link zu deiner Buchung <strong>${opts.bookingId}</strong>.
        Sobald der Betrag eingegangen ist, geht deine Buchung in den Versand.
      </p>

      <div style="background: #f1f5f9; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
        <p style="margin: 0 0 4px; font-size: 13px; color: #94a3b8;">Buchungsdetails</p>
        <p style="margin: 0; font-weight: 700; font-size: 16px; color: #1a1a1a;">${opts.productName}</p>
        <p style="margin: 4px 0 0; font-size: 14px; color: #64748b;">
          ${opts.days} Tage &middot; ${opts.rentalFrom} bis ${opts.rentalTo}
        </p>
        <p style="margin: 12px 0 0; font-weight: 700; font-size: 20px; color: #1a1a1a;">
          ${priceFmt} €
        </p>
      </div>

      <div style="text-align: center; margin-bottom: 24px;">
        <a href="${opts.paymentUrl}" style="display: inline-block; background: #3b82f6; color: white; font-weight: 700; font-size: 16px; padding: 14px 36px; border-radius: 10px; text-decoration: none;">
          Jetzt bezahlen
        </a>
      </div>

      <p style="color: #94a3b8; font-size: 12px; text-align: center;">
        Bitte bezahle spätestens bis <strong>${deadlineLabel}</strong>. Erfolgt bis dahin keine Zahlung, wird die Buchung automatisch storniert.
      </p>
    </div>
  `;

  return { subject, html };
}
