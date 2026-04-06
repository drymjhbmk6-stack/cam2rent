import { createServiceClient } from '@/lib/supabase';
import { setBusinessOverride, type BusinessConfig } from '@/lib/business-config';

let loaded = false;

/**
 * Laedt die Geschaeftsdaten aus der Datenbank und setzt den Override.
 * Wird einmalig aufgerufen (z.B. in API-Routes die BUSINESS nutzen).
 * Cached im Prozess-Speicher — bei Neustart wird neu geladen.
 */
export async function ensureBusinessConfig() {
  if (loaded) return;

  try {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from('admin_settings')
      .select('value')
      .eq('key', 'business_config')
      .maybeSingle();

    if (data?.value && typeof data.value === 'object') {
      setBusinessOverride(data.value as Partial<BusinessConfig>);
    }
  } catch {
    // Fallback auf Standardwerte
  }

  loaded = true;
}
