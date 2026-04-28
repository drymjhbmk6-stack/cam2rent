/**
 * Env-Mode — Zentrale Umschaltung zwischen Test- und Live-Modus.
 *
 * Der aktuelle Modus wird in `admin_settings.environment_mode` (test|live)
 * gespeichert und kann im Admin unter /admin/einstellungen gewechselt werden
 * (Passwort-Schutz). Alle externen Dienste (Stripe, Resend, Sendcloud,
 * Site-URL, Vertrags-Wasserzeichen, Auto-Publish) lesen ihre Konfiguration
 * ueber die Helper in dieser Datei.
 *
 * Fallback-Regel:
 *   1. Env-Var mit `_LIVE` / `_TEST` Suffix bevorzugen
 *   2. Wenn nicht gesetzt, auf Legacy-Env-Var ohne Suffix zurueckfallen
 *      (Backwards-Compat, bis alle Coolify-Envs migriert sind)
 *
 * Der Modus wird fuer 30 Sekunden in-memory gecached, damit nicht jeder
 * API-Call eine DB-Query macht. Nach Admin-Wechsel wird `invalidateEnvModeCache()`
 * aufgerufen.
 */

import { createServiceClient } from '@/lib/supabase';
import { BUSINESS } from '@/lib/business-config';

export type EnvMode = 'test' | 'live';

const MODE_KEY = 'environment_mode';
const CACHE_TTL_MS = 30_000;

let cachedMode: EnvMode | null = null;
let cachedAt = 0;

export function invalidateEnvModeCache() {
  cachedMode = null;
  cachedAt = 0;
}

/**
 * Liest den aktuellen Modus aus der DB (gecached).
 * Default bei leerer DB / Fehler: 'test' (sicherer Default vor Go-Live).
 */
export async function getEnvMode(): Promise<EnvMode> {
  const now = Date.now();
  if (cachedMode && now - cachedAt < CACHE_TTL_MS) return cachedMode;

  try {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from('admin_settings')
      .select('value')
      .eq('key', MODE_KEY)
      .maybeSingle();

    // admin_settings.value ist je nach Migration entweder TEXT (JSON-String)
    // oder JSONB (Object). Plus Edge-Case: value ist ein roher String 'live'/'test'.
    // Defensiv beide Faelle behandeln.
    const value = data?.value;
    let raw: string | undefined;
    if (typeof value === 'string') {
      // TEXT-Spalte: kann roher String 'live'/'test' sein ODER serialisierter JSON
      const trimmed = value.trim();
      if (trimmed.startsWith('{')) {
        try {
          const parsed = JSON.parse(trimmed) as { mode?: string };
          raw = parsed?.mode;
        } catch {
          raw = trimmed;
        }
      } else {
        raw = trimmed;
      }
    } else if (value && typeof value === 'object') {
      raw = (value as { mode?: string }).mode;
    }
    const mode: EnvMode = raw === 'live' ? 'live' : 'test';
    cachedMode = mode;
    cachedAt = now;
    return mode;
  } catch {
    return 'test';
  }
}

export async function isTestMode(): Promise<boolean> {
  return (await getEnvMode()) === 'test';
}

export async function isLiveMode(): Promise<boolean> {
  return (await getEnvMode()) === 'live';
}

/**
 * Setzt den Modus und invalidiert den Cache. Ruft NUR nach erfolgreicher
 * Passwort-Pruefung aufrufen — hier findet keine Auth-Pruefung statt.
 */
export async function setEnvMode(mode: EnvMode): Promise<void> {
  const supabase = createServiceClient();
  await supabase.from('admin_settings').upsert(
    { key: MODE_KEY, value: { mode } },
    { onConflict: 'key' }
  );
  invalidateEnvModeCache();
}

// ─── Key-Resolver ────────────────────────────────────────────────────────────

function pickKey(mode: EnvMode, liveVar: string, testVar: string, legacyVar: string): string {
  const live = process.env[liveVar];
  const test = process.env[testVar];
  const legacy = process.env[legacyVar];
  if (mode === 'live') return live ?? legacy ?? '';
  return test ?? legacy ?? '';
}

export async function getStripeSecretKey(): Promise<string> {
  const mode = await getEnvMode();
  return pickKey(mode, 'STRIPE_SECRET_KEY_LIVE', 'STRIPE_SECRET_KEY_TEST', 'STRIPE_SECRET_KEY');
}

export async function getStripePublishableKey(): Promise<string> {
  const mode = await getEnvMode();
  return pickKey(
    mode,
    'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_LIVE',
    'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_TEST',
    'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY'
  );
}

export async function getStripeWebhookSecret(): Promise<string> {
  const mode = await getEnvMode();
  return pickKey(mode, 'STRIPE_WEBHOOK_SECRET_LIVE', 'STRIPE_WEBHOOK_SECRET_TEST', 'STRIPE_WEBHOOK_SECRET');
}

export async function getSendcloudKeys(): Promise<{ publicKey: string; secretKey: string }> {
  const mode = await getEnvMode();
  return {
    publicKey: pickKey(mode, 'SENDCLOUD_PUBLIC_KEY_LIVE', 'SENDCLOUD_PUBLIC_KEY_TEST', 'SENDCLOUD_PUBLIC_KEY'),
    secretKey: pickKey(mode, 'SENDCLOUD_SECRET_KEY_LIVE', 'SENDCLOUD_SECRET_KEY_TEST', 'SENDCLOUD_SECRET_KEY'),
  };
}

/**
 * Liefert die kanonische Site-URL je nach Modus.
 * Live: NEXT_PUBLIC_SITE_URL_LIVE oder BUSINESS.url (cam2rent.de)
 * Test: NEXT_PUBLIC_SITE_URL_TEST oder NEXT_PUBLIC_SITE_URL oder test.cam2rent.de
 */
export async function getSiteUrl(): Promise<string> {
  const mode = await getEnvMode();
  if (mode === 'live') {
    return (
      process.env.NEXT_PUBLIC_SITE_URL_LIVE ??
      process.env.NEXT_PUBLIC_SITE_URL ??
      BUSINESS.url ??
      'https://cam2rent.de'
    );
  }
  return (
    process.env.NEXT_PUBLIC_SITE_URL_TEST ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    'https://test.cam2rent.de'
  );
}

/**
 * Absender-Adresse fuer Resend.
 * Live:  FROM_EMAIL_LIVE / FROM_EMAIL / BUSINESS.email (z.B. buchung@cam2rent.de)
 * Test:  FROM_EMAIL_TEST / FROM_EMAIL / onboarding@resend.dev als letzter Fallback
 */
export async function getResendFromEmail(): Promise<string> {
  const mode = await getEnvMode();
  if (mode === 'live') {
    return (
      process.env.FROM_EMAIL_LIVE ??
      process.env.FROM_EMAIL ??
      BUSINESS.email
    );
  }
  return (
    process.env.FROM_EMAIL_TEST ??
    process.env.FROM_EMAIL ??
    BUSINESS.email
  );
}

/**
 * Optional: Im Test-Modus alle Kundenmails stattdessen an Admin umleiten.
 * Gesteuert ueber Env-Var `TEST_MODE_REDIRECT_EMAIL` (wenn gesetzt → Umleitung).
 * Liefert null wenn keine Umleitung aktiv ist.
 */
export async function getTestModeEmailRedirect(): Promise<string | null> {
  if (!(await isTestMode())) return null;
  const redirect = process.env.TEST_MODE_REDIRECT_EMAIL;
  return redirect && redirect.includes('@') ? redirect : null;
}

/**
 * Prefix fuer Rechnungs-/Gutschrift-/Buchungsnummern im Test-Modus.
 * Liefert 'TEST-' im Test-Modus, '' im Live-Modus.
 */
export async function getNumberPrefix(): Promise<string> {
  return (await isTestMode()) ? 'TEST-' : '';
}
