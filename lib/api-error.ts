import { NextResponse } from 'next/server';

/**
 * Zentrales Error-Handling für API-Routes.
 *
 * Problem: `error.message` aus Supabase/Postgres leakt interne Struktur
 * (Spaltennamen, Table-Namen, Constraint-Namen) an den Client — das hilft
 * Angreifern bei Reconnaissance.
 *
 * Verwendung:
 *   const { data, error } = await supabase.from(...).select(...);
 *   if (error) return safeError(error, 'Fehler beim Laden.', 'load_something');
 *
 * Im Development werden die Original-Fehler zurückgegeben (Debug-Komfort).
 * In Production gibt es nur die generische Message an den Client, der
 * Original-Fehler wird mit Context-Tag in die Server-Logs geschrieben.
 */
export function safeError(
  err: unknown,
  publicMessage: string,
  logTag: string,
  status: number = 500,
): NextResponse {
  const rawMessage = err instanceof Error ? err.message : String(err);
  // Kontext mit Tag loggen, damit man den Fehler in Coolify-Logs findet.
  console.error(`[${logTag}] ${rawMessage}`, err);

  // Nur in Development die Original-Message durchlassen. Production gibt
  // immer den generischen Text zurück.
  const isProd = process.env.NODE_ENV === 'production';
  const clientMessage = isProd ? publicMessage : `${publicMessage} (${rawMessage})`;

  return NextResponse.json({ error: clientMessage }, { status });
}
