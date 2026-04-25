/**
 * Sanitizer fuer User-Input, der in Supabase `.or(...)`-Filter mit `ilike` fliesst.
 *
 * PostgREST-`or()` nimmt einen String der Form
 *   `col1.ilike.%pattern%,col2.ilike.%pattern%`
 * und parst ihn als Filter-Ausdruck. Die Werte sind zwar parametrisiert (also
 * keine SQL-Injection), aber das Komma `,` und runde Klammern `(` `)` werden
 * zur Trennung von Filtern bzw. zum Verschachteln benutzt — ein User-Input mit
 * `","` koennte also einen weiteren Filter anhaengen oder einen `and(...)`-Block
 * starten und so unbeabsichtigt Spalten freilegen oder die Query zerlegen.
 *
 * Zusaetzlich begrenzen wir die Laenge gegen DB-Last (regexp-Matches auf
 * 10k-Zeichen-Strings sind teuer) und entfernen Steuerzeichen.
 */
export function sanitizeSearchInput(input: unknown, maxLength = 100): string {
  if (typeof input !== 'string') return '';
  return input
    // Steuerzeichen + Newline raus
    .replace(/[\x00-\x1f\x7f]/g, '')
    // Trennzeichen aus PostgREST-Filter-Sprache neutralisieren
    .replace(/[,()\\]/g, ' ')
    // ilike-Wildcards (% _) sind okay — der Caller wrappt eh mit %...%, aber ein
    // doppeltes %% wuerde einen Match-All ergeben. Einfaches Trimmen reicht.
    .trim()
    .slice(0, maxLength);
}
