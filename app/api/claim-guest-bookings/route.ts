import { NextResponse } from 'next/server';

/**
 * POST /api/claim-guest-bookings
 *
 * DEAKTIVIERT (Audit Sweep 6, Vuln 14):
 * Frueher hat diese Route Gastbuchungen automatisch dem Konto zugeordnet,
 * sobald die E-Mail-Adresse uebereinstimmte. In Kombination mit Express-
 * Signup (`email_confirm: true`) genuegte das, um den Account-Inhalt
 * eines beliebigen Kunden zu uebernehmen, indem man sich mit dessen
 * E-Mail registrierte.
 *
 * Gastbuchungen muessen jetzt vom Admin manuell zugewiesen werden
 * (siehe /admin/buchungen/[id]). Diese Route bleibt als 200/no-op
 * bestehen, damit Login-/Registrierungs-Flows, die sie aufrufen,
 * nicht brechen.
 */
export async function POST() {
  return NextResponse.json({ claimed: 0 });
}
