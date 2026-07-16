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

export const DEFAULT_ACCOUNT_LIFECYCLE_CONFIG: AccountLifecycleConfig = {
  enabled: true,
  unverified_warn_after_days: 28, // 4 Wochen
  unverified_grace_hours: 48,
  inactive_warn_after_days: 365, // 1 Jahr
  inactive_grace_days: 14,
};

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
      const merged: AccountLifecycleConfig = {
        ...DEFAULT_ACCOUNT_LIFECYCLE_CONFIG,
        ...(parsed as Partial<AccountLifecycleConfig>),
      };
      // Positive, plausible Werte erzwingen.
      const clamp = (v: unknown, def: number, min: number, max: number) => {
        const n = Number(v);
        if (!Number.isFinite(n) || n < min) return def;
        return Math.min(max, Math.floor(n));
      };
      merged.unverified_warn_after_days = clamp(merged.unverified_warn_after_days, 28, 1, 3650);
      merged.unverified_grace_hours = clamp(merged.unverified_grace_hours, 48, 1, 8760);
      merged.inactive_warn_after_days = clamp(merged.inactive_warn_after_days, 365, 30, 3650);
      merged.inactive_grace_days = clamp(merged.inactive_grace_days, 14, 1, 365);
      return merged;
    }
  } catch {
    // Setting nicht ladbar (RLS/Migration) → Default
  }
  return { ...DEFAULT_ACCOUNT_LIFECYCLE_CONFIG };
}
