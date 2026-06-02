import { createBrowserClient } from '@supabase/ssr';

/**
 * Browser-side Supabase client mit Cookie-basierter Session.
 * Verwende diesen Client in Client Components für Auth-Operationen.
 * Die Session wird automatisch mit dem Middleware-Cookie synchronisiert.
 */
export function createAuthBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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
