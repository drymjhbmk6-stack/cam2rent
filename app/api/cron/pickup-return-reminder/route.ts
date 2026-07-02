import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { verifyCronAuth } from '@/lib/cron-auth';
import { acquireCronLock, releaseCronLock } from '@/lib/cron-lock';
import { getBerlinDateString } from '@/lib/timezone';
import { isTestMode } from '@/lib/env-mode';
import { createAdminNotification } from '@/lib/admin-notifications';
import {
  loadBufferDays,
  computeShipDate,
  computeReturnDueDate,
  toIsoDate,
  type BufferDays,
} from '@/lib/booking-buffer';

/**
 * Abhol-/Rückgabe-Terminabsprache — Push + Aufgabe max. 48h im Voraus.
 *
 * Für Buchungen mit Lieferart „Abholung" (delivery_mode = 'abholung') soll der
 * Admin rechtzeitig mit dem Kunden eine Uhrzeit ausmachen, wann er die Kamera
 * abholt bzw. zurückbringt. Dieser Cron schickt dafür EINE Push-Benachrichtigung
 * (+ Eintrag in der Glocke, Permission `tagesgeschaeft`), sobald der Abhol- bzw.
 * Rückgabetag ≤ 48 Stunden (2 Tage) entfernt ist.
 *
 *  - Abholung vereinbaren: Status `confirmed`/`awaiting_pickup`, Abholtag
 *    (= ship_date, i.d.R. 1 Tag vor Mietbeginn bzw. ship_date_override) ≤ 2 Tage.
 *  - Rückgabe vereinbaren: Status `picked_up`, Rückgabetag
 *    (= return_due_date, i.d.R. 1 Tag nach Mietende bzw. Override) ≤ 2 Tage.
 *
 * Idempotenz: pro Buchung + Richtung genau EINE Push. Atomarer Claim über
 * `bookings.pickup_coordination_reminded_at` / `return_coordination_reminded_at`
 * (Update mit `.is(..., null)` → nur wer den Marker gewinnt, verschickt).
 *
 * Die gleichen Aufgaben erscheinen zusätzlich LIVE im Dashboard-Aufgaben-Widget
 * (dashboard-data berechnet sie ohne Dedup) — dieser Cron liefert nur den Push.
 *
 * Setup in Hetzner-Crontab (mehrmals täglich, --resolve umgeht Cloudflare —
 * siehe CLAUDE.md „Cloudflare-Vollintegration"):
 *   0 8,13,18 * * * curl -s -X POST --resolve cam2rent.de:443:127.0.0.1 \
 *     -H "x-cron-secret: $CRON_SECRET" https://cam2rent.de/api/cron/pickup-return-reminder
 *
 * Ohne die Migration `supabase-bookings-coordination-reminder.sql` liefert der
 * Cron `migration_pending` (kein Push — das Dashboard-Widget läuft trotzdem).
 */

// „maximal 48h im Voraus" → Reminder ab 2 Kalendertagen Vorlauf.
const REMIND_WITHIN_DAYS = 2;

// Abholungs-Puffer analog zum Auftragskalender (1 Tag vor/nach), damit der
// „Abholtag"/„Rückgabetag" mit dem übereinstimmt, was der Admin dort sieht.
const LOCAL_DEFAULT_BUFFER: BufferDays = {
  versand_before: 3,
  versand_after: 3,
  abholung_before: 1,
  abholung_after: 1,
};

function daysUntil(dateStr: string, today: string): number {
  const a = Date.parse(`${today}T00:00:00Z`);
  const b = Date.parse(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(b)) return Number.POSITIVE_INFINITY;
  return Math.round((b - a) / 86_400_000);
}

function fmtDe(dateStr: string): string {
  const m = String(dateStr || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : String(dateStr || '');
}

const isMigrationMissing = (msg?: string | null) =>
  /pickup_coordination_reminded_at|return_coordination_reminded_at|column|schema cache|PGRST/i.test(
    msg || '',
  );

type BookingRow = Record<string, unknown>;

export async function GET(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const lock = await acquireCronLock('pickup-return-reminder');
  if (!lock.acquired) {
    return NextResponse.json({ skipped: 'lock_held', reason: lock.reason });
  }

  try {
    const supabase = createServiceClient();
    const testMode = await isTestMode();
    const today = getBerlinDateString();
    const buf = await loadBufferDays(supabase, LOCAL_DEFAULT_BUFFER);

    let pickupSent = 0;
    let returnSent = 0;
    const errors: string[] = [];

    // ── Abholung vereinbaren ───────────────────────────────────────
    // Noch nicht abgeholt (confirmed/awaiting_pickup) + noch nicht erinnert.
    const pickup = await supabase
      .from('bookings')
      .select('*')
      .eq('is_test', testMode)
      .eq('delivery_mode', 'abholung')
      .in('status', ['confirmed', 'awaiting_pickup'])
      .is('pickup_coordination_reminded_at', null);

    if (pickup.error) {
      if (isMigrationMissing(pickup.error.message)) {
        return NextResponse.json({
          skipped: 'migration_pending',
          hint: 'supabase-bookings-coordination-reminder.sql ausführen',
        });
      }
      return NextResponse.json({ error: 'DB-Fehler (Abholung)', detail: pickup.error.message }, { status: 500 });
    }

    for (const b of (pickup.data ?? []) as BookingRow[]) {
      const id = b.id as string;
      const rentalFrom = String(b.rental_from ?? '').slice(0, 10);
      if (!rentalFrom) continue;
      const override = (b.ship_date_override as string | null | undefined) ?? null;
      const pickupDate = toIsoDate(computeShipDate(rentalFrom, 'abholung', buf, override));
      if (daysUntil(pickupDate, today) > REMIND_WITHIN_DAYS) continue;

      // Atomarer Claim: nur wer den Marker von NULL auf now() setzt, verschickt.
      const claim = await supabase
        .from('bookings')
        .update({ pickup_coordination_reminded_at: new Date().toISOString() })
        .eq('id', id)
        .is('pickup_coordination_reminded_at', null)
        .select('id')
        .maybeSingle();
      if (claim.error || !claim.data) continue; // schon erinnert / Race verloren

      try {
        await createAdminNotification(supabase, {
          type: 'pickup_coordination',
          title: '📞 Abholtermin vereinbaren',
          message: `${(b.customer_name as string) || 'Kunde'} holt ${(b.product_name as string) || 'die Kamera'} am ${fmtDe(pickupDate)} ab — Uhrzeit mit dem Kunden ausmachen.`,
          link: `/admin/buchungen/${id}`,
        });
        pickupSent++;
      } catch (e) {
        errors.push(`pickup ${id}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    // ── Rückgabe vereinbaren ───────────────────────────────────────
    // Kunde hat die Kamera (picked_up) + noch nicht erinnert.
    const ret = await supabase
      .from('bookings')
      .select('*')
      .eq('is_test', testMode)
      .eq('delivery_mode', 'abholung')
      .eq('status', 'picked_up')
      .is('return_coordination_reminded_at', null);

    if (ret.error) {
      // Migration-Probe hat oben schon gegriffen; hier nur echte Fehler.
      return NextResponse.json({ error: 'DB-Fehler (Rückgabe)', detail: ret.error.message }, { status: 500 });
    }

    for (const b of (ret.data ?? []) as BookingRow[]) {
      const id = b.id as string;
      const rentalTo = String(b.rental_to ?? '').slice(0, 10);
      if (!rentalTo) continue;
      const override = (b.return_due_date_override as string | null | undefined) ?? null;
      const returnDate = toIsoDate(computeReturnDueDate(rentalTo, 'abholung', buf, override));
      if (daysUntil(returnDate, today) > REMIND_WITHIN_DAYS) continue;

      const claim = await supabase
        .from('bookings')
        .update({ return_coordination_reminded_at: new Date().toISOString() })
        .eq('id', id)
        .is('return_coordination_reminded_at', null)
        .select('id')
        .maybeSingle();
      if (claim.error || !claim.data) continue;

      try {
        await createAdminNotification(supabase, {
          type: 'return_coordination',
          title: '📞 Rückgabetermin vereinbaren',
          message: `${(b.customer_name as string) || 'Kunde'} bringt ${(b.product_name as string) || 'die Kamera'} am ${fmtDe(returnDate)} zurück — Uhrzeit mit dem Kunden ausmachen.`,
          link: `/admin/buchungen/${id}`,
        });
        returnSent++;
      } catch (e) {
        errors.push(`return ${id}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    return NextResponse.json({
      ok: true,
      date: today,
      window_days: REMIND_WITHIN_DAYS,
      summary: { pickup_sent: pickupSent, return_sent: returnSent, errors: errors.length },
      errors: errors.slice(0, 20),
    });
  } finally {
    await releaseCronLock('pickup-return-reminder');
  }
}

// Manche Cron-Setups schicken POST statt GET.
export const POST = GET;
