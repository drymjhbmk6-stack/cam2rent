import { createBrowserClient } from '@supabase/ssr';

/**
 * Browser-side Supabase client mit Cookie-basierter Session.
 * Verwende diesen Client in Client Components für Auth-Operationen.
 * Die Session wird automatisch mit dem Middleware-Cookie synchronisiert.
 */
export function createAuthBrowserClient() {
  // Fallback-Platzhalter für den lokalen Design-Vorschau-Modus ohne `.env`
  // (in Produktion sind die Variablen immer gesetzt → Fallback greift nie).
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'local-preview-anon-key',
    {
      auth: {
        flowType: 'implicit',
      },
    }
  );
}

/**
 * Protokolliert einen ECHTEN Kunden-Login im Login-Verlauf.
 * Wird direkt nach erfolgreichem `signInWithPassword` aufgerufen (nicht über
 * onAuthStateChange — dessen 'SIGNED_IN' feuert bei @supabase/ssr auch bei
 * Session-Wiederherstellung/Tab-Fokus, was Phantom-Logins erzeugen würde).
 * Fire-and-forget; der Server dedupliziert (max. 1/User je 10 Min).
 */
export function recordCustomerLogin(accessToken: string | null | undefined) {
  if (!accessToken) return;
  try {
    void fetch('/api/customer-login-track', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    }).catch(() => {});
  } catch {
    /* ignore */
  }
}
