/**
 * Zentraler Satz von Buchungs-Status, die den Lagerbestand blockieren.
 *
 * Wird von allen Availability-Endpunkten verwendet, damit Shop-Kalender,
 * Admin-Gantt und Buchungsprozess konsistent sind.
 *
 * NICHT enthalten sind:
 *   - 'cancelled'  → frei
 *   - 'returned'   → frei
 *   - 'completed'  → frei (Miete beendet)
 *
 * Der Admin-Gantt zeigt zusätzlich 'completed' damit vergangene Buchungen
 * historisch sichtbar bleiben — für Availability-Prüfungen wird das aber
 * nicht mitgezählt.
 */
export const RESERVING_BOOKING_STATUSES = [
  'pending_verification', // Kunde hat bezahlt, wartet auf Admin-Freigabe
  'awaiting_payment',     // Admin hat freigegeben, Kunde hat Zahlungslink (72h Frist)
  'confirmed',            // Bezahlt, bestätigt
  'shipped',              // Unterwegs zum Kunden
  'picked_up',            // Kunde hat die Kamera abgeholt
  'active',               // Legacy-Alias für picked_up
] as const;

export type ReservingBookingStatus = typeof RESERVING_BOOKING_STATUSES[number];
