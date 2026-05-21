import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';
import { sendVerificationReminder } from '@/lib/email';

/**
 * POST /api/admin/send-verification-reminder
 * Schickt dem Kunden eine Erinnerungs-E-Mail mit Link zur Konto-Verifizierung.
 * Body: { customerId: string }
 */
export async function POST(req: NextRequest) {
  try {
    const { customerId } = await req.json();

    if (!customerId || typeof customerId !== 'string') {
      return NextResponse.json({ error: 'customerId erforderlich.' }, { status: 400 });
    }

    const supabase = createServiceClient();

    const [{ data: profile }, { data: authUserResult }] = await Promise.all([
      supabase
        .from('profiles')
        .select('full_name, verification_status')
        .eq('id', customerId)
        .maybeSingle(),
      supabase.auth.admin.getUserById(customerId),
    ]);

    if (profile?.verification_status === 'verified') {
      return NextResponse.json(
        { error: 'Der Kunde ist bereits verifiziert.' },
        { status: 409 }
      );
    }

    const email = authUserResult?.user?.email;
    if (!email) {
      return NextResponse.json(
        { error: 'Für diesen Kunden ist keine E-Mail-Adresse hinterlegt.' },
        { status: 400 }
      );
    }

    const name =
      profile?.full_name ||
      authUserResult?.user?.user_metadata?.full_name ||
      'Kunde';

    await sendVerificationReminder({ customerName: name, customerEmail: email });

    await logAudit({
      action: 'customer.verification_reminder',
      entityType: 'customer',
      entityId: customerId,
      changes: { email },
      request: req,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('POST /api/admin/send-verification-reminder error:', err);
    return NextResponse.json(
      { error: 'Erinnerung konnte nicht gesendet werden.' },
      { status: 500 }
    );
  }
}
