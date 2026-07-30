import { createServiceClient } from '@/lib/supabase';

/**
 * Lädt alle Warteliste-Einträge (neueste zuerst), Produktnamen aufgelöst.
 * Geteilt von `GET /api/admin/waitlist` UND der server-gerenderten
 * `/admin/warteliste`-Page → keine Divergenz. Wirft nie.
 */
export interface WaitlistEntryRow {
  id: string;
  product_id: string;
  email: string;
  source: string | null;
  use_case: string | null;
  created_at: string;
  notified_at: string | null;
  product_name?: string;
  [k: string]: unknown;
}

export async function loadWaitlist(): Promise<{ entries: WaitlistEntryRow[]; error: string | null }> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from('waitlist_subscriptions')
    .select('id, product_id, email, source, use_case, created_at, notified_at')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[admin/waitlist] load failed:', error.message);
    return { entries: [], error: error.message };
  }

  // Produktnamen auflösen (aus admin_config.products) — einmaliger Lookup.
  let productMap: Record<string, { name: string }> = {};
  try {
    const { data: cfg } = await supabase
      .from('admin_config')
      .select('value')
      .eq('key', 'products')
      .single();
    const products = (cfg?.value ?? {}) as Record<string, { id: string; name?: string }>;
    productMap = Object.fromEntries(
      Object.entries(products).map(([id, p]) => [id, { name: p.name ?? id }]),
    );
  } catch {
    // best-effort
  }

  const entries: WaitlistEntryRow[] = (data ?? []).map((row) => ({
    ...row,
    product_name: productMap[row.product_id]?.name ?? row.product_id,
  }));

  return { entries, error: null };
}
