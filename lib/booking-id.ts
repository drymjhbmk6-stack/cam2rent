import { createServiceClient } from '@/lib/supabase';

/**
 * Generiert eine Buchungsnummer im Format: C2R-YYKW-NNN
 * Beispiel: C2R-2615-001 (Jahr 2026, Kalenderwoche 15, Laufnummer 1)
 *
 * Jahr + KW werden in Berlin-Zeit berechnet — sonst kippt die Nummer
 * zwischen 22:00-02:00 Berlin auf den UTC-Tag (Vorwoche bzw. -jahr)
 * weil der Server in UTC laeuft.
 */
export async function generateBookingId(): Promise<string> {
  const berlin = getBerlinDateParts(new Date());
  const year = String(berlin.year).slice(-2); // "26"
  const week = String(getISOWeekFromParts(berlin)).padStart(2, '0'); // "15"

  const supabase = createServiceClient();
  const { count } = await supabase
    .from('bookings')
    .select('*', { count: 'exact', head: true });

  const seq = String((count ?? 0) + 1).padStart(3, '0');
  return `C2R-${year}${week}-${seq}`;
}

interface BerlinParts { year: number; month: number; day: number }

function getBerlinDateParts(at: Date): BerlinParts {
  // sv-SE: "2026-04-20"
  const iso = at.toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
  const [y, m, d] = iso.split('-').map((n) => parseInt(n, 10));
  return { year: y, month: m, day: d };
}

/** ISO-Kalenderwoche aus Berlin-Datumskomponenten berechnen */
function getISOWeekFromParts({ year, month, day }: BerlinParts): number {
  const d = new Date(Date.UTC(year, month - 1, day));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}
