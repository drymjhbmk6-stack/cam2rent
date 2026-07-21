import { createClient } from '@supabase/supabase-js';

/**
 * Lokaler Design-Vorschau-Modus (Website 2.0): Fehlen die Supabase-Env-Variablen
 * (z.B. `npm run dev` ohne `.env`), werden harmlose Platzhalter genutzt, damit
 * die App startet und die statischen Admin-Seiten rendern. Netzwerk-Calls
 * schlagen dann fehl (wird überall abgefangen). In Produktion sind die Variablen
 * IMMER gesetzt → der Fallback greift dort nie.
 */
const DEV_URL = 'http://localhost:54321';
const DEV_KEY = 'local-preview-anon-key';

/**
 * Server-side Supabase client using the service role key.
 * Only use in API routes — never import this in client components.
 * The service role key bypasses Row Level Security.
 */
export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || DEV_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || DEV_KEY
  );
}

/**
 * Client-side Supabase client using the anon key.
 * Safe to use in React components.
 */
export function createBrowserClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || DEV_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || DEV_KEY
  );
}
