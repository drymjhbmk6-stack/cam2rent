import { createServiceClient } from '@/lib/supabase';

/**
 * Generiert eine Buchungsnummer im Format: C2R-YYKW-NNN
 * Beispiel: C2R-2615-001 (Jahr 2026, Kalenderwoche 15, Laufnummer 1)
 */
export async function generateBookingId(): Promise<string> {
  const now = new Date();
  const year = now.getFullYear().toString().slice(-2); // "26"
  const week = String(getISOWeek(now)).padStart(2, '0'); // "15"

  const supabase = createServiceClient();
  const { count } = await supabase
    .from('bookings')
    .select('*', { count: 'exact', head: true });

  const seq = String((count ?? 0) + 1).padStart(3, '0');
  return `C2R-${year}${week}-${seq}`;
}

/** ISO-Kalenderwoche berechnen */
function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}
