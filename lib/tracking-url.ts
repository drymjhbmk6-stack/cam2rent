/**
 * Tracking-URL-Helper fuer DHL, DHL Express und DPD.
 *
 * Eine einzige Quelle der Wahrheit. Wird genutzt von:
 *  - app/api/admin/ship-booking/route.ts (Versand-Workflow)
 *  - app/api/admin/booking/[id]/route.ts (manuelles Korrigieren in Buchungsdetail)
 *
 * cam2rent verschickt mit DHL und DPD (Sendcloud-Etikett) sowie — fuer
 * Eil-Sendungen — mit DHL Express. Express-Etiketten kann Sendcloud NICHT
 * erzeugen; sie werden direkt bei DHL gekauft und die Trackingnummer im
 * Buchungsdetail manuell eingetragen. DHL Express hat ein eigenes
 * Verfolgungs-Portal (das Paket-Portal kennt Express-Nummern nicht).
 * Andere Carrier bewusst nicht hinterlegt — bei Bedarf hier ergaenzen.
 */

export type TrackingCarrier = 'DHL' | 'DHL Express' | 'DPD';

export const ALLOWED_CARRIERS: ReadonlyArray<TrackingCarrier> = ['DHL', 'DHL Express', 'DPD'];

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
    return `https://www.dpd.com/de/de/empfangen/sendungsverfolgung/?parcelId=${encodeURIComponent(clean)}`;
  }
  if (carrier === 'DHL Express') {
    // Eigenes Express-Portal — das Paket-Portal (piececode) findet Express-Nummern nicht.
    return `https://www.dhl.com/de-de/home/tracking/tracking-express.html?submit=1&tracking-id=${encodeURIComponent(clean)}`;
  }
  // DHL Paket (Standard / Fallback)
  return `https://www.dhl.de/de/privatkunden/pakete-empfangen/verfolgen.html?piececode=${encodeURIComponent(clean)}`;
}
