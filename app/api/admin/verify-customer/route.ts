import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';
import { sendVerificationRejected } from '@/lib/email';
import { approvePendingBooking } from '@/lib/booking-approve';

/**
 * POST /api/admin/verify-customer
 * Setzt den Verifizierungsstatus eines Kunden.
 * Body: { customerId: string, status: 'verified' | 'rejected', reason?: string }
 *
 * Bei status='rejected' wird zusaetzlich eine E-Mail mit Re-Upload-Link an
 * den Kunden geschickt. `reason` (optional) wird in die E-Mail uebernommen.
 */
export async function POST(req: NextRequest) {
  try {
    const { customerId, status, reason } = await req.json();

    if (!customerId || !['verified', 'rejected'].includes(status)) {
      return NextResponse.json(
        { error: 'customerId und status (verified/rejected) erforderlich.' },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();

    // Vor dem Verifizieren: Stammdaten-Pflichtcheck.
    // Express-Signup legt Konten ohne full_name/Adresse an (Sweep 7 #23),
    // damit ein Angreifer nicht im Namen fremder Mailadressen Daten persistieren
    // kann. Bevor wir verifizieren, muss der echte Besitzer einmal Name +
    // Adresse ergaenzt haben — sonst hat der Mietvertrag keine Vertragspartei.
    if (status === 'verified') {
      const { data: profile, error: profileErr } = await supabase
        .from('profiles')
        .select('full_name, address_street, address_zip, address_city')
        .eq('id', customerId)
        .maybeSingle();

      if (profileErr || !profile) {
        return NextResponse.json(
          { error: 'Kundenprofil nicht gefunden.' },
          { status: 404 }
        );
      }

      const missing: string[] = [];
      if (!profile.full_name?.trim()) missing.push('Name');
      if (!profile.address_street?.trim()) missing.push('Strasse');
      if (!profile.address_zip?.trim()) missing.push('PLZ');
      if (!profile.address_city?.trim()) missing.push('Stadt');

      if (missing.length > 0) {
        return NextResponse.json(
          {
            error: 'STAMMDATEN_UNVOLLSTAENDIG',
            message: `Verifizierung blockiert — folgende Stammdaten fehlen: ${missing.join(', ')}. Der Kunde muss diese im Konto ergänzen, bevor er verifiziert werden kann.`,
            missing,
          },
          { status: 422 }
        );
      }
    }

    const updateData: Record<string, unknown> = {
      verification_status: status,
    };

    if (status === 'verified') {
      updateData.verified_at = new Date().toISOString();
    }

    const { error } = await supabase
      .from('profiles')
      .update(updateData)
      .eq('id', customerId);

    if (error) {
      console.error('verify-customer error:', error);
      return NextResponse.json({ error: 'Aktualisierung fehlgeschlagen.' }, { status: 500 });
    }

    // Bei Verifizierung: alle pending_verification-Buchungen des Kunden
    // automatisch freigeben (Stripe-Payment-Link erzeugen, Status auf
    // awaiting_payment) UND Zahlungslink-Mail rausschicken — sonst weiss
    // der Kunde nicht, dass er jetzt bezahlen kann, und der Admin haette
    // keinen Anhaltspunkt, dass er manuell senden muss.
    const autoApproved: Array<{ id: string }> = [];
    if (status === 'verified') {
      const { data: pendingBookings } = await supabase
        .from('bookings')
        .select('id')
        .eq('user_id', customerId)
        .eq('status', 'pending_verification');

      for (const b of pendingBookings ?? []) {
        const result = await approvePendingBooking(b.id, { sendEmail: true });
        if (result.success) {
          autoApproved.push({ id: b.id });
        } else {
          console.warn('[verify-customer] Auto-Approve fehlgeschlagen fuer', b.id, result.error);
        }
      }
    }

    // Bei Ablehnung: E-Mail an Kunden mit Re-Upload-Link
    if (status === 'rejected') {
      try {
        const [{ data: profile }, { data: authUserResult }] = await Promise.all([
          supabase.from('profiles').select('full_name').eq('id', customerId).maybeSingle(),
          supabase.auth.admin.getUserById(customerId),
        ]);
        const email = authUserResult?.user?.email;
        const name = profile?.full_name || authUserResult?.user?.user_metadata?.full_name || 'Kunde';
        if (email) {
          await sendVerificationRejected({
            customerName: name,
            customerEmail: email,
            reason: typeof reason === 'string' && reason.trim() ? reason.trim() : undefined,
          });
        }
      } catch (mailErr) {
        // Mail-Versand ist non-blocking — der Status-Wechsel bleibt erfolgreich,
        // selbst wenn die E-Mail nicht raus geht. Admin sieht es im E-Mail-Protokoll.
        console.error('verify-customer: Reject-Mail fehlgeschlagen:', mailErr);
      }
    }

    await logAudit({
      action: status === 'verified' ? 'customer.verify' : 'customer.reject_verification',
      entityType: 'customer',
      entityId: customerId,
      changes: { status, ...(reason ? { reason } : {}) },
      request: req,
    });

    return NextResponse.json({ success: true, status, autoApproved });
  } catch (err) {
    console.error('POST /api/admin/verify-customer error:', err);
    return NextResponse.json({ error: 'Serverfehler.' }, { status: 500 });
  }
}
