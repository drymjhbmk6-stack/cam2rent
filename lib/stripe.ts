/**
 * Zentrale Stripe-Instanz-Factory.
 *
 * Statt `new Stripe(process.env.STRIPE_SECRET_KEY!)` auf Modul-Ebene nutzen
 * alle API-Routen `const stripe = await getStripe()`. Damit wird bei jedem
 * Request der aktuelle Modus (test|live) aus der DB geholt und der passende
 * Key verwendet.
 *
 * Legacy-Pfad: Bei fehlenden mode-spezifischen Envs faellt env-mode.ts auf
 * den alten `STRIPE_SECRET_KEY` zurueck.
 */

import Stripe from 'stripe';
import { getStripeSecretKey } from '@/lib/env-mode';

let cachedKey: string | null = null;
let cachedClient: Stripe | null = null;

export async function getStripe(): Promise<Stripe> {
  const key = await getStripeSecretKey();
  if (!key) {
    throw new Error('Stripe secret key is not configured for the current env mode.');
  }
  // Wenn der Key sich nicht geaendert hat, recyclen — sonst neue Instanz.
  if (cachedClient && cachedKey === key) return cachedClient;
  cachedKey = key;
  cachedClient = new Stripe(key);
  return cachedClient;
}

export async function getStripeWebhookSecretOrThrow(): Promise<string> {
  const { getStripeWebhookSecret } = await import('@/lib/env-mode');
  const secret = await getStripeWebhookSecret();
  if (!secret) {
    throw new Error('Stripe webhook secret is not configured for the current env mode.');
  }
  return secret;
}

/**
 * Baut eine sprechende Description fuer einen PaymentIntent. Stripe gibt das
 * Feld an PayPal als „Verwendungszweck" weiter und zeigt es zusaetzlich auf
 * der Stripe-eigenen Quittung. Dadurch sieht der Kunde nicht mehr nur
 * "cam2rent" in seiner PayPal-Historie, sondern z.B. "GoPro Hero13 Black ·
 * 19.05.2026 · cam2rent.de".
 *
 * Die Booking-ID kennen wir zum Zeitpunkt des PaymentIntent-Create i.d.R.
 * noch nicht (wird erst in confirm-cart/confirm-booking generiert). Deshalb
 * baut der Helper aus Produktname + Zeitraum eine eindeutige Referenz.
 */
export function buildPaymentDescription(opts: {
  productName?: string | null;
  rentalFrom?: string | null;
  rentalTo?: string | null;
  bookingId?: string | null;
  extraItemCount?: number;
}): string {
  const parts: string[] = [];

  if (opts.bookingId) {
    parts.push(`Buchung ${opts.bookingId}`);
  }

  let product = (opts.productName ?? '').trim();
  if (product) {
    if (opts.extraItemCount && opts.extraItemCount > 0) {
      product = `${product} + ${opts.extraItemCount} weitere`;
    }
    parts.push(product);
  }

  const fmt = (iso: string | null | undefined): string | null => {
    if (!iso) return null;
    const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    return `${m[3]}.${m[2]}.${m[1]}`;
  };
  const from = fmt(opts.rentalFrom);
  const to = fmt(opts.rentalTo);
  if (from && to && from !== to) {
    parts.push(`${from} – ${to}`);
  } else if (from) {
    parts.push(from);
  }

  parts.push('cam2rent.de');
  // Stripe-Limit: 350 Zeichen fuer description, PayPal kuerzt zusaetzlich.
  return parts.join(' · ').slice(0, 200);
}

