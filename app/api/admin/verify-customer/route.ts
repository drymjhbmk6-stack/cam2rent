import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';

/**
 * POST /api/admin/verify-customer
 * Setzt den Verifizierungsstatus eines Kunden.
 * Body: { customerId: string, status: 'verified' | 'rejected' }
 */
export async function POST(req: NextRequest) {
  try {
    const { customerId, status } = await req.json();

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

    await logAudit({
      action: status === 'verified' ? 'customer.verify' : 'customer.reject_verification',
      entityType: 'customer',
      entityId: customerId,
      changes: { status },
      request: req,
    });

    return NextResponse.json({ success: true, status });
  } catch (err) {
    console.error('POST /api/admin/verify-customer error:', err);
    return NextResponse.json({ error: 'Serverfehler.' }, { status: 500 });
  }
}
