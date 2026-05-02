/**
 * Client-seitige Stripe-Initialisierung.
 *
 * `loadStripe()` erwartet den Publishable-Key synchron. Da wir den Key je
 * nach Env-Mode (test|live) aus der DB lesen, holen wir ihn zuerst vom
 * `/api/env-mode`-Endpoint und instanziieren dann Stripe.js.
 *
 * Fallback: Wenn der API-Call fehlschlaegt, nutzen wir den Build-time-Env
 * (`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`) — damit bleibt der Checkout
 * funktional, wenn die DB kurz down ist.
 */

import { loadStripe, type Stripe } from '@stripe/stripe-js';

const cacheByKey = new Map<string, Promise<Stripe | null>>();

/**
 * Wird von den Checkout-Seiten aufgerufen. Wenn `userId` mitgegeben ist und
 * das Profil als Tester markiert ist, gibt der env-mode-Endpoint den Test-
 * Publishable-Key zurueck — damit zahlt der Tester mit Test-Karten gegen
 * Test-Stripe, auch wenn die Seite global im Live-Modus laeuft.
 */
export function getStripePromise(opts?: { userId?: string | null }): Promise<Stripe | null> {
  const cacheKey = opts?.userId ?? '__public__';
  const existing = cacheByKey.get(cacheKey);
  if (existing) return existing;

  const promise = (async () => {
    try {
      const url = opts?.userId
        ? `/api/env-mode?userId=${encodeURIComponent(opts.userId)}`
        : '/api/env-mode';
      const res = await fetch(url, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json() as { stripePublishableKey?: string };
        if (data.stripePublishableKey) {
          return await loadStripe(data.stripePublishableKey);
        }
      }
    } catch {
      // Fallback below
    }
    const fallback = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    if (!fallback) return null;
    return await loadStripe(fallback);
  })();
  cacheByKey.set(cacheKey, promise);
  return promise;
}
