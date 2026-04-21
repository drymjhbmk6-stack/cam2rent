import { NextResponse } from 'next/server';
import { getCheckoutConfig } from '@/lib/checkout-config';

/**
 * Oeffentliche Checkout-Konfiguration fuer den Client.
 * Gibt nur die Flags zurueck, die der Client wissen muss, um die UI
 * korrekt anzuzeigen. Keine sensiblen Daten.
 */
export async function GET() {
  const cfg = await getCheckoutConfig();
  return NextResponse.json({
    expressSignupEnabled: cfg.expressSignupEnabled,
    verificationDeferred: cfg.verificationDeferred,
    maxRentalValueForExpressSignup: cfg.maxRentalValueForExpressSignup,
    minHoursBeforeRentalStart: cfg.minHoursBeforeRentalStart,
  });
}
