import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import { logAudit } from '@/lib/audit';

/**
 * POST /api/admin/buchhaltung/invoices/sync-status
 *
 * Repariert `invoices`-Rows, die faelschlich als bezahlt markiert sind, obwohl
 * die zugehoerige Buchung noch keine Zahlung erhalten hat. Hintergrund: Vor dem
 * 2026-05-20-Fix in `lib/buchhaltung/store-invoice.ts` hat der Backfill-Endpoint
 * Buchungen im Status `pending_verification` oder `awaiting_payment` (Express-
 * Signup / verificationDeferred / Stripe-Payment-Link) ungeprueft als
 * `status='paid', payment_status='paid'` in `invoices` geschrieben — der
 * `MANUAL-UNPAID`-Check griff fuer den `PENDING-`-Prefix und fuer Stripe-
 * Payment-Link-Buchungen nicht.
 *
 * Heilung:
 *  - Sucht invoices mit status='paid', deren Booking
 *    (a) Status in ('pending_verification', 'awaiting_payment') hat, ODER
 *    (b) payment_intent_id mit `PENDING-` beginnt, ODER
 *    (c) payment_intent_id `MANUAL-UNPAID` enthaelt
 *  - Setzt sie auf status='open', payment_status='open', paid_at=NULL.
 *    (CHECK-Constraint erlaubt nur 'paid','open','overdue','cancelled',
 *    'partially_paid' fuer status; 'open','paid','overdue','cancelled',
 *    'partial' fuer payment_status — 'unpaid'/'sent' sind nicht zulaessig.)
 *  - Idempotent (mehrfaches Ausfuehren = no-op).
 *
 * Antwort: { checked, updated, ids }.
 */
export async function POST(req: NextRequest) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }

  const supabase = createServiceClient();

  // Alle aktuell als bezahlt markierten Rechnungen laden (sowohl status als
  // auch payment_status — beide werden zurueckgesetzt). Begrenzt auf Live-Mode
  // ODER Test-Mode separat — Heilung soll pro Welt sauber bleiben.
  const { data: paidInvoices, error: invErr } = await supabase
    .from('invoices')
    .select('id, booking_id, payment_status, status')
    .or('status.eq.paid,payment_status.eq.paid')
    .not('booking_id', 'is', null);

  if (invErr) {
    return NextResponse.json({ error: `Rechnungen: ${invErr.message}` }, { status: 500 });
  }

  const checked = paidInvoices?.length ?? 0;
  if (checked === 0) {
    return NextResponse.json({ checked: 0, updated: 0, ids: [] });
  }

  // Buchungen bulk laden — N+1 vermeiden
  const bookingIds = [...new Set((paidInvoices ?? []).map((i) => i.booking_id).filter(Boolean))];
  const { data: bookings, error: bookErr } = await supabase
    .from('bookings')
    .select('id, status, payment_intent_id')
    .in('id', bookingIds);

  if (bookErr) {
    return NextResponse.json({ error: `Buchungen: ${bookErr.message}` }, { status: 500 });
  }

  const bookingMap = new Map<string, { status: string | null; payment_intent_id: string | null }>();
  for (const b of bookings ?? []) {
    bookingMap.set(b.id, { status: b.status, payment_intent_id: b.payment_intent_id });
  }

  // Filtern: welche invoices sind faelschlich paid?
  const toFix: string[] = [];
  for (const inv of paidInvoices ?? []) {
    const b = bookingMap.get(inv.booking_id);
    if (!b) continue;
    const bookingStatus = (b.status ?? '').toLowerCase();
    const piId = (b.payment_intent_id ?? '').toString();
    const isAwaitingStatus =
      bookingStatus === 'awaiting_payment' || bookingStatus === 'pending_verification';
    const isPendingPrefix = /^PENDING-/i.test(piId);
    const isExplicitUnpaid = /MANUAL-UNPAID/i.test(piId);
    if (isAwaitingStatus || isPendingPrefix || isExplicitUnpaid) {
      toFix.push(inv.id);
    }
  }

  if (toFix.length === 0) {
    return NextResponse.json({ checked, updated: 0, ids: [] });
  }

  // Bulk-Update auf "unpaid". paid_at NULL setzen, damit der Bezahlt-Zeitstempel
  // nicht stehenbleibt und Reports falsche Werte zeigen.
  const { error: updateErr } = await supabase
    .from('invoices')
    .update({
      status: 'open',
      payment_status: 'open',
      paid_at: null,
    })
    .in('id', toFix);

  if (updateErr) {
    return NextResponse.json({ error: `Update: ${updateErr.message}` }, { status: 500 });
  }

  await logAudit({
    action: 'invoice.sync_status',
    entityType: 'invoice',
    entityId: 'bulk',
    changes: { checked, updated: toFix.length, ids: toFix.slice(0, 50) },
    request: req,
  });

  return NextResponse.json({ checked, updated: toFix.length, ids: toFix });
}
