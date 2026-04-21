import { NextRequest, NextResponse } from 'next/server';
import { checkAdminAuth } from '@/lib/admin-auth';
import {
  getCheckoutConfig,
  setCheckoutConfig,
  DEFAULT_CHECKOUT_CONFIG,
  type CheckoutConfig,
} from '@/lib/checkout-config';
import { createServiceClient } from '@/lib/supabase';

export async function GET() {
  const ok = await checkAdminAuth();
  if (!ok) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const cfg = await getCheckoutConfig();
  return NextResponse.json({ config: cfg, defaults: DEFAULT_CHECKOUT_CONFIG });
}

export async function POST(req: NextRequest) {
  const ok = await checkAdminAuth();
  if (!ok) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = (await req.json().catch(() => null)) as Partial<CheckoutConfig> | null;
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }

  // Sanitizing: nur erlaubte Felder durchreichen
  const patch: Partial<CheckoutConfig> = {};
  if (typeof body.expressSignupEnabled === 'boolean') patch.expressSignupEnabled = body.expressSignupEnabled;
  if (typeof body.verificationDeferred === 'boolean') patch.verificationDeferred = body.verificationDeferred;
  if (body.maxRentalValueForExpressSignup === null || typeof body.maxRentalValueForExpressSignup === 'number') {
    patch.maxRentalValueForExpressSignup = body.maxRentalValueForExpressSignup;
  }
  if (body.minHoursBeforeRentalStart === null || typeof body.minHoursBeforeRentalStart === 'number') {
    patch.minHoursBeforeRentalStart = body.minHoursBeforeRentalStart;
  }

  const previous = await getCheckoutConfig();
  const next = await setCheckoutConfig(patch);

  try {
    const supabase = createServiceClient();
    await supabase.from('admin_audit_log').insert({
      action: 'checkout_config_change',
      entity_type: 'settings',
      entity_id: 'checkout_config',
      changes: { from: previous, to: next },
    });
  } catch {
    // Audit-Log darf Save nicht blocken
  }

  return NextResponse.json({ config: next });
}
