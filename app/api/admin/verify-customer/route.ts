import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';
import { sendVerificationRejected } from '@/lib/email';

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

    return NextResponse.json({ success: true, status });
  } catch (err) {
    console.error('POST /api/admin/verify-customer error:', err);
    return NextResponse.json({ error: 'Serverfehler.' }, { status: 500 });
  }
}
