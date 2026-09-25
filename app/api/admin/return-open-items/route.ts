import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { releaseAccessoryUnitsFromBooking } from '@/lib/accessory-unit-assignment';
import { logAudit } from '@/lib/audit';
import { loadOpenItems, OPEN_ITEM_STATUSES, type OpenItemStatus } from '@/lib/return-open-items';
import { sendReturnFollowUpRequest } from '@/lib/email';
import { createSale } from '@/lib/verkauf';
import { syncAccessoryQty } from '@/lib/sync-accessory-qty';
import { getBerlinDateString } from '@/lib/timezone';

/**
 * Verwaltung der nicht zurückgegebenen Positionen einer Rückgabe.
 *
 * Permission: 'tagesgeschaeft' (siehe API_PATH_PERMISSIONS in middleware.ts).
 *
 * GET  ?status=open|received|charged|waived|all  → Liste inkl. Kunden-/Buchungsdaten
 * POST { id, action: 'received' | 'charged' | 'waived', notes? }
 *      'received' gibt die zurückgehaltenen Exemplare wieder frei.
 * POST { id, action: 'remind', dueDate? }
 *      Kunde hat nichts geschickt → Erinnerungs-Mail, optional neue Frist.
 *      Position bleibt offen.
 * POST { id, action: 'bill', unitValue }
 *      Kunde schickt nicht → „Kommt nach" wird zu „Kunde ersetzt": Rechnung +
 *      Stripe-Zahlungslink (createSale), zurückgehaltene Exemplare gelten als
 *      verloren. Position bleibt offen, bis der Admin sie abhakt.
 */

export const dynamic = 'force-dynamic';

interface BookingLite {
  id: string;
  product_name: string | null;
  customer_name: string | null;
  customer_email: string | null;
  rental_from: string | null;
  rental_to: string | null;
  delivery_mode: string | null;
}

export async function GET(req: NextRequest) {
  const supabase = createServiceClient();
  const raw = req.nextUrl.searchParams.get('status') ?? 'open';
  const status: OpenItemStatus | 'all' =
    raw === 'all' || (OPEN_ITEM_STATUSES as string[]).includes(raw)
      ? (raw as OpenItemStatus | 'all')
      : 'open';

  const { rows, migrationPending } = await loadOpenItems(supabase, { status });
  if (migrationPending) {
    return NextResponse.json({ items: [], migration_pending: true });
  }
  if (rows.length === 0) return NextResponse.json({ items: [] });

  // Buchungsdaten gebündelt nachladen (kein N+1).
  const bookingIds = [...new Set(rows.map((r) => r.booking_id))];
  const { data: bookings } = await supabase
    .from('bookings')
    .select('id, product_name, customer_name, customer_email, rental_from, rental_to, delivery_mode')
    .in('id', bookingIds);

  const byId = new Map<string, BookingLite>();
  for (const b of (bookings ?? []) as BookingLite[]) byId.set(b.id, b);

  return NextResponse.json({
    items: rows.map((r) => ({ ...r, booking: byId.get(r.booking_id) ?? null })),
  });
}

const VALID_ACTIONS = ['received', 'charged', 'waived', 'remind', 'bill'] as const;
type Action = (typeof VALID_ACTIONS)[number];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(req: NextRequest) {
  let body: { id?: string; action?: string; notes?: string; dueDate?: string; unitValue?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Ungültiger Body.' }, { status: 400 });
  }

  const id = String(body.id ?? '').trim();
  const action = String(body.action ?? '') as Action;
  if (!id) return NextResponse.json({ error: 'id fehlt.' }, { status: 400 });
  if (!VALID_ACTIONS.includes(action)) {
    return NextResponse.json({ error: 'Unbekannte Aktion.' }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data: row, error: fetchErr } = await supabase
    .from('booking_return_open_items')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (fetchErr) {
    // Fehlende Migration → klarer Hinweis statt 500.
    if (fetchErr.code === '42P01' || fetchErr.code === 'PGRST205') {
      return NextResponse.json(
        { error: 'Migration ausstehend: supabase/supabase-return-open-items.sql ausführen.' },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: 'Position konnte nicht geladen werden.' }, { status: 500 });
  }
  if (!row) return NextResponse.json({ error: 'Position nicht gefunden.' }, { status: 404 });

  if (action === 'remind' || action === 'bill') {
    if (row.status !== 'open') {
      return NextResponse.json({ error: 'Position ist bereits erledigt.' }, { status: 409 });
    }
    const { data: booking } = await supabase
      .from('bookings')
      .select('id, customer_name, customer_email, user_id, unit_id')
      .eq('id', row.booking_id as string)
      .maybeSingle();
    const customerEmail = String(booking?.customer_email ?? '').trim();
    const customerName = String(booking?.customer_name ?? '').trim() || 'Kunde';
    if (!customerEmail) {
      return NextResponse.json(
        { error: 'Bei der Buchung ist keine Kunden-E-Mail hinterlegt.' },
        { status: 422 },
      );
    }

    if (action === 'remind') {
      if (row.resolution !== 'follow_up') {
        return NextResponse.json({ error: 'Erinnern geht nur bei „Kommt nach".' }, { status: 400 });
      }
      let dueDate: string | null = (row.due_date as string | null) ?? null;
      const rawDue = String(body.dueDate ?? '').slice(0, 10);
      if (rawDue) {
        if (!DATE_RE.test(rawDue) || Number.isNaN(Date.parse(`${rawDue}T00:00:00Z`))) {
          return NextResponse.json({ error: 'Ungültige Frist.' }, { status: 400 });
        }
        if (rawDue < getBerlinDateString()) {
          return NextResponse.json({ error: 'Die neue Frist liegt in der Vergangenheit.' }, { status: 400 });
        }
        dueDate = rawDue;
      }
      try {
        await sendReturnFollowUpRequest({
          bookingId: row.booking_id as string,
          customerName,
          customerEmail,
          items: [{ label: row.label as string, qty: Number(row.qty) || 1 }],
          dueDate,
          reminder: true,
        });
      } catch (err) {
        console.error('[return-open-items] reminder email failed:', err);
        return NextResponse.json({ error: 'E-Mail konnte nicht gesendet werden.' }, { status: 502 });
      }
      const noteLine = `Erinnerung gesendet am ${getBerlinDateString()}${dueDate ? ` (Frist ${dueDate})` : ''}`;
      const prevNotes = String(row.notes ?? '').trim();
      await supabase
        .from('booking_return_open_items')
        .update({
          due_date: dueDate,
          notes: (prevNotes ? `${prevNotes}\n${noteLine}` : noteLine).slice(0, 2000),
        })
        .eq('id', id)
        .eq('status', 'open');

      await logAudit({
        action: 'return_open_item.remind',
        entityType: 'booking',
        entityId: row.booking_id as string,
        changes: { open_item_id: id, label: row.label, due_date: dueDate },
        request: req,
      });
      return NextResponse.json({ success: true, due_date: dueDate });
    }

    // ── action === 'bill' ──
    if (row.sale_booking_id) {
      return NextResponse.json({ error: 'Für diese Position gibt es schon eine Rechnung.' }, { status: 409 });
    }
    const unitValue = Math.round(Math.min(Math.max(Number(body.unitValue), 0), 100_000) * 100) / 100;
    if (!Number.isFinite(unitValue) || unitValue <= 0) {
      return NextResponse.json({ error: 'Bitte einen Betrag größer 0 angeben.' }, { status: 400 });
    }
    const qty = Math.max(1, Number(row.qty) || 1);

    const sale = await createSale({
      customerName,
      customerEmail,
      userId: (booking?.user_id as string | null) ?? null,
      sourceBookingId: row.booking_id as string,
      items: [{ name: `Ersatz: ${row.label}`, qty, unit_price: unitValue }],
    });
    if (!sale.success || !sale.bookingId) {
      return NextResponse.json(
        { error: sale.error || 'Rechnung konnte nicht erstellt werden.' },
        { status: sale.status ?? 500 },
      );
    }

    const noteLine = `In Rechnung gestellt am ${getBerlinDateString()} (Kunde hat nicht nachgeschickt)`;
    const prevNotes = String(row.notes ?? '').trim();
    await supabase
      .from('booking_return_open_items')
      .update({
        resolution: 'replace',
        unit_value: unitValue,
        total_value: Math.round(unitValue * qty * 100) / 100,
        sale_booking_id: sale.bookingId,
        notes: (prevNotes ? `${prevNotes}\n${noteLine}` : noteLine).slice(0, 2000),
      })
      .eq('id', id)
      .eq('status', 'open');

    // Zurückgehaltene Exemplare gelten jetzt als verloren (nicht mehr
    // vermietbar). Bestandteile ('part') haben kein Inventar.
    const heldUnitIds: string[] = Array.isArray(row.accessory_unit_ids)
      ? (row.accessory_unit_ids as string[]).filter(Boolean)
      : [];
    if (row.kind === 'accessory' && heldUnitIds.length > 0) {
      await supabase
        .from('accessory_units')
        .update({ status: 'lost' })
        .in('id', heldUnitIds)
        .eq('status', 'rented')
        .then(undefined, () => undefined);
      if (row.accessory_id) {
        await syncAccessoryQty(supabase, row.accessory_id as string).catch(() => {});
      }
    }
    if (row.kind === 'camera' && booking?.unit_id) {
      await supabase
        .from('product_units')
        .update({ status: 'retired' })
        .eq('id', booking.unit_id as string)
        .neq('status', 'retired')
        .then(undefined, () => undefined);
    }

    await logAudit({
      action: 'return_open_item.bill',
      entityType: 'booking',
      entityId: row.booking_id as string,
      changes: { open_item_id: id, label: row.label, qty, unit_value: unitValue, sale_booking_id: sale.bookingId },
      request: req,
    });
    return NextResponse.json({ success: true, sale_booking_id: sale.bookingId });
  }

  // Atomarer Flip: nur eine noch offene Position lässt sich abschliessen.
  // Bei Doppelklick gewinnt genau einer, der zweite bekommt 409.
  const { data: updated, error: updateErr } = await supabase
    .from('booking_return_open_items')
    .update({
      status: action,
      resolved_at: new Date().toISOString(),
      ...(typeof body.notes === 'string' && body.notes.trim()
        ? { notes: body.notes.trim().slice(0, 2000) }
        : {}),
    })
    .eq('id', id)
    .eq('status', 'open')
    .select('id')
    .maybeSingle();

  if (updateErr) {
    return NextResponse.json({ error: 'Speichern fehlgeschlagen.' }, { status: 500 });
  }
  if (!updated) {
    return NextResponse.json({ error: 'Position ist bereits erledigt.' }, { status: 409 });
  }

  // 'received' = doch noch eingetroffen → die zurückgehaltenen Exemplare
  // wieder freigeben (setzt auch accessories.available_qty nach).
  const unitIds: string[] = Array.isArray(row.accessory_unit_ids)
    ? (row.accessory_unit_ids as string[]).filter(Boolean)
    : [];
  if (action === 'received' && unitIds.length > 0) {
    await releaseAccessoryUnitsFromBooking(row.booking_id as string, unitIds)
      .catch((err) => console.error('[return-open-items] release failed:', err));
  }

  await logAudit({
    action: 'return_open_item.resolve',
    entityType: 'booking',
    entityId: row.booking_id as string,
    changes: {
      open_item_id: id,
      label: row.label,
      qty: row.qty,
      resolution: row.resolution,
      new_status: action,
    },
    request: req,
  });

  return NextResponse.json({ success: true });
}
