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

let cached: Promise<Stripe | null> | null = null;

export function getStripePromise(): Promise<Stripe | null> {
  if (cached) return cached;
  cached = (async () => {
    try {
      const res = await fetch('/api/env-mode', { cache: 'no-store' });
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
  return cached;
}
