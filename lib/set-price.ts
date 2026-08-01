/**
 * Einheitliche Set-Preis-Berechnung.
 *
 * Hintergrund (Bug M-5): Der Set-Preis wurde an drei Stellen (Admin-Buchung,
 * Server-Preis-Verifikation, Kunden-Buchungsflow) mit UNTERSCHIEDLICHEM
 * Default fuer `pricing_mode` berechnet, wenn die DB-Spalte NULL war
 * (Admin: `perDay` → price×days, Kunde/Server: `flat` → price). Dadurch
 * bezahlte der Kunde z.B. 20 €, waehrend der Admin 100 € sah.
 *
 * Diese Funktion ist die EINE Wahrheitsquelle. Der Default bei fehlendem
 * `pricingMode` ist bewusst **`flat`** (Kunden-/Server-Verhalten ist
 * massgeblich): nur ein explizites `'perDay'` rechnet tageweise, alles
 * andere (inkl. NULL/undefined) ist ein Pauschalpreis.
 */
export function calcSetPrice(
  price: number,
  pricingMode: string | null | undefined,
  days: number,
): number {
  const p = price ?? 0;
  return pricingMode === 'perDay' ? p * days : p;
}
