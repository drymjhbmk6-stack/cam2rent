/**
 * Tester-Konto-Mode — User-spezifischer Test-Modus auf der Live-Seite.
 *
 * Wenn `profiles.is_tester = true`, dann sollen die Buchungen dieses Users:
 *  - in den Reports/Buchhaltung als is_test=true ausgefiltert werden,
 *  - Stripe-PaymentIntents mit den Test-Keys nutzen (echte Karten schlagen
 *    dann fehl, 4242-... Karten funktionieren),
 *  - die Verifizierungs-Pflicht ueberspringen,
 *  - E-Mails mit Subject-Prefix "[TEST]" verschicken.
 *
 * So kann der Shop im Live-Modus laufen, ohne dass Test-Buchungen die
 * echten Reports verfaelschen.
 *
 * Migration: supabase/supabase-profiles-is-tester.sql (Spalte profiles.is_tester).
 */

import Stripe from 'stripe';
import { createServiceClient } from '@/lib/supabase';

// ─── Profile-Lookup mit kleinem Cache ────────────────────────────────────────
//
// Wir cachen den is_tester-Flag pro userId fuer 30s. Damit verhindern wir,
// dass jeder API-Call eine zusaetzliche Profile-Query macht. Cache ist
// klein und wird per LRU bei 1000 Eintraegen begrenzt.

const TTL_MS = 30_000;
const MAX_ENTRIES = 1000;
const cache = new Map<string, { value: boolean; expiresAt: number }>();

export function invalidateTesterCache(userId?: string): void {
  if (userId) cache.delete(userId);
  else cache.clear();
}

/**
 * Prueft ob das Profil als Tester markiert ist. Defensive bei fehlender
 * Spalte (Migration noch nicht durch) → false. Anonyme Calls (kein userId)
 * → false.
 */
export async function isUserTester(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false;
  const now = Date.now();
  const cached = cache.get(userId);
  if (cached && cached.expiresAt > now) return cached.value;

  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('profiles')
      .select('is_tester')
      .eq('id', userId)
      .maybeSingle();

    // Wenn die Spalte noch nicht existiert, gibt PostgREST einen 42703-Error
    // zurueck. Defensiv: false zurueckgeben, der Code laeuft normal weiter.
    if (error && /column .*is_tester/i.test(error.message)) {
      cache.set(userId, { value: false, expiresAt: now + TTL_MS });
      return false;
    }

    const isTester = data?.is_tester === true;
    cache.set(userId, { value: isTester, expiresAt: now + TTL_MS });

    // LRU-Cap (FIFO durch Map-Reihenfolge)
    if (cache.size > MAX_ENTRIES) {
      const oldestKey = cache.keys().next().value;
      if (oldestKey !== undefined) cache.delete(oldestKey);
    }
    return isTester;
  } catch {
    return false;
  }
}

// ─── Stripe-Test-Client (immer Test-Keys, unabhaengig von env-mode) ──────────

let cachedTestKey: string | null = null;
let cachedTestStripe: Stripe | null = null;

/**
 * Liefert eine Stripe-Instanz mit den TEST-Keys, egal ob die Seite im
 * Live- oder Test-Modus laeuft. Wird fuer Tester-User-Buchungen genutzt,
 * damit echte Karten/PayPal nicht belastet werden.
 *
 * Key-Quelle: STRIPE_SECRET_KEY_TEST (oder Fallback auf STRIPE_SECRET_KEY,
 * wenn die _TEST-Variante nicht gesetzt ist). Throws, wenn beide fehlen.
 */
export function getTesterStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY_TEST ?? process.env.STRIPE_SECRET_KEY ?? '';
  if (!key) {
    throw new Error('Stripe-Test-Key (STRIPE_SECRET_KEY_TEST) ist nicht konfiguriert.');
  }
  if (cachedTestStripe && cachedTestKey === key) return cachedTestStripe;
  cachedTestKey = key;
  cachedTestStripe = new Stripe(key);
  return cachedTestStripe;
}

/**
 * Liefert das Test-Publishable-Key fuer den Client (Stripe.js).
 * Wird im Tester-Flow vom Frontend angefragt, damit die Bezahl-Form mit
 * Test-Karten funktioniert.
 */
export function getTesterStripePublishableKey(): string {
  return (
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_TEST ??
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ??
    ''
  );
}
