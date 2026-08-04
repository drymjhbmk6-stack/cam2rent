import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth, getCurrentAdminUser } from '@/lib/admin-auth';
import { isTestMode, getSiteUrl } from '@/lib/env-mode';
import { isUserTester } from '@/lib/tester-mode';
import { findCameraOverbookingConflict } from '@/lib/camera-availability-check';
import { computeAccessoryAvailability } from '@/lib/accessory-availability';
import { logAudit } from '@/lib/audit';
import { normalizeReservationItems, type ReservationLine } from '@/lib/reservation-holds';

export const runtime = 'nodejs';

/** 48 Stunden ab Anlage. */
const RESERVATION_HOURS = 48;

function isMissingTable(msg: string | undefined): boolean {
  return /reservations|relation .* does not exist|schema cache|PGRST|42P01/i.test(msg || '');
}

interface CreateBody {
  customerUserId?: string;
  rentalFrom?: string;
  rentalTo?: string;
  deliveryMode?: string;
  shippingMethod?: string;
  lines?: Array<{
    productId?: string;
    qty?: number;
    haftung?: string;
    accessories?: Array<{ accessory_id?: string; qty?: number }>;
  }>;
  sendEmail?: boolean;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ── POST: Reservierung anlegen ──────────────────────────────────────────────
export async function POST(req: NextRequest) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });
  }

  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: 'Ungültiger Body' }, { status: 400 });
  }

  const customerUserId = (body.customerUserId ?? '').trim();
  const rentalFrom = (body.rentalFrom ?? '').trim();
  const rentalTo = (body.rentalTo ?? '').trim();
  const deliveryMode: 'versand' | 'abholung' = body.deliveryMode === 'abholung' ? 'abholung' : 'versand';
  const shippingMethod: 'standard' | 'express' = body.shippingMethod === 'express' ? 'express' : 'standard';

  if (!customerUserId) {
    return NextResponse.json({ error: 'Bestandskunde erforderlich (customerUserId).' }, { status: 400 });
  }
  if (!DATE_RE.test(rentalFrom) || !DATE_RE.test(rentalTo)) {
    return NextResponse.json({ error: 'Mietzeitraum (rentalFrom/rentalTo) im Format YYYY-MM-DD erforderlich.' }, { status: 400 });
  }
  if (rentalTo < rentalFrom) {
    return NextResponse.json({ error: 'Enddatum liegt vor dem Startdatum.' }, { status: 400 });
  }

  // Zeilen normalisieren (nutzt denselben Sanitizer wie die Hold-Quelle).
  const { lines } = normalizeReservationItems({ lines: body.lines });
  if (lines.length === 0) {
    return NextResponse.json({ error: 'Mindestens eine Kamera erforderlich.' }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Bestandskunde laden (E-Mail Pflicht — der Link geht per Mail raus).
  const { data: authData, error: authErr } = await supabase.auth.admin.getUserById(customerUserId);
  if (authErr || !authData?.user) {
    return NextResponse.json({ error: 'Kunde nicht gefunden.' }, { status: 404 });
  }
  const customerEmail = authData.user.email ?? '';
  if (!customerEmail) {
    return NextResponse.json({ error: 'Kunde hat keine E-Mail-Adresse hinterlegt.' }, { status: 422 });
  }
  let customerName = (authData.user.user_metadata?.full_name as string | undefined) ?? '';
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', customerUserId)
      .maybeSingle();
    if (profile?.full_name) customerName = profile.full_name as string;
  } catch { /* Name-Fallback bleibt */ }

  // ── Verfügbarkeit prüfen (Kamera + Zubehör), bevor reserviert wird ─────────
  // Kameras: benötigte Einheiten pro Modell aufsummieren.
  const neededByProduct = new Map<string, number>();
  for (const l of lines) {
    neededByProduct.set(l.productId, (neededByProduct.get(l.productId) ?? 0) + Math.max(1, l.qty));
  }
  for (const [productId, needed] of neededByProduct) {
    const conflict = await findCameraOverbookingConflict(supabase, {
      productId,
      rentalFrom,
      rentalTo,
      deliveryMode,
      neededUnits: needed,
    });
    if (conflict) {
      return NextResponse.json(
        {
          error: `Nicht genug Kameras verfügbar: ${conflict.productName} am ${conflict.day} (frei: ${conflict.available}).`,
          code: 'NOT_AVAILABLE',
        },
        { status: 409 },
      );
    }
  }

  // Zubehör: benötigte Menge pro accessory_id aufsummieren und gegen Restbestand prüfen.
  const neededAcc = new Map<string, number>();
  for (const l of lines) {
    for (const a of l.accessories) {
      neededAcc.set(a.accessory_id, (neededAcc.get(a.accessory_id) ?? 0) + a.qty * Math.max(1, l.qty));
    }
  }
  if (neededAcc.size > 0) {
    const firstProductId = lines[0].productId;
    const avail = await computeAccessoryAvailability({
      from: rentalFrom,
      to: rentalTo,
      productId: firstProductId,
      deliveryMode,
    });
    const remainingById = new Map(avail.accessories.map((a) => [a.id, a.available_qty_remaining]));
    for (const [accId, need] of neededAcc) {
      // Set-IDs / interne Positionen ohne eigenen Bestand ueberspringt der
      // Check (kein Eintrag → nicht hart blockieren, analog Set-Buchungen).
      const remaining = remainingById.get(accId);
      if (remaining !== undefined && remaining < need) {
        const name = avail.accessories.find((a) => a.id === accId)?.name ?? accId;
        return NextResponse.json(
          {
            error: `Nicht genug Zubehör verfügbar: ${name} (benötigt ${need}, frei ${remaining}).`,
            code: 'NOT_AVAILABLE',
          },
          { status: 409 },
        );
      }
    }
  }

  // ── Reservierung schreiben ──────────────────────────────────────────────────
  const isTest = (await isTestMode()) || (await isUserTester(customerUserId));
  const token = randomBytes(24).toString('base64url');
  const expiresAt = new Date(Date.now() + RESERVATION_HOURS * 60 * 60_000).toISOString();
  const admin = await getCurrentAdminUser();
  const itemsPayload: { lines: ReservationLine[] } = { lines };

  const { data: inserted, error: insErr } = await supabase
    .from('reservations')
    .insert({
      token,
      user_id: customerUserId,
      customer_name: customerName || null,
      customer_email: customerEmail,
      items: itemsPayload,
      rental_from: rentalFrom,
      rental_to: rentalTo,
      delivery_mode: deliveryMode,
      shipping_method: shippingMethod,
      is_test: isTest,
      status: 'open',
      expires_at: expiresAt,
      created_by: admin?.name ?? admin?.id ?? 'admin',
    })
    .select('id')
    .single();

  if (insErr) {
    if (isMissingTable(insErr.message)) {
      return NextResponse.json(
        { error: 'Reservierungen sind noch nicht aktiviert (Migration supabase-reservations.sql fehlt).' },
        { status: 503 },
      );
    }
    console.error('[reservierung] insert error:', insErr);
    return NextResponse.json({ error: 'Reservierung konnte nicht angelegt werden.' }, { status: 500 });
  }

  const siteUrl = await getSiteUrl();
  const url = `${siteUrl}/reservierung/${token}`;

  // E-Mail mit Link an den Kunden (best-effort).
  let emailSent = false;
  let emailError: string | null = null;
  if (body.sendEmail !== false) {
    try {
      const { sendReservationLink } = await import('@/lib/email');
      await sendReservationLink({
        to: customerEmail,
        customerName: customerName || null,
        rentalFrom,
        rentalTo,
        url,
        expiresAt,
      });
      emailSent = true;
    } catch (mailErr) {
      emailError = mailErr instanceof Error ? mailErr.message : String(mailErr);
      console.error('[reservierung] Mail-Versand fehlgeschlagen:', emailError);
    }
  }

  await logAudit({
    action: 'reservation.create',
    entityType: 'reservation',
    entityId: inserted.id,
    changes: { customerUserId, rentalFrom, rentalTo, deliveryMode, lines, expiresAt },
    request: req,
  });

  return NextResponse.json({ ok: true, reservationId: inserted.id, token, url, emailSent, emailError });
}

// ── GET: Liste der Reservierungen (Admin-Verwaltung) ────────────────────────
export async function GET() {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });
  }
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('reservations')
    .select('id, token, user_id, customer_name, customer_email, items, rental_from, rental_to, delivery_mode, status, expires_at, created_at')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) {
    if (isMissingTable(error.message)) return NextResponse.json({ reservations: [], migration_pending: true });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ reservations: data ?? [] });
}

// ── DELETE: Reservierung zurückziehen ───────────────────────────────────────
export async function DELETE(req: NextRequest) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });
  }
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id erforderlich' }, { status: 400 });

  const supabase = createServiceClient();
  const { error } = await supabase
    .from('reservations')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'open');
  if (error) {
    if (isMissingTable(error.message)) return NextResponse.json({ error: 'Migration fehlt' }, { status: 503 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logAudit({ action: 'reservation.cancel', entityType: 'reservation', entityId: id, request: req });
  return NextResponse.json({ ok: true });
}
