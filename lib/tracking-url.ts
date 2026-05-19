/**
 * Tracking-URL-Helper fuer DHL und DPD.
 *
 * Eine einzige Quelle der Wahrheit. Wird genutzt von:
 *  - app/api/admin/ship-booking/route.ts (Versand-Workflow)
 *  - app/api/admin/booking/[id]/route.ts (manuelles Korrigieren in Buchungsdetail)
 *
 * cam2rent verschickt aktuell ausschliesslich mit DHL und DPD (siehe
 * components/ShippingLogos.tsx + Versand-Workflow). Andere Carrier
 * bewusst nicht hinterlegt — bei Bedarf hier ergaenzen.
 */

export type TrackingCarrier = 'DHL' | 'DPD';

export const ALLOWED_CARRIERS: ReadonlyArray<TrackingCarrier> = ['DHL', 'DPD'];

export function isAllowedCarrier(value: unknown): value is TrackingCarrier {
  return typeof value === 'string' && (ALLOWED_CARRIERS as ReadonlyArray<string>).includes(value);
}

/**
 * Baut die Sendungsverfolgungs-URL fuer eine Trackingnummer.
 * Trim ist eingebaut — Aufrufer muessen keinen sauberen String liefern.
 *
 * Default-Carrier ist DHL (Backwards-Compat mit aelterem Code, der nur
 * Trackingnummer + Carrier-String "DPD" als Sonderfall behandelt hat).
 */
export function buildTrackingUrl(carrier: string, trackingNumber: string): string {
  const clean = trackingNumber.trim();
  if (carrier === 'DPD') {
    return `https://www.dpd.com/de/de/empfangen/sendungsverfolgung/?parcelId=${clean}`;
  }
  // DHL (Standard / Fallback)
  return `https://www.dhl.de/de/privatkunden/pakete-empfangen/verfolgen.html?piececode=${clean}`;
}
