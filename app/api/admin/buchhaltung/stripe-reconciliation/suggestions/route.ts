import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import { sanitizeSearchInput } from '@/lib/search-sanitize';

interface BookingRow {
  id: string;
  customer_name: string | null;
  customer_email: string | null;
  price_total: number;
  created_at: string;
  status: string | null;
}

interface SuggestionItem {
  id: string;
  customer_name: string;
  price_total: number;
  created_at: string;
  status: string;
}

function toItem(b: BookingRow): SuggestionItem {
  return {
    id: b.id,
    customer_name: b.customer_name || b.customer_email || '—',
    price_total: b.price_total,
    created_at: b.created_at,
    status: b.status || 'confirmed',
  };
}

/**
 * GET /api/admin/buchhaltung/stripe-reconciliation/suggestions?amount=X&q=Y
 *
 * Liefert noch nicht verknüpfte Buchungen für die manuelle Stripe-Zuordnung.
 * - `suggestions`: betragsgleich (±2 €, nur wenn `amount` gesetzt und keine Suche)
 * - `others`: alle übrigen unverknüpften Buchungen (bzw. Suchtreffer bei `q`),
 *   inkl. stornierter (mit Status) — der Admin kann jede Buchung manuell wählen.
 */
export async function GET(req: NextRequest) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }

  const amountParam = req.nextUrl.searchParams.get('amount');
  const amount = amountParam ? parseFloat(amountParam) : null;
  const q = sanitizeSearchInput(req.nextUrl.searchParams.get('q'));

  const supabase = createServiceClient();

  // Alle bereits verknüpften Buchungs-IDs aus stripe_transactions
  const { data: matched } = await supabase
    .from('stripe_transactions')
    .select('booking_id')
    .not('booking_id', 'is', null)
    .in('match_status', ['matched', 'manual']);

  const matchedIds = new Set((matched || []).map((m) => m.booking_id).filter(Boolean));

  // Buchungen laden (nicht Test). Stornierte bewusst INKLUDIERT — auch deren
  // Stripe-Zahlungen/Erstattungen müssen buchhalterisch zugeordnet werden.
  let query = supabase
    .from('bookings')
    .select('id, customer_name, customer_email, price_total, created_at, status')
    .eq('is_test', false)
    .order('created_at', { ascending: false })
    .limit(200);

  if (q) {
    query = query.or(
      `id.ilike.%${q}%,customer_name.ilike.%${q}%,customer_email.ilike.%${q}%`
    );
  }

  const { data: bookings } = await query;

  const open = (bookings || [])
    .filter((b) => !matchedIds.has(b.id))
    .map(toItem);

  // Bei aktiver Suche keine Betrags-Vorsortierung — der Admin sucht gezielt.
  if (q) {
    return NextResponse.json({ suggestions: [], others: open });
  }

  // Betragsgleiche (±2 € Toleranz) nach Betrags-Nähe sortiert oben anpinnen.
  let suggestions: SuggestionItem[] = [];
  let others: SuggestionItem[] = open;

  if (amount !== null) {
    suggestions = open
      .filter((b) => Math.abs(b.price_total - amount) <= 2)
      .sort(
        (a, b) =>
          Math.abs(a.price_total - amount) - Math.abs(b.price_total - amount)
      );
    const matchedSet = new Set(suggestions.map((s) => s.id));
    others = open.filter((b) => !matchedSet.has(b.id));
  }

  return NextResponse.json({ suggestions, others });
}
