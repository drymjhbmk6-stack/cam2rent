/**
 * Konfiguration für die Mietvertrag-Erinnerung + den Auto-Storno unsignierter
 * Verträge. Wird gelesen aus `admin_settings.contract_reminder_config`.
 *
 * Genutzt von:
 *  - /api/cron/contract-reminder      (tägliche Erinnerungs-Mail an den Kunden)
 *  - /api/cron/contract-auto-cancel   (Auto-Storno am Puffertag)
 *
 * Ohne Setting greifen die Defaults unten (Feature aktiv, 5 Tage Vorlauf,
 * Storno für Versand UND Abholung, automatische Stripe-Erstattung).
 *
 * Zum Umstellen einfach das Setting bearbeiten, z.B. Abholung vom Auto-Storno
 * ausnehmen (Vertrag wird bei Abholung ohnehin bei der Übergabe unterschrieben):
 *   { "autocancel_abholung": false }
 */

import type { createServiceClient } from '@/lib/supabase';

type SB = ReturnType<typeof createServiceClient>;

export interface ContractReminderConfig {
  /** Feature global an/aus. */
  enabled: boolean;
  /**
   * Ab wie vielen Tagen VOR dem Puffertag (Versand-/Übergabetag) die tägliche
   * Erinnerungs-Mail startet. Verhindert wochenlanges Spammen bei früh
   * gebuchten Aufträgen.
   */
  reminder_lead_days: number;
  /** Versand-Buchungen am Puffertag auto-stornieren, wenn Vertrag fehlt. */
  autocancel_versand: boolean;
  /** Abholung-Buchungen am Puffertag auto-stornieren, wenn Vertrag fehlt. */
  autocancel_abholung: boolean;
  /** Beim Auto-Storno automatisch per Stripe erstatten + Kaution freigeben. */
  refund_on_cancel: boolean;
}

export const DEFAULT_CONTRACT_REMINDER_CONFIG: ContractReminderConfig = {
  enabled: true,
  reminder_lead_days: 5,
  autocancel_versand: true,
  autocancel_abholung: true,
  refund_on_cancel: true,
};

export async function loadContractReminderConfig(
  supabase: SB,
): Promise<ContractReminderConfig> {
  try {
    const { data } = await supabase
      .from('admin_settings')
      .select('value')
      .eq('key', 'contract_reminder_config')
      .maybeSingle();
    if (!data?.value) return DEFAULT_CONTRACT_REMINDER_CONFIG;
    const parsed =
      typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
    if (parsed && typeof parsed === 'object') {
      const merged: ContractReminderConfig = {
        ...DEFAULT_CONTRACT_REMINDER_CONFIG,
        ...(parsed as Partial<ContractReminderConfig>),
      };
      let lead = Number(merged.reminder_lead_days);
      if (!Number.isFinite(lead) || lead < 1) {
        lead = DEFAULT_CONTRACT_REMINDER_CONFIG.reminder_lead_days;
      }
      merged.reminder_lead_days = Math.min(30, Math.floor(lead));
      return merged;
    }
  } catch {
    // Setting nicht ladbar (RLS/Migration) → Default
  }
  return DEFAULT_CONTRACT_REMINDER_CONFIG;
}
