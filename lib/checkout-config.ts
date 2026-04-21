/**
 * Checkout-Config — Feature-Flags fuer den Buchungsflow.
 *
 * Die Flags werden in `admin_settings.checkout_config` (JSON) gespeichert
 * und unter /admin/einstellungen gepflegt. Default: alles AUS, damit
 * der bestehende Flow 1:1 weiterlaeuft.
 *
 * Zwei orthogonale Flags:
 *   - expressSignupEnabled: Erlaubt Kontoanlage direkt im Checkout
 *     (ohne Umweg ueber /registrierung).
 *   - verificationDeferred: Erlaubt Zahlung OHNE vorherigen Ausweis-Check.
 *     Der Ausweis muss dann vor Versand nachgereicht werden (Buchung
 *     bekommt `verification_required=true`).
 *
 * Wichtig: expressSignupEnabled alleine (ohne verificationDeferred) ist
 * moeglich, aber wenig sinnvoll — neu angelegte Accounts sind immer
 * unverifiziert und landen dann im bestehenden `pending_verification`-Pfad.
 * Der echte UX-Gewinn kommt erst, wenn beide Flags an sind.
 */

import { createServiceClient } from '@/lib/supabase';

export type CheckoutConfig = {
  expressSignupEnabled: boolean;
  verificationDeferred: boolean;
  // Schutzschranken: Express-Signup nur unter diesen Bedingungen
  maxRentalValueForExpressSignup: number | null; // in EUR, null = kein Limit
  minHoursBeforeRentalStart: number | null; // Stunden, null = kein Limit
};

const CFG_KEY = 'checkout_config';
const CACHE_TTL_MS = 30_000;

export const DEFAULT_CHECKOUT_CONFIG: CheckoutConfig = {
  expressSignupEnabled: false,
  verificationDeferred: false,
  maxRentalValueForExpressSignup: 500,
  minHoursBeforeRentalStart: 48,
};

let cached: CheckoutConfig | null = null;
let cachedAt = 0;

export function invalidateCheckoutConfigCache() {
  cached = null;
  cachedAt = 0;
}

function normalize(raw: unknown): CheckoutConfig {
  if (!raw || typeof raw !== 'object') return DEFAULT_CHECKOUT_CONFIG;
  const r = raw as Record<string, unknown>;
  return {
    expressSignupEnabled: r.expressSignupEnabled === true,
    verificationDeferred: r.verificationDeferred === true,
    maxRentalValueForExpressSignup:
      typeof r.maxRentalValueForExpressSignup === 'number'
        ? r.maxRentalValueForExpressSignup
        : DEFAULT_CHECKOUT_CONFIG.maxRentalValueForExpressSignup,
    minHoursBeforeRentalStart:
      typeof r.minHoursBeforeRentalStart === 'number'
        ? r.minHoursBeforeRentalStart
        : DEFAULT_CHECKOUT_CONFIG.minHoursBeforeRentalStart,
  };
}

export async function getCheckoutConfig(): Promise<CheckoutConfig> {
  const now = Date.now();
  if (cached && now - cachedAt < CACHE_TTL_MS) return cached;

  try {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from('admin_settings')
      .select('value')
      .eq('key', CFG_KEY)
      .maybeSingle();

    const raw = typeof data?.value === 'string' ? safeParse(data.value) : data?.value;
    const cfg = normalize(raw);
    cached = cfg;
    cachedAt = now;
    return cfg;
  } catch {
    return DEFAULT_CHECKOUT_CONFIG;
  }
}

export async function setCheckoutConfig(next: Partial<CheckoutConfig>): Promise<CheckoutConfig> {
  const current = await getCheckoutConfig();
  const merged: CheckoutConfig = { ...current, ...next };
  const supabase = createServiceClient();
  await supabase
    .from('admin_settings')
    .upsert({ key: CFG_KEY, value: merged, updated_at: new Date().toISOString() });
  invalidateCheckoutConfigCache();
  return merged;
}

function safeParse(s: string): unknown {
  try { return JSON.parse(s); } catch { return null; }
}

/**
 * Prueft ob eine konkrete Buchung die Express-Signup-Regeln erfuellt.
 * Rueckgabe: null = erlaubt; string = Grund fuer Ablehnung.
 */
export function checkExpressSignupEligibility(
  cfg: CheckoutConfig,
  opts: { amountCents: number; earliestRentalFrom?: string | null },
): string | null {
  if (!cfg.expressSignupEnabled) return 'Express-Signup deaktiviert';
  if (cfg.maxRentalValueForExpressSignup !== null) {
    const maxCents = Math.round(cfg.maxRentalValueForExpressSignup * 100);
    if (opts.amountCents > maxCents) {
      return `Buchungswert uebersteigt Express-Limit (${cfg.maxRentalValueForExpressSignup} EUR)`;
    }
  }
  if (cfg.minHoursBeforeRentalStart !== null && opts.earliestRentalFrom) {
    const start = new Date(opts.earliestRentalFrom);
    if (!isNaN(start.getTime())) {
      const diffH = (start.getTime() - Date.now()) / 3_600_000;
      if (diffH < cfg.minHoursBeforeRentalStart) {
        return `Mietbeginn zu kurzfristig fuer Express-Signup (${cfg.minHoursBeforeRentalStart}h Vorlauf noetig)`;
      }
    }
  }
  return null;
}
