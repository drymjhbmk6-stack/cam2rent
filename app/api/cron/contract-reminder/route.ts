import { NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/cron-auth';
import { createServiceClient } from '@/lib/supabase';
import { sendContractSignReminder } from '@/lib/email';
import { acquireCronLock, releaseCronLock } from '@/lib/cron-lock';
import { isTestMode } from '@/lib/env-mode';
import { getBerlinDateString } from '@/lib/timezone';
import { loadBufferDays, computeShipDate, toIsoDate } from '@/lib/booking-buffer';
import { loadContractReminderConfig } from '@/lib/contract-reminder-config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * GET/POST /api/cron/contract-reminder
 *
 * Täglich auszuführen (z.B. 08:00 Berlin). Findet aktive Buchungen ohne
 * unterschriebenen Mietvertrag, deren Puffertag (Versand-/Übergabetag) näher
 * rückt, und schickt dem Kunden eine tägliche Erinnerung mit Link zum
 * Unterschreiben. Ohne Vertrag wird die Buchung am Puffertag vom Cron
 * `/api/cron/contract-auto-cancel` automatisch storniert.
 *
 * Reminder-Fenster: ab `reminder_lead_days` (Default 5) Tagen vor dem Puffertag
 * bis zum Puffertag selbst — konfigurierbar über
 * `admin_settings.contract_reminder_config`.
 *
 * Idempotenz: pro Buchung max. 1 Reminder/Tag (Dedup über email_log).
 *
 * Crontab (Hetzner, --resolve umgeht Cloudflare — siehe CLAUDE.md):
 *   0 8 * * * curl -s -X POST --resolve cam2rent.de:443:127.0.0.1 \
 *     -H "x-cron-secret: $CRON_SECRET" https://cam2rent.de/api/cron/contract-reminder
 */
export async function GET(req: NextRequest) { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }

// Vorbereitende Status: Buchung ist bezahlt/bestätigt, aber noch nicht raus.
const PRE_FULFILLMENT_STATUSES = ['confirmed', 'preparing_shipment', 'awaiting_pickup'];

function daysUntil(dateStr: string, today: string): number {
  const a = Date.parse(`${today}T00:00:00Z`);
  const b = Date.parse(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(b)) return Number.POSITIVE_INFINITY;
  return Math.round((b - a) / 86_400_000);
}

async function handle(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const lock = await acquireCronLock('contract-reminder');
  if (!lock.acquired) {
    return NextResponse.json({ skipped: lock.reason });
  }
  try {
    const supabase = createServiceClient();
    const config = await loadContractReminderConfig(supabase);
    if (!config.enabled) {
      return NextResponse.json({ ok: true, skipped: 'disabled' });
    }

    const testMode = await isTestMode();
    const today = getBerlinDateString();
    const buf = await loadBufferDays(supabase);

    // Aktive, noch nicht rausgegangene Buchungen laden. select('*') ist
    // defensiv gegen noch ausstehende Migrationen (ship_date_override /
    // booking_type müssen nicht existieren).
    let rows: Record<string, unknown>[] = [];
    try {
      const { data, error } = await supabase
        .from('bookings')
        .select('*')
        .eq('is_test', testMode)
        .in('status', PRE_FULFILLMENT_STATUSES);
      if (error) throw error;
      rows = (data ?? []) as Record<string, unknown>[];
    } catch (err) {
      console.error('[contract-reminder] select fehlgeschlagen:', err);
      return NextResponse.json({ ok: true, processed: 0, error: 'db_error' });
    }

    // Kandidaten: Vertrag noch nicht unterschrieben + kein Verkauf.
    const candidates = rows.filter((b) => {
      if (b.contract_signed === true) return false;
      if (b.booking_type === 'kauf') return false;
      if (!b.customer_email) return false;
      return true;
    });

    // Duplikats-Schutz: heutige Reminder aus email_log holen.
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const { data: todayLog } = await supabase
      .from('email_log')
      .select('booking_id')
      .eq('email_type', 'contract_sign_reminder')
      .gte('created_at', todayStart.toISOString());
    const alreadySent = new Set(
      (todayLog ?? []).map((e) => e.booking_id).filter(Boolean),
    );

    let processed = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const b of candidates) {
      const id = b.id as string;
      if (alreadySent.has(id)) { skipped++; continue; }

      const rentalFrom = String(b.rental_from ?? '').slice(0, 10);
      if (!rentalFrom) { skipped++; continue; }

      const mode = b.delivery_mode === 'abholung' ? 'abholung' : 'versand';
      const override = (b.ship_date_override as string | null | undefined) ?? null;
      const shipDate = toIsoDate(computeShipDate(rentalFrom, mode, buf, override));
      const d = daysUntil(shipDate, today);

      // Nur im Fenster [3 Tage nach Puffertag .. lead_days davor] erinnern.
      // Weiter in der Zukunft: noch nicht nerven. Der Unterrand (-3) verhindert
      // endlose Tages-Mails, falls der Auto-Storno für diese Lieferart aus ist
      // (remind-only) und der Kunde nie unterschreibt.
      if (d > config.reminder_lead_days || d < -3) { skipped++; continue; }

      try {
        await sendContractSignReminder({
          customerName: (b.customer_name as string) || 'Kunde',
          customerEmail: b.customer_email as string,
          bookingNumber: id,
          productName: (b.product_name as string) || undefined,
          rentalFrom,
          rentalTo: String(b.rental_to ?? '').slice(0, 10) || undefined,
          deadlineDate: shipDate,
          daysUntilDeadline: d,
          deliveryMode: mode,
        });
        processed++;
      } catch (err) {
        errors.push(`${id}: ${err instanceof Error ? err.message : 'unknown'}`);
      }
    }

    return NextResponse.json({
      ok: true,
      date: today,
      processed,
      skipped,
      candidates: candidates.length,
      errors: errors.length > 0 ? errors.slice(0, 20) : undefined,
    });
  } finally {
    await releaseCronLock('contract-reminder');
  }
}
