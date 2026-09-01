import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { getCurrentAdminUser } from '@/lib/admin-auth';
import { logAudit } from '@/lib/audit';
import { berlinLocalInputToUTC } from '@/lib/timezone';
import { sendAppointmentConfirmation } from '@/lib/email';

/**
 * POST /api/admin/booking/[id]/coordination-done
 *
 * Markiert für eine Abhol-Buchung die Abhol- bzw. Rückgabe-Terminabsprache als
 * erledigt („Termin vereinbart"). Sobald der Marker gesetzt ist, verschwindet
 * die „📞 Abhol-/Rückgabetermin vereinbaren"-Aufgabe aus dem Dashboard-Widget
 * (das die Aufgabe sonst LIVE aus Status + 48h-Fenster berechnet).
 *
 * Body:
 *   { type: 'pickup' | 'return',
 *     done?: boolean,                       // false → Marker + Termin leeren
 *     appointment?: {                       // der ausgemachte Termin
 *       date: 'YYYY-MM-DD',
 *       timeFrom: 'HH:MM',
 *       timeTo?: 'HH:MM',                   // gesetzt = Zeitraum
 *       location?: string,
 *       note?: string,
 *     },
 *     notifyCustomer?: boolean }            // Default true, wenn appointment da
 *
 * Ist ein `appointment` dabei, wird der Termin an der Buchung gespeichert und
 * (sofern eine Kunden-E-Mail hinterlegt ist) eine Terminbestätigung mit Ort,
 * Datum und Uhrzeit verschickt.
 *
 * Permission via Prefix /api/admin/booking → tagesgeschaeft (Middleware).
 */

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Spalten aus der Termin-Migration — bei fehlender Migration gestript. */
const APPOINTMENT_COLUMNS = [
  'pickup_appointment_at', 'pickup_appointment_end_at',
  'pickup_appointment_location', 'pickup_appointment_note',
  'return_appointment_at', 'return_appointment_end_at',
  'return_appointment_location', 'return_appointment_note',
];

function isMissingColumnError(msg: string): boolean {
  return /column|schema cache|PGRST(204|205)|42703/i.test(msg);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentAdminUser();
  if (!user) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }

  const { id } = await params;

  let body: {
    type?: unknown;
    done?: unknown;
    appointment?: unknown;
    notifyCustomer?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Ungültiger Request-Body.' }, { status: 400 });
  }

  const type = body.type === 'pickup' || body.type === 'return' ? body.type : null;
  if (!type) {
    return NextResponse.json(
      { error: "type muss 'pickup' oder 'return' sein." },
      { status: 400 },
    );
  }
  const done = body.done !== false; // Default: als vereinbart markieren

  // ── Termin auswerten (optional) ────────────────────────────────────────────
  const raw = (body.appointment ?? null) as Record<string, unknown> | null;
  let appointment: {
    startIso: string;
    endIso: string | null;
    location: string;
    note: string | null;
  } | null = null;

  if (done && raw && typeof raw === 'object') {
    const date = typeof raw.date === 'string' ? raw.date.trim() : '';
    const timeFrom = typeof raw.timeFrom === 'string' ? raw.timeFrom.trim() : '';
    const timeToRaw = typeof raw.timeTo === 'string' ? raw.timeTo.trim() : '';
    const location = typeof raw.location === 'string' ? raw.location.trim().slice(0, 500) : '';
    const note = typeof raw.note === 'string' ? raw.note.trim().slice(0, 1000) : '';

    if (!DATE_RE.test(date)) {
      return NextResponse.json({ error: 'Bitte ein gültiges Datum angeben.' }, { status: 422 });
    }
    if (!TIME_RE.test(timeFrom)) {
      return NextResponse.json({ error: 'Bitte eine gültige Uhrzeit angeben.' }, { status: 422 });
    }
    if (timeToRaw && !TIME_RE.test(timeToRaw)) {
      return NextResponse.json({ error: 'Die Endzeit ist ungültig.' }, { status: 422 });
    }
    if (!location) {
      return NextResponse.json({ error: 'Bitte einen Ort angeben.' }, { status: 422 });
    }
    if (timeToRaw && timeToRaw <= timeFrom) {
      return NextResponse.json(
        { error: 'Die Endzeit muss nach der Startzeit liegen.' },
        { status: 422 },
      );
    }

    // Der Admin gibt Berliner Ortszeit ein → in UTC umrechnen (DST-sicher).
    const startIso = berlinLocalInputToUTC(`${date}T${timeFrom}`);
    const endIso = timeToRaw ? berlinLocalInputToUTC(`${date}T${timeToRaw}`) : null;
    if (!startIso) {
      return NextResponse.json({ error: 'Termin konnte nicht gelesen werden.' }, { status: 422 });
    }
    appointment = { startIso, endIso, location, note: note || null };
  }

  const supabase = createServiceClient();

  const doneColumn =
    type === 'pickup' ? 'pickup_coordination_done_at' : 'return_coordination_done_at';
  const prefix = type === 'pickup' ? 'pickup' : 'return';

  const update: Record<string, string | null> = {
    [doneColumn]: done ? new Date().toISOString() : null,
  };
  if (done && appointment) {
    update[`${prefix}_appointment_at`] = appointment.startIso;
    update[`${prefix}_appointment_end_at`] = appointment.endIso;
    update[`${prefix}_appointment_location`] = appointment.location;
    update[`${prefix}_appointment_note`] = appointment.note;
  } else if (!done) {
    // Zurücksetzen räumt den hinterlegten Termin mit weg.
    update[`${prefix}_appointment_at`] = null;
    update[`${prefix}_appointment_end_at`] = null;
    update[`${prefix}_appointment_location`] = null;
    update[`${prefix}_appointment_note`] = null;
  }

  const warnings: string[] = [];

  async function runUpdate(payload: Record<string, string | null>) {
    return supabase
      .from('bookings')
      .update(payload)
      .eq('id', id)
      .select('id, customer_name, customer_email, product_name, rental_from, rental_to')
      .maybeSingle();
  }

  let { data: updated, error } = await runUpdate(update);

  // Defensiv: Migration supabase-bookings-coordination-appointment.sql evtl.
  // noch nicht durch → Termin-Spalten strippen und den reinen „vereinbart"-
  // Marker trotzdem setzen (die Bestätigungsmail geht dennoch raus).
  if (error && isMissingColumnError(error.message || '')) {
    const stripped: Record<string, string | null> = {};
    for (const [k, v] of Object.entries(update)) {
      if (!APPOINTMENT_COLUMNS.includes(k)) stripped[k] = v;
    }
    warnings.push('migration_pending');
    ({ data: updated, error } = await runUpdate(stripped));
  }

  if (error) {
    // Auch der Marker fehlt → supabase-bookings-coordination-done.sql aussteht.
    if (isMissingColumnError(error.message || '') || /coordination_done/i.test(error.message || '')) {
      return NextResponse.json(
        { error: 'Migration ausstehend — supabase-bookings-coordination-done.sql ausführen.' },
        { status: 503 },
      );
    }
    console.error('[coordination-done] update error:', error);
    return NextResponse.json({ error: 'Konnte nicht gespeichert werden.' }, { status: 500 });
  }
  if (!updated) {
    return NextResponse.json({ error: 'Buchung nicht gefunden.' }, { status: 404 });
  }

  // ── Terminbestätigung an den Kunden (non-blocking für den Speichervorgang) ──
  let emailSent = false;
  let emailError: string | null = null;
  const notify = body.notifyCustomer !== false;

  if (done && appointment && notify) {
    const to = (updated.customer_email as string | null) ?? '';
    if (!to) {
      emailError = 'Keine E-Mail-Adresse bei der Buchung hinterlegt.';
    } else {
      try {
        await sendAppointmentConfirmation({
          bookingId: id,
          customerName: (updated.customer_name as string | null) || 'Kunde',
          customerEmail: to,
          productName: (updated.product_name as string | null) || '',
          type,
          startsAt: appointment.startIso,
          endsAt: appointment.endIso,
          location: appointment.location,
          note: appointment.note,
          rentalFrom: (updated.rental_from as string | null) ?? undefined,
          rentalTo: (updated.rental_to as string | null) ?? undefined,
        });
        emailSent = true;
      } catch (e) {
        emailError = e instanceof Error ? e.message : 'E-Mail konnte nicht gesendet werden.';
        console.error('[coordination-done] email error:', e);
      }
    }
  }

  await logAudit({
    action: 'booking.coordination_done',
    entityType: 'booking',
    entityId: id,
    changes: {
      type,
      done,
      source: 'dashboard_quick_action',
      appointment: appointment
        ? {
            starts_at: appointment.startIso,
            ends_at: appointment.endIso,
            location: appointment.location,
          }
        : null,
      email_sent: emailSent,
      warnings: warnings.length > 0 ? warnings : undefined,
    },
    request: req,
  });

  return NextResponse.json({
    success: true,
    type,
    done,
    emailSent,
    emailError,
    warnings: warnings.length > 0 ? warnings : undefined,
  });
}
