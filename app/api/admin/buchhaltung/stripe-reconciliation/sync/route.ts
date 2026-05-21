import { NextRequest, NextResponse } from 'next/server';
import { checkAdminAuth } from '@/lib/admin-auth';
import { logAudit } from '@/lib/audit';
import { runStripeSync } from '@/lib/buchhaltung/stripe-sync';

export async function POST(req: NextRequest) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }

  const body = await req.json();
  const { from, to } = body;

  if (!from || !to) {
    return NextResponse.json({ error: 'from und to erforderlich.' }, { status: 400 });
  }

  try {
    const { synced } = await runStripeSync({ from, to });

    await logAudit({
      action: 'stripe.sync_run',
      entityType: 'stripe_transaction',
      changes: { from, to, synced },
      request: req,
    });

    return NextResponse.json({ synced });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Sync fehlgeschlagen.';
    console.error('POST stripe-reconciliation/sync error:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
