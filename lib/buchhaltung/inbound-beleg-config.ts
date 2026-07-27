/**
 * Konfiguration fuer den E-Mail-Rechnungs-Import.
 *
 * Der Admin legt eine dedizierte Adresse fest (z.B. belege@cam2rent.de,
 * typisch ein Alias/Weiterleitung auf das Support-Postfach). Der IMAP-Cron
 * (inbound-email-poll) zweigt Mails an genau diese Adresse in die
 * Beleg-Pipeline ab, statt sie ins Kunden-Nachrichtenpostfach zu schreiben.
 *
 * Gespeichert in admin_settings.belege_inbox_config. Defensiv: fehlt das
 * Setting, ist das Feature aus (enabled=false) und der Cron verhaelt sich
 * exakt wie vorher.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

const SETTING_KEY = 'belege_inbox_config';
const CACHE_TTL_MS = 30_000;

export interface BelegInboxConfig {
  /** Dedizierte Empfangsadresse, lowercase. Leer = keine Adresse hinterlegt. */
  address: string;
  /** Feature aktiv? Nur mit gesetzter, nicht-leerer Adresse wirksam. */
  enabled: boolean;
}

const DEFAULT_CONFIG: BelegInboxConfig = { address: '', enabled: false };

let cache: { value: BelegInboxConfig; at: number } | null = null;

export function invalidateBelegInboxConfigCache(): void {
  cache = null;
}

/** Normalisiert beliebigen DB-Wert (Objekt ODER JSON-String) auf die Config. */
export function normalizeBelegInboxConfig(raw: unknown): BelegInboxConfig {
  let value: unknown = raw;
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { return { ...DEFAULT_CONFIG }; }
  }
  if (!value || typeof value !== 'object') return { ...DEFAULT_CONFIG };
  const v = value as { address?: unknown; enabled?: unknown };
  const address = typeof v.address === 'string' ? v.address.trim().toLowerCase() : '';
  // Ohne gueltige Adresse ist das Feature nie aktiv, egal was enabled sagt.
  const enabled = !!v.enabled && address.includes('@');
  return { address, enabled };
}

export async function loadBelegInboxConfig(
  supabase: SupabaseClient,
): Promise<BelegInboxConfig> {
  const nowStub = cache; // (kein Date.now()-Verbot hier — normale Runtime)
  if (nowStub && Date.now() - nowStub.at < CACHE_TTL_MS) return nowStub.value;

  const { data } = await supabase
    .from('admin_settings')
    .select('value')
    .eq('key', SETTING_KEY)
    .maybeSingle();

  const value = normalizeBelegInboxConfig(data?.value);
  cache = { value, at: Date.now() };
  return value;
}

/**
 * Trifft die Mail (nach To/Cc/Delivered-To) die konfigurierte Beleg-Adresse?
 * Case-insensitive; recipients kommen aus parseImapMessage bereits lowercased.
 */
export function isBelegRecipient(recipients: string[], config: BelegInboxConfig): boolean {
  if (!config.enabled || !config.address) return false;
  return recipients.some((r) => r.trim().toLowerCase() === config.address);
}
