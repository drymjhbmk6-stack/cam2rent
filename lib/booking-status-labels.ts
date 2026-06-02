/**
 * Zentrale Status-Konfiguration fuer Buchungen (Admin-Ansicht): deutsches
 * Label + Akzentfarbe + Hintergrund. Genutzt von der Buchungsliste
 * (`/admin/buchungen`) und der Buchungs-Detailseite (`/admin/buchungen/[id]`),
 * damit Label/Farbe nicht doppelt gepflegt werden muessen.
 *
 * WICHTIG: Dies ist die Admin-Palette. Andere Ansichten nutzen BEWUSST
 * abweichende Labels/Farben (Kundenkonto `/konto/buchungen` mit eigenem
 * Wortlaut + className-Shape, `/admin/auftragskalender` mit anderer
 * bg-Palette, der Stripe-Abgleich mit kuerzeren Labels) und werden NICHT
 * hierueber gespeist — sonst aendert sich deren Aussehen.
 */
export const BOOKING_STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pending_verification: { label: 'Warte auf Freigabe', color: '#f59e0b', bg: '#f59e0b14' },
  awaiting_payment: { label: 'Warte auf Zahlung', color: '#8b5cf6', bg: '#8b5cf614' },
  confirmed: { label: 'Bestätigt', color: '#06b6d4', bg: '#06b6d414' },
  preparing_shipment: { label: 'Wird versendet', color: '#f59e0b', bg: '#f59e0b14' },
  awaiting_pickup: { label: 'Warten auf Abholung', color: '#14b8a6', bg: '#14b8a614' },
  shipped: { label: 'Versendet', color: '#10b981', bg: '#10b98114' },
  delivered: { label: 'Zugestellt', color: '#22c55e', bg: '#22c55e14' },
  picked_up: { label: 'Abgeholt', color: '#10b981', bg: '#10b98114' },
  returned: { label: 'Retourniert', color: '#8b5cf6', bg: '#8b5cf614' },
  completed: { label: 'Abgeschlossen', color: '#64748b', bg: '#64748b14' },
  cancelled: { label: 'Storniert', color: '#ef4444', bg: '#ef444414' },
  damaged: { label: 'Beschädigt', color: '#f97316', bg: '#f9731614' },
};
