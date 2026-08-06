import { NextRequest, NextResponse } from 'next/server';
import { getCurrentAdminUser } from '@/lib/admin-auth';
import { hasPermission } from '@/lib/admin-users';
import { createServiceClient } from '@/lib/supabase';
import { isTestMode } from '@/lib/env-mode';
import { sanitizeSearchInput } from '@/lib/search-sanitize';

export const dynamic = 'force-dynamic';

/**
 * Globale Admin-Suche für die Command-Palette (Cmd+K, Schritt 4).
 *
 * Rein lesend. Diese Route hat bewusst KEINEN Eintrag in `API_PATH_PERMISSIONS`
 * (Middleware) → erreichbar für jeden eingeloggten Admin, wie `/dashboard-data`.
 * Die Autorisierung passiert HIER pro Entitätstyp: es werden nur die Bereiche
 * durchsucht, für die der User die passende Permission hat (Owner sieht alles).
 * Test-/Live-Isolation via `isTestMode()` (Buchungen).
 */

interface SearchResult {
  type: 'booking' | 'customer' | 'inventory';
  typeLabel: string;
  label: string;
  sublabel?: string;
  href: string;
}

export async function GET(req: NextRequest) {
  const me = await getCurrentAdminUser();
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const q = sanitizeSearchInput(req.nextUrl.searchParams.get('q'));
  if (q.length < 2) return NextResponse.json({ results: [] });

  const supabase = createServiceClient();
  const like = `%${q}%`;
  const results: SearchResult[] = [];
  const tasks: Promise<void>[] = [];

  // Buchungen (tagesgeschaeft) — id (C2R-…), Kundenname/-mail, Produktname
  if (hasPermission(me, 'tagesgeschaeft')) {
    tasks.push(
      (async () => {
        try {
          const testMode = await isTestMode();
          const { data } = await supabase
            .from('bookings')
            .select('id, customer_name, customer_email, product_name')
            .eq('is_test', testMode)
            .or(
              `id.ilike.${like},customer_name.ilike.${like},customer_email.ilike.${like},product_name.ilike.${like}`,
            )
            .order('created_at', { ascending: false })
            .limit(6);
          for (const b of data ?? []) {
            results.push({
              type: 'booking',
              typeLabel: 'Buchung',
              label: b.id as string,
              sublabel: [b.customer_name, b.product_name].filter(Boolean).join(' · ') || undefined,
              href: `/admin/buchungen/${b.id}`,
            });
          }
        } catch {
          /* eine kaputte Teilsuche blockiert die anderen nicht */
        }
      })(),
    );
  }

  // Kunden (kunden) — Name (E-Mail liegt in auth.users, hier bewusst nur Name/Telefon)
  if (hasPermission(me, 'kunden')) {
    tasks.push(
      (async () => {
        try {
          const { data } = await supabase
            .from('profiles')
            .select('id, full_name, phone')
            .or(`full_name.ilike.${like},phone.ilike.${like}`)
            .order('created_at', { ascending: false })
            .limit(6);
          for (const p of data ?? []) {
            results.push({
              type: 'customer',
              typeLabel: 'Kunde',
              label: (p.full_name as string) || '(ohne Namen)',
              sublabel: (p.phone as string) || undefined,
              href: `/admin/kunden/${p.id}`,
            });
          }
        } catch {
          /* ignore */
        }
      })(),
    );
  }

  // Inventar (katalog) — Bezeichnung, Inventar-Code, Seriennummer
  if (hasPermission(me, 'katalog')) {
    tasks.push(
      (async () => {
        try {
          const { data } = await supabase
            .from('inventar_units')
            .select('id, bezeichnung, inventar_code, seriennummer')
            .or(`bezeichnung.ilike.${like},inventar_code.ilike.${like},seriennummer.ilike.${like}`)
            .limit(6);
          for (const u of data ?? []) {
            results.push({
              type: 'inventory',
              typeLabel: 'Inventar',
              label: (u.bezeichnung as string) || (u.inventar_code as string) || (u.id as string),
              sublabel: [u.inventar_code, u.seriennummer].filter(Boolean).join(' · ') || undefined,
              href: `/admin/inventar/${u.id}`,
            });
          }
        } catch {
          /* ignore */
        }
      })(),
    );
  }

  await Promise.allSettled(tasks);
  return NextResponse.json({ results });
}
