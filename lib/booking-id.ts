import { createServiceClient } from '@/lib/supabase';
import { isTestMode } from '@/lib/env-mode';

/**
 * Generiert eine Buchungsnummer im Format: C2R-YYKW-NNN
 * Beispiel: C2R-2615-001 (Jahr 2026, Kalenderwoche 15, Laufnummer 1 in dieser Woche)
 *
 * Im Test-Modus wird `TEST-` vorangestellt (z.B. `TEST-C2R-2615-001`),
 * damit die fortlaufende Live-Nummerierung nicht von Test-Buchungen
 * hochgezaehlt wird (GoBD-konform).
 *
 * `opts.isTest` ueberschreibt den globalen Env-Modus — wichtig fuer
 * Tester-User im Live-Modus: ihre Buchungen sind is_test=true, der globale
 * Env-Modus ist live, und ohne diesen Parameter wuerde der Counter live
 * statt test zaehlen → Nummernkollisionen ueber unterschiedliche is_test-
 * Pools moeglich (eine Live-Buchung und eine Tester-Buchung in derselben
 * Woche bekommen sonst beide `001`).
 *
 * Jahr + KW werden in Berlin-Zeit berechnet — sonst kippt die Nummer
 * zwischen 22:00-02:00 Berlin auf den UTC-Tag (Vorwoche bzw. -jahr)
 * weil der Server in UTC laeuft.
 *
 * Zwei-Strategien-Ansatz:
 *   (1) Atomarer RPC `next_booking_counter(year_week, is_test)` — vergibt
 *       garantiert eindeutige Nummern, auch bei paralleler Last. Setzt
 *       voraus dass `supabase-booking-id-counter.sql` migriert ist.
 *   (2) Fallback: COUNT-basierter Kandidat + sequentielle SELECT-Verifikation.
 *       Falls die Kandidaten-ID bereits in `bookings` existiert (z.B. wegen
 *       Drift zwischen is_test-Pools, fehlender Migration oder einer
 *       Pre-Booking-ID-Kollision aus checkout-intent), wird das Suffix
 *       hochgezaehlt bis ein freier Slot gefunden ist. Sequentiell sicher;
 *       fuer parallele Last sollte (1) genutzt werden.
 */
export async function generateBookingId(opts?: { isTest?: boolean }): Promise<string> {
  const berlin = getBerlinDateParts(new Date());
  const yearTwoDigit = String(berlin.year).slice(-2); // "26"
  const week = String(getISOWeekFromParts(berlin)).padStart(2, '0'); // "15"
  const yearWeek = `${yearTwoDigit}${week}`;

  const supabase = createServiceClient();
  const testMode = opts?.isTest ?? (await isTestMode());

  const formatId = (seqNum: number): string => {
    const seq = String(seqNum).padStart(3, '0');
    const base = `C2R-${yearWeek}-${seq}`;
    return testMode ? `TEST-${base}` : base;
  };

  // ── Strategie 1: Atomarer RPC ────────────────────────────────────────────
  // Wenn die Migration durchgelaufen ist, ist `next_booking_counter` parallel-
  // sicher und liefert garantiert eindeutige Werte. Wir verifizieren das
  // Ergebnis trotzdem einmal gegen `bookings` — falls der Counter aus einem
  // Altbestand seedet, koennte er kurzzeitig hinter der Realitaet liegen.
  try {
    const { data: rpcData, error: rpcErr } = await supabase.rpc('next_booking_counter', {
      p_year_week: yearWeek,
      p_is_test: testMode,
    });
    if (!rpcErr && typeof rpcData === 'number' && rpcData > 0) {
      let seqNum = rpcData;
      for (let probe = 0; probe < 50; probe++) {
        const candidate = formatId(seqNum);
        const { data: exists } = await supabase
          .from('bookings').select('id').eq('id', candidate).maybeSingle();
        if (!exists) return candidate;
        // Counter ist hinter der Realitaet → einmalig RPC nochmal aufrufen,
        // damit der Server-Counter aufholt; alternativ lokal weiterzaehlen.
        seqNum++;
      }
    }
  } catch {
    // Migration fehlt oder RPC down → Strategie 2 unten.
  }

  // ── Strategie 2: COUNT-Kandidat + SELECT-Verifikation ────────────────────
  // Beginn + Ende der ISO-Woche (Montag 00:00 Berlin .. Montag 00:00 naechste Woche)
  const { weekStartUTC, weekEndUTC } = isoWeekRangeUTC(berlin);

  const { count } = await supabase
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .eq('is_test', testMode)
    .gte('created_at', weekStartUTC)
    .lt('created_at', weekEndUTC);

  let seqNum = (count ?? 0) + 1;
  // Schutz gegen Endlosschleife — 1000 Iterationen sind mehr als genug fuer
  // jede realistische Woche; danach geben wir den letzten Versuch zurueck.
  for (let probe = 0; probe < 1000; probe++) {
    const candidate = formatId(seqNum);
    const { data: exists, error: existsErr } = await supabase
      .from('bookings').select('id').eq('id', candidate).maybeSingle();
    if (existsErr) {
      // DB-Fehler beim Pruefen — zurueck zum Kandidaten ohne Verifikation,
      // der confirm-cart-Retry-Loop faengt 23505 ab.
      return candidate;
    }
    if (!exists) return candidate;
    seqNum++;
  }
  return formatId(seqNum);
}

/**
 * Erhoeht das numerische Suffix einer Buchungsnummer um eins.
 * Beispiele:
 *   C2R-2620-001          →  C2R-2620-002
 *   TEST-C2R-2620-001     →  TEST-C2R-2620-002
 *   C2R-2620-999          →  C2R-2620-1000 (selten, aber nicht falsch)
 *
 * Nuetzlich nach einem 23505-Insert-Konflikt: statt erneut zu zaehlen
 * (was wegen Race auf dieselbe Nummer fallen kann), wird das Suffix
 * lokal hochgezaehlt bis ein freier Slot gefunden ist.
 */
export function incrementBookingIdSuffix(bookingId: string): string {
  const match = bookingId.match(/^(.+-)(\d+)$/);
  if (!match) return bookingId;
  const [, prefix, numStr] = match;
  const next = String(parseInt(numStr, 10) + 1).padStart(numStr.length, '0');
  return `${prefix}${next}`;
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

/**
 * Liefert UTC-ISO-Strings fuer den Beginn und das Ende der ISO-Woche, in der
 * der gegebene Berlin-Tag liegt. Beginn = Montag 00:00 Berlin, Ende = Montag
 * 00:00 der naechsten Woche (exklusiv). Berlin-Sommer-/Winterzeit wird
 * korrekt beruecksichtigt.
 */
function isoWeekRangeUTC({ year, month, day }: BerlinParts): { weekStartUTC: string; weekEndUTC: string } {
  // ISO: Montag = 1, Sonntag = 7
  const localDate = new Date(Date.UTC(year, month - 1, day));
  const dow = localDate.getUTCDay() || 7; // 1..7
  const mondayDate = new Date(localDate);
  mondayDate.setUTCDate(mondayDate.getUTCDate() - (dow - 1));

  const my = mondayDate.getUTCFullYear();
  const mm = mondayDate.getUTCMonth() + 1;
  const md = mondayDate.getUTCDate();

  // Berlin-Offset fuer den Monatag 00:00 ermitteln (DST-aware)
  const offsetMin = berlinOffsetMinutes(my, mm, md);
  const weekStart = new Date(Date.UTC(my, mm - 1, md, 0, -offsetMin, 0));
  const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
  return { weekStartUTC: weekStart.toISOString(), weekEndUTC: weekEnd.toISOString() };
}

/** Berlin UTC-Offset in Minuten fuer den gegebenen Lokal-Tag (positiv im Sommer/Winter, +60/+120). */
function berlinOffsetMinutes(year: number, month: number, day: number): number {
  // Trick: vergleiche `Date` in UTC vs Berlin via toLocaleString
  const probe = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const berlinNoon = new Date(probe.toLocaleString('en-US', { timeZone: 'Europe/Berlin' }));
  return Math.round((berlinNoon.getTime() - probe.getTime()) / 60000);
}
