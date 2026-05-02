import { NextRequest, NextResponse } from 'next/server';
import { getEnvMode, getStripePublishableKey, getSiteUrl } from '@/lib/env-mode';
import { isUserTester, getTesterStripePublishableKey } from '@/lib/tester-mode';

/**
 * Oeffentlicher Endpoint: Liefert Modus + Client-seitige Konfiguration.
 * Wird von Checkout-Seiten genutzt, damit der Stripe-Publishable-Key
 * zur DB-Einstellung passt.
 *
 * Enthaelt NUR oeffentliche Keys (Publishable). Geheime Keys bleiben serverseitig.
 *
 * Optional `?userId=<uuid>`: Wenn das Profil als Tester markiert ist,
 * geben wir den Test-Publishable-Key zurueck — auch wenn die Seite live
 * laeuft. Damit kann der eingeloggte Tester mit Test-Karten bezahlen,
 * ohne dass eine andere Test-Mode-Umschaltung noetig ist.
 */
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId');
  const tester = userId ? await isUserTester(userId) : false;

  let mode: 'test' | 'live';
  let publishableKey: string;
  if (tester) {
    mode = 'test';
    publishableKey = getTesterStripePublishableKey();
  } else {
    [mode, publishableKey] = await Promise.all([
      getEnvMode(),
      getStripePublishableKey(),
    ]);
  }
  const siteUrl = await getSiteUrl();

  return NextResponse.json(
    { mode, stripePublishableKey: publishableKey, siteUrl, tester },
    {
      headers: tester
        // Tester-spezifische Antwort darf nicht vom CDN als public gecached werden.
        ? { 'Cache-Control': 'private, no-store' }
        : { 'Cache-Control': 'public, max-age=10, s-maxage=10' },
    }
  );
}
