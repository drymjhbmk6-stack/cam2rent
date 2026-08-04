/**
 * Gespeicherte Zahlungsmittel — Stripe-Customer-Layer.
 *
 * cam2rent hatte bisher KEINEN Stripe-Customer pro Kunde (Zahlungen liefen
 * anonym ueber PaymentIntents). Damit ein Kunde eine Karte "hinterlegen" und
 * beim naechsten Buchen schneller zahlen kann, brauchen wir pro Kunde einen
 * Stripe-Customer, an dem die gespeicherten PaymentMethods haengen.
 *
 * Test/Live-Trennung: Der Customer lebt in genau EINEM Stripe-Account. Welcher
 * Account gilt, haengt vom env-mode UND vom Tester-Flag ab:
 *   - Tester-Konto (profiles.is_tester)  → immer Test-Account
 *   - env-mode = 'test'                   → Test-Account
 *   - env-mode = 'live'                   → Live-Account
 * Deshalb zwei getrennte Spalten (stripe_customer_id / stripe_customer_id_test).
 *
 * Alle Helper sind DEFENSIV/best-effort: schlaegt etwas fehl (Migration nicht
 * durch, Stripe-Fehler), geben sie null zurueck. Der Checkout laeuft dann exakt
 * wie zuvor (ohne gespeicherte Karten) weiter — kein Bruch im Zahlungspfad.
 *
 * Migration: supabase/supabase-profiles-stripe-customer.sql
 */

import type Stripe from 'stripe';
import { getStripe } from '@/lib/stripe';
import { isUserTester, getTesterStripe } from '@/lib/tester-mode';
import { isTestMode } from '@/lib/env-mode';
import { createServiceClient } from '@/lib/supabase';

const COL_LIVE = 'stripe_customer_id';
const COL_TEST = 'stripe_customer_id_test';

export type UserStripeContext = {
  stripe: Stripe;
  /** true = Test-Stripe-Account (Tester ODER env-mode=test) */
  useTest: boolean;
};

/**
 * Liefert die passende Stripe-Instanz + ob der Test-Account gilt.
 * Spiegelt exakt die Wahl in checkout-intent/create-payment-intent:
 *   const stripe = tester ? getTesterStripe() : await getStripe();
 */
export async function resolveUserStripe(userId: string): Promise<UserStripeContext> {
  const tester = await isUserTester(userId);
  const useTest = tester || (await isTestMode());
  const stripe = tester ? getTesterStripe() : await getStripe();
  return { stripe, useTest };
}

function customerColumn(useTest: boolean): string {
  return useTest ? COL_TEST : COL_LIVE;
}

/** Liest die gespeicherte Customer-ID (defensiv bei fehlender Migration → null). */
export async function getStoredCustomerId(
  userId: string,
  useTest: boolean,
): Promise<string | null> {
  const col = customerColumn(useTest);
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('profiles')
      .select(col)
      .eq('id', userId)
      .maybeSingle();
    if (error) return null; // Spalte fehlt (Migration) o.ae. → defensiv
    const val = (data as Record<string, unknown> | null)?.[col];
    return typeof val === 'string' && val.startsWith('cus_') ? val : null;
  } catch {
    return null;
  }
}

async function storeCustomerId(
  userId: string,
  useTest: boolean,
  customerId: string,
): Promise<void> {
  const col = customerColumn(useTest);
  try {
    const supabase = createServiceClient();
    await supabase.from('profiles').update({ [col]: customerId }).eq('id', userId);
  } catch {
    /* best-effort — ohne Persistenz wird der Customer beim naechsten Mal neu angelegt */
  }
}

/**
 * Get-or-create des Stripe-Customers fuer diesen User im gegebenen Stripe-Account.
 * Best-effort: bei jedem Fehler → null (Checkout laeuft ohne gespeicherte Karten).
 */
export async function getOrCreateStripeCustomer(opts: {
  userId: string;
  email?: string | null;
  name?: string | null;
  stripe: Stripe;
  useTest: boolean;
}): Promise<string | null> {
  const { userId, email, name, stripe, useTest } = opts;
  try {
    const existing = await getStoredCustomerId(userId, useTest);
    if (existing) {
      // Verifizieren, dass der Customer in DIESEM Account noch existiert
      // (Account-/Mode-Wechsel, versehentliche Loeschung im Stripe-Dashboard).
      try {
        const c = await stripe.customers.retrieve(existing);
        if (c && !(c as Stripe.DeletedCustomer).deleted) return existing;
      } catch {
        /* nicht gefunden → unten neu anlegen */
      }
    }
    const created = await stripe.customers.create({
      email: email?.trim() || undefined,
      name: name?.trim() || undefined,
      metadata: { app_user_id: userId },
    });
    await storeCustomerId(userId, useTest, created.id);
    return created.id;
  } catch (e) {
    console.error('[stripe-customer] getOrCreateStripeCustomer fehlgeschlagen:', e);
    return null;
  }
}

/**
 * Erzeugt eine CustomerSession, damit das Payment Element im Checkout die
 * gespeicherten Karten des Kunden ANZEIGT (vorausgewaehlt) und ein Entfernen
 * erlaubt.
 *
 * Bewusst NUR redisplay + remove — KEIN `payment_method_save`. Grund:
 * `payment_method_save` kollidiert mit dem `setup_future_usage`, das die
 * Intent-Routen fuer die Kaution-Vorautorisierung setzen. Das Speichern einer
 * Karte laeuft daher ausschliesslich ueber die eigene Konto-Seite
 * (/konto/zahlungsmittel, SetupIntent) — konfliktfrei und ohne Eingriff in den
 * kritischen Zahlungs-Confirm-Pfad. Best-effort: bei Fehler → null.
 */
export async function createPaymentElementSession(
  stripe: Stripe,
  customerId: string,
): Promise<string | null> {
  try {
    const session = await stripe.customerSessions.create({
      customer: customerId,
      components: {
        payment_element: {
          enabled: true,
          features: {
            payment_method_redisplay: 'enabled',
            payment_method_remove: 'enabled',
          },
        },
      },
    });
    return session.client_secret ?? null;
  } catch (e) {
    console.error('[stripe-customer] createPaymentElementSession fehlgeschlagen:', e);
    return null;
  }
}

export type SavedCard = {
  id: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
};

/**
 * Listet die gespeicherten Karten eines Customers. Setzt dabei jede Karte auf
 * `allow_redisplay='always'`, damit sie im Checkout-Payment-Element wieder
 * angezeigt wird (SetupIntents speichern per Default 'unspecified', was von der
 * CustomerSession-Redisplay-Regel sonst ausgefiltert wuerde).
 */
export async function listSavedCards(
  stripe: Stripe,
  customerId: string,
): Promise<SavedCard[]> {
  const res = await stripe.paymentMethods.list({ customer: customerId, type: 'card', limit: 20 });
  const cards: SavedCard[] = [];
  for (const pm of res.data) {
    if (!pm.card) continue;
    if (pm.allow_redisplay !== 'always') {
      try {
        await stripe.paymentMethods.update(pm.id, { allow_redisplay: 'always' });
      } catch {
        /* nicht kritisch fuer die Anzeige der Konto-Liste */
      }
    }
    cards.push({
      id: pm.id,
      brand: pm.card.brand,
      last4: pm.card.last4,
      expMonth: pm.card.exp_month,
      expYear: pm.card.exp_year,
    });
  }
  return cards;
}
