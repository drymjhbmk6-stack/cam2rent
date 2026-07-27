/**
 * Konfiguration fuer den Auto-Cleanup von Kundenkonten.
 * Wird gelesen aus `admin_settings.account_lifecycle_config`.
 *
 * Genutzt von /api/cron/account-cleanup:
 *  1. Nicht verifizierte Konten (verification_status IS NULL/'none') OHNE
 *     Buchung → nach `unverified_warn_after_days` Tagen eine letzte
 *     Erinnerungs-Mail, dann nach `unverified_grace_hours` Stunden
 *     anonymisieren + Profil entfernen.
 *  2. Inaktive Konten (kein Login seit `inactive_warn_after_days` Tagen) →
 *     Warn-Mail, dann nach `inactive_grace_days` Tagen DEAKTIVIEREN
 *     (nicht loeschen). Reaktivierung automatisch beim naechsten Login.
 *
 * Ohne Setting greifen die Defaults unten (Feature aktiv). Zum kompletten
 * Abschalten: { "enabled": false } in admin_settings.account_lifecycle_config.
 */

import type { createServiceClient } from '@/lib/supabase';

type SB = ReturnType<typeof createServiceClient>;

export interface AccountLifecycleConfig {
  /** Feature global an/aus. */
  enabled: boolean;
  /** Tage nach Konto-Anlage, bis die letzte Erinnerung an Unverifizierte geht. */
  unverified_warn_after_days: number;
  /** Stunden nach der Erinnerung, bis das unverifizierte Konto geloescht wird. */
  unverified_grace_hours: number;
  /** Tage ohne Login, bis die Inaktivitaets-Warnung rausgeht. */
  inactive_warn_after_days: number;
  /** Tage nach der Warnung, bis das Konto deaktiviert wird. */
  inactive_grace_days: number;
}

// Defaults sind an die zugesagten Fristen angepasst (AGB § 19 Abs. 3,
// Datenschutz Ziffer 6/15): unverifizierte Konten werden ~30 Tage nach
// Registrierung gewarnt und erst NACH einer weiteren 30-Tage-Frist gelöscht;
// inaktive Konten (kein Login, keine Buchung) werden nach 24 Monaten gewarnt
// und erst 30 Tage später deaktiviert. Die Vorwarnung beträgt in beiden Fällen
// mindestens 30 Tage.
export const DEFAULT_ACCOUNT_LIFECYCLE_CONFIG: AccountLifecycleConfig = {
  enabled: true,
  unverified_warn_after_days: 30, // ~30 Tage nach Registrierung
  unverified_grace_hours: 720, // 30 Tage Vorwarnung vor der Löschung
  inactive_warn_after_days: 730, // 24 Monate
  inactive_grace_days: 30, // 30 Tage Vorwarnung vor der Deaktivierung
};

/**
 * Merged eine (teilweise) Konfiguration über die Defaults und erzwingt
 * plausible/zugesagte Werte. Die Vorwarnfristen werden auf mind. 30 Tage
 * angehoben (zugesagte „mindestens 30 Tage vorher"-Ankündigung, AGB § 19
 * Abs. 3 / Datenschutz Ziffer 6/15). Pure Funktion (testbar).
 */
export function normalizeAccountLifecycleConfig(
  parsed: Partial<AccountLifecycleConfig> | null | undefined,
): AccountLifecycleConfig {
  const merged: AccountLifecycleConfig = {
    ...DEFAULT_ACCOUNT_LIFECYCLE_CONFIG,
    ...(parsed && typeof parsed === 'object' ? parsed : {}),
  };
  const clamp = (v: unknown, def: number, min: number, max: number) => {
    const n = Number(v);
    if (!Number.isFinite(n) || n < min) return def;
    return Math.min(max, Math.floor(n));
  };
  merged.unverified_warn_after_days = clamp(merged.unverified_warn_after_days, 30, 1, 3650);
  // Vorwarnfristen: mind. 30 Tage erzwingen (ein kürzerer Wert wird auf den
  // 30-Tage-Default angehoben, ein längerer bleibt erlaubt).
  merged.unverified_grace_hours = clamp(merged.unverified_grace_hours, 720, 720, 8760);
  merged.inactive_warn_after_days = clamp(merged.inactive_warn_after_days, 730, 30, 3650);
  merged.inactive_grace_days = clamp(merged.inactive_grace_days, 30, 30, 365);
  return merged;
}

export async function loadAccountLifecycleConfig(
  supabase: SB,
): Promise<AccountLifecycleConfig> {
  try {
    const { data } = await supabase
      .from('admin_settings')
      .select('value')
      .eq('key', 'account_lifecycle_config')
      .maybeSingle();
    if (!data?.value) return { ...DEFAULT_ACCOUNT_LIFECYCLE_CONFIG };
    const parsed =
      typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
    if (parsed && typeof parsed === 'object') {
      return normalizeAccountLifecycleConfig(parsed as Partial<AccountLifecycleConfig>);
    }
  } catch {
    // Setting nicht ladbar (RLS/Migration) → Default
  }
  return { ...DEFAULT_ACCOUNT_LIFECYCLE_CONFIG };
}
