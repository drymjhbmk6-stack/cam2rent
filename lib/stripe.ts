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
