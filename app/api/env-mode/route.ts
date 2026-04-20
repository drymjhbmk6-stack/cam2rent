import { NextResponse } from 'next/server';
import { getEnvMode, getStripePublishableKey, getSiteUrl } from '@/lib/env-mode';

/**
 * Oeffentlicher Endpoint: Liefert Modus + Client-seitige Konfiguration.
 * Wird von TestBanner + Checkout-Seiten genutzt, damit Stripe-Publishable-Key
 * und Modus-Anzeige zur DB-Einstellung passen.
 *
 * Enthaelt NUR oeffentliche Keys (Publishable). Geheime Keys bleiben serverseitig.
 */
export async function GET() {
  const [mode, publishableKey, siteUrl] = await Promise.all([
    getEnvMode(),
    getStripePublishableKey(),
    getSiteUrl(),
  ]);
  return NextResponse.json(
    { mode, stripePublishableKey: publishableKey, siteUrl },
    { headers: { 'Cache-Control': 'public, max-age=10, s-maxage=10' } }
  );
}
