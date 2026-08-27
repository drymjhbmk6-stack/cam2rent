import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { getCurrentAdminUser } from '@/lib/admin-auth';
import { logAudit } from '@/lib/audit';
import { deleteCustomerCore } from '@/lib/delete-customer';
import { invalidateTesterCache } from '@/lib/tester-mode';

/**
 * POST /api/admin/kunden/delete
 *
 * Loescht ein Kundenkonto vollstaendig — der Fall "Kunde bittet um Loeschung
 * seiner Daten nach DSGVO Art. 17".
 *
 * Body:
 *   {
 *     customerId: string,
 *     reason: string,            // Pflicht, mind. 5 Zeichen (Rechenschaftspflicht Art. 5 Abs. 2)
 *     confirm: 'LÖSCHEN',        // Tipp-Bestaetigung gegen Fehlklicks
 *     notifyCustomer?: boolean,  // Default true — Loeschbestaetigung per E-Mail
 *   }
 *
 * Gates:
 *  - NUR Owner (analog anonymize-customer — Massen-Loeschung / Spurenverwischung
 *    darf kein Mitarbeiter mit `kunden`-Permission ausloesen).
 *  - Keine Selbst-Loeschung.
 *  - Keine laufenden Buchungen. Solange eine Kamera beim Kunden ist oder Geld
 *    offen steht, wird nicht geloescht (409 mit der Liste der Buchungen).
 *
 * Die eigentliche Loeschmechanik steckt in `lib/delete-customer.ts` und
 * entscheidet selbst, ob das Auth-Konto hart geloescht werden kann (Kunde ohne
 * Buchungen) oder ob die Buchungs-/Rechnungsdaten wegen der 10-jaehrigen
 * Aufbewahrungspflicht stehen bleiben muessen (Art. 17 Abs. 3 lit. b DSGVO).
 */

/** Buchungsstatus, bei denen noch etwas offen ist → Loeschung blockiert. */
const BLOCKING_STATUSES = [
  'pending_verification',
  'awaiting_payment',
  'confirmed',
  'preparing_shipment',
  'awaiting_pickup',
  'shipped',
  'delivered',
  'picked_up',
  'postponed',
  'damaged',
];

export async function POST(req: NextRequest) {
  try {
    const me = await getCurrentAdminUser();
    if (!me || me.role !== 'owner') {
      return NextResponse.json(
        { error: 'Nur Owner dürfen Kundenkonten löschen.' },
        { status: 403 },
      );
    }

    const body = (await req.json().catch(() => ({}))) as {
      customerId?: string;
      reason?: string;
      confirm?: string;
      notifyCustomer?: boolean;
    };

    const customerId = typeof body.customerId === 'string' ? body.customerId.trim() : '';
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    const confirm = typeof body.confirm === 'string' ? body.confirm.trim().toUpperCase() : '';

    if (!customerId) {
      return NextResponse.json({ error: 'Kunden-ID fehlt.' }, { status: 400 });
    }
    if (confirm !== 'LÖSCHEN' && confirm !== 'LOESCHEN') {
      return NextResponse.json(
        { error: 'Bitte zur Bestätigung LÖSCHEN eintippen.' },
        { status: 400 },
      );
    }
    if (reason.length < 5) {
      return NextResponse.json(
        { error: 'Bitte einen Grund angeben (mind. 5 Zeichen) — z.B. „Löschanfrage des Kunden vom TT.MM.JJJJ".' },
        { status: 400 },
      );
    }
    if (me.id !== 'legacy-env' && me.id === customerId) {
      return NextResponse.json({ error: 'Selbst-Löschung nicht erlaubt.' }, { status: 400 });
    }

    const supabase = createServiceClient();

    // ── Kundendaten fuer Gate, Mail + Protokoll merken (vor der Loeschung) ──
    let customerName = 'Kunde';
    let customerEmail: string | null = null;
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', customerId)
        .maybeSingle();
      if (profile?.full_name) customerName = profile.full_name as string;
    } catch { /* egal */ }
    try {
      const { data: authUser } = await supabase.auth.admin.getUserById(customerId);
      customerEmail = authUser?.user?.email ?? null;
    } catch { /* egal */ }

    const hasUsableEmail = !!customerEmail && !customerEmail.endsWith('@anonymisiert.local');

    // ── Gate: laufende Buchungen ───────────────────────────────────────────
    // Kontogebundene Buchungen (user_id) UND Gastbuchungen unter derselben
    // E-Mail — solange irgendwo eine Kamera unterwegs ist oder Geld offen
    // steht, wird nicht geloescht.
    const { data: openOwn, error: openErr } = await supabase
      .from('bookings')
      .select('id, status')
      .eq('user_id', customerId)
      .in('status', BLOCKING_STATUSES)
      .limit(20);

    if (openErr) {
      console.error('[kunden/delete] booking check error:', openErr);
      return NextResponse.json(
        { error: 'Buchungen konnten nicht geprüft werden.' },
        { status: 500 },
      );
    }

    let openGuest: { id: string; status: string }[] = [];
    if (hasUsableEmail) {
      const { data } = await supabase
        .from('bookings')
        .select('id, status')
        .is('user_id', null)
        .ilike('customer_email', customerEmail as string)
        .in('status', BLOCKING_STATUSES)
        .limit(20);
      openGuest = (data ?? []) as { id: string; status: string }[];
    }

    const openBookings = [...(openOwn ?? []), ...openGuest];
    if (openBookings.length) {
      return NextResponse.json(
        {
          error:
            'Der Kunde hat noch laufende Buchungen. Bitte erst abschließen oder stornieren, dann löschen.',
          openBookings: openBookings.map((b) => ({ id: b.id, status: b.status })),
        },
        { status: 409 },
      );
    }

    // Aufbewahrungspflichtige Buchungen zaehlen (fuer die Bestaetigungsmail):
    // eigene + Gastbuchungen unter derselben Adresse.
    const { count: ownBookings } = await supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', customerId);
    let guestBookings = 0;
    if (hasUsableEmail) {
      const { count } = await supabase
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .is('user_id', null)
        .ilike('customer_email', customerEmail as string);
      guestBookings = count ?? 0;
    }
    const totalBookings = (ownBookings ?? 0) + guestBookings;

    // ── Bestaetigungs-Mail ZUERST (danach ist die Adresse freigegeben) ──────
    let emailSent = false;
    let emailError: string | null = null;
    const notify = body.notifyCustomer !== false;
    if (notify && hasUsableEmail && customerEmail) {
      try {
        const { sendAccountDeletionConfirmation } = await import('@/lib/email');
        await sendAccountDeletionConfirmation({
          customerName,
          customerEmail,
          retainedBookings: totalBookings,
        });
        emailSent = true;
      } catch (e) {
        emailError = e instanceof Error ? e.message : String(e);
        console.error('[kunden/delete] Bestätigungsmail fehlgeschlagen:', e);
      }
    }

    // ── Loeschung ──────────────────────────────────────────────────────────
    const result = await deleteCustomerCore(supabase, customerId);
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error ?? 'Löschung fehlgeschlagen.', warnings: result.warnings },
        { status: 500 },
      );
    }

    invalidateTesterCache(customerId);

    // ── Loeschprotokoll (Rechenschaftspflicht Art. 5 Abs. 2 DSGVO) ─────────
    // Bewusst OHNE Klarnamen/E-Mail: das Protokoll darf die geloeschten Daten
    // nicht konservieren. Nur ID, Grund, Modus und Mengenangaben.
    await logAudit({
      action: 'customer.delete',
      entityType: 'customer',
      entityId: customerId,
      changes: {
        reason,
        mode: result.mode,
        bookings_retained: result.bookingCount,
        guest_bookings_retained: guestBookings,
        removed: result.removed,
        email_confirmation_sent: emailSent,
        warnings: result.warnings.slice(0, 10),
      },
      request: req,
    });

    return NextResponse.json({
      success: true,
      mode: result.mode,
      bookingsRetained: totalBookings,
      removed: result.removed,
      warnings: result.warnings,
      emailSent,
      emailError,
    });
  } catch (err) {
    console.error('POST /api/admin/kunden/delete error:', err);
    return NextResponse.json({ error: 'Serverfehler beim Löschen.' }, { status: 500 });
  }
}
