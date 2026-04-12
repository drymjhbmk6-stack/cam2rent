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
