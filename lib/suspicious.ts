import { SupabaseClient } from '@supabase/supabase-js';

interface SuspiciousParams {
  userId?: string | null;
  priceTotal: number;
  rentalFrom: string; // YYYY-MM-DD
  days: number;
}

interface SuspiciousResult {
  suspicious: boolean;
  reasons: string[];
}

/**
 * Prüft ob eine Buchung verdächtig ist.
 * Nicht-blockierend: Gibt nur Flags zurück, verhindert keine Buchung.
 */
export async function detectSuspicious(
  supabase: SupabaseClient,
  params: SuspiciousParams
): Promise<SuspiciousResult> {
  const reasons: string[] = [];

  try {
    // Regel 1: Erstbuchung mit hohem Wert (>200€)
    if (params.userId && params.priceTotal > 200) {
      const { count } = await supabase
        .from('bookings')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', params.userId)
        .neq('status', 'cancelled');

      if (count === 0) {
        reasons.push('Erstbuchung mit hohem Wert');
      }
    }

    // Regel 2: Mietbeginn innerhalb 24 Stunden
    const rentalStart = new Date(params.rentalFrom);
    const now = new Date();
    const hoursUntilStart = (rentalStart.getTime() - now.getTime()) / (1000 * 60 * 60);
    if (hoursUntilStart < 24 && hoursUntilStart > -1) {
      reasons.push('Kurzfristiger Mietbeginn');
    }

    // Regel 3: Sehr langer Mietzeitraum (>14 Tage)
    if (params.days > 14) {
      reasons.push('Langer Mietzeitraum');
    }
  } catch (err) {
    console.error('Suspicious detection error:', err);
    // Fehler bei der Erkennung sollen die Buchung nicht blockieren
  }

  return {
    suspicious: reasons.length > 0,
    reasons,
  };
}
