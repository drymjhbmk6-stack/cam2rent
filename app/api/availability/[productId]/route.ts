import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createServiceClient } from '@/lib/supabase';
import { getProducts } from '@/lib/get-products';
import { RESERVING_BOOKING_STATUSES } from '@/lib/booking-statuses';
import { isTestMode } from '@/lib/env-mode';
import { resolveBookingCameras } from '@/lib/booking-cameras';
import { getHoldBlockedDays } from '@/lib/cart-holds';
import {
  loadBufferDays,
  computeShipDate,
  computeReturnDueDate,
  getEffectiveLeadDays,
  type BufferDays,
} from '@/lib/booking-buffer';

/**
 * GET /api/availability/[productId]?month=2026-04
 *
 * Returns per-day availability for the given product and month.
 * Public endpoint – no auth required.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ productId: string }> }
) {
  const products = await getProducts();
  const { productId } = await params;
  const month = new URL(req.url).searchParams.get('month');
  const viewerMode = new URL(req.url).searchParams.get('delivery_mode') ?? 'versand';

  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json(
      { error: 'Parameter "month" im Format YYYY-MM erforderlich.' },
      { status: 400 }
    );
  }

  // ── Stock ermitteln ─────────────────────────────────────────────────────────
  const product = products.find((p) => p.id === productId);
  if (!product) {
    return NextResponse.json({ error: 'Produkt nicht gefunden.' }, { status: 404 });
  }
  const totalStock = product.stock;

  // ── Monats-Range berechnen ─────────────────────────────────────────────────
  const [yearStr, monthStr] = month.split('-');
  const year = parseInt(yearStr, 10);
  const mon = parseInt(monthStr, 10);
  const firstDay = `${month}-01`;
  const daysInMonth = new Date(year, mon, 0).getDate();
  const lastDay = `${month}-${String(daysInMonth).padStart(2, '0')}`;

  const supabase = createServiceClient();

  // ── Puffer-Tage laden ─────────────────────────────────────────────────────
  const buf: BufferDays = await loadBufferDays(supabase, {
    versand_before: 2,
    versand_after: 2,
    abholung_before: 0,
    abholung_after: 1,
  });

  // Override-Datumsfelder pro Buchung koennen weiter in die Zukunft reichen
  // als die Default-Puffer — daher 30 Tage Margin auf jeder Seite (max
  // realistisches Override) zusaetzlich zur globalen Puffer-Spannweite.
  const baseBuffer = Math.max(buf.versand_before, buf.versand_after, buf.abholung_before, buf.abholung_after);
  const maxBuffer = baseBuffer + 30;

  // Erweiterten Zeitraum abfragen (Monat + maxBuffer auf beiden Seiten)
  const extFirst = new Date(year, mon - 1, 1 - maxBuffer).toISOString().split('T')[0];
  const extLast = new Date(year, mon - 1, daysInMonth + maxBuffer).toISOString().split('T')[0];

  // ── Buchungen abfragen (erweitert um Puffer) ──────────────────────────────
  // Test-Buchungen (Tester-User auf Live-Seite) blocken den Kunden-Kalender NICHT.
  // Im globalen Test-Modus laufen alle Buchungen als is_test=true → dann zaehlen alle.
  const globalTest = await isTestMode();

  // Eigene User-ID (falls eingeloggt) — eigene Warenkorb-Holds duerfen den
  // eigenen Kalender NICHT als belegt anzeigen. Anonyme Besucher: kein Ausschluss.
  let viewerUserId: string | null = null;
  try {
    const cookieStore = await cookies();
    const supabaseAuth = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll(); },
          setAll() { /* read-only in dieser GET-Route */ },
        },
      },
    );
    const { data: { user } } = await supabaseAuth.auth.getUser();
    viewerUserId = user?.id ?? null;
  } catch {
    viewerUserId = null;
  }

  const selBase = 'id, rental_from, rental_to, delivery_mode, product_name, product_id, unit_id, cameras';
  const sel = `${selBase}, ship_date_override, return_due_date_override`;

  // (a) Legacy + Gleichmodell-Mehrkamera: product_id == productId.
  // (b) Gemischte Modelle: Buchung trägt productId nur in cameras[] (ihr
  //     bookings.product_id ist eine andere/erste Kamera).
  // Cast auf generisches Result-Type weil Supabase bei String-Variable als
  // Select-Argument die Typen nicht ableiten kann.
  type QResult = { data: Record<string, unknown>[] | null; error: { message: string } | null };
  const buildQ1 = async (cols: string): Promise<QResult> => {
    let q = supabase
      .from('bookings')
      .select(cols)
      .eq('product_id', productId)
      .in('status', [...RESERVING_BOOKING_STATUSES])
      .lte('rental_from', extLast)
      .gte('rental_to', extFirst);
    if (!globalTest) q = q.not('is_test', 'is', true);
    return (await q) as unknown as QResult;
  };
  const buildQ2 = async (cols: string): Promise<QResult> => {
    let q = supabase
      .from('bookings')
      .select(cols)
      .contains('cameras', [{ product_id: productId }])
      .in('status', [...RESERVING_BOOKING_STATUSES])
      .lte('rental_from', extLast)
      .gte('rental_to', extFirst);
    if (!globalTest) q = q.not('is_test', 'is', true);
    return (await q) as unknown as QResult;
  };

  let [r1, r2] = await Promise.all([buildQ1(sel), buildQ2(sel)]);

  // Migration supabase-bookings-shipping-overrides.sql noch nicht durch →
  // Override-Spalten droppen und neu fragen. Verhalten dann wie vorher
  // (nur globale Default-Puffer).
  if (r1.error && /ship_date_override|return_due_date_override/i.test(r1.error.message || '')) {
    [r1, r2] = await Promise.all([buildQ1(selBase), buildQ2(selBase)]);
  }

  if (r1.error) {
    console.error('Availability bookings query error:', r1.error);
    return NextResponse.json(
      { error: 'Verfügbarkeit konnte nicht geladen werden.' },
      { status: 500 }
    );
  }
  // q2 schlägt fehl wenn cameras-Spalte fehlt (Migration nicht durch) →
  // defensiv ignorieren, q1 trägt dann das Legacy-Verhalten.
  const mergedById = new Map<string, Record<string, unknown>>();
  for (const b of [...(r1.data ?? []), ...(r2.error ? [] : r2.data ?? [])]) {
    mergedById.set(b.id as string, b);
  }
  const bookings = [...mergedById.values()];

  // ── Blockierte Tage abfragen ───────────────────────────────────────────────
  const { data: blocked, error: blockErr } = await supabase
    .from('product_blocked_dates')
    .select('start_date, end_date')
    .eq('product_id', productId)
    .lte('start_date', lastDay)
    .gte('end_date', firstDay);

  if (blockErr) {
    console.error('Availability blocked query error:', blockErr);
    // Nicht-kritisch: weiter ohne blocked dates
  }

  // ── Warenkorb-Reservierungen FREMDER Kunden als belegt zaehlen ─────────────
  // Eine Kamera im Warenkorb eines anderen Kunden blockt ihren Zeitraum (inkl.
  // Puffer) fuer 30 Min. Eigene Holds werden ausgeschlossen (viewerUserId).
  // Defensiv: fehlende Migration → leere Map, kein Fehler.
  const holdBlockedDays = await getHoldBlockedDays(supabase, {
    productId,
    fromIso: extFirst,
    toIso: extLast,
    excludeUserId: viewerUserId,
    globalTest,
    buf,
  });

  // ── Pro Tag berechnen ──────────────────────────────────────────────────────
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const days: {
    date: string;
    status: 'available' | 'partial' | 'booked' | 'blocked' | 'past';
    available: number;
    total: number;
  }[] = [];

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${month}-${String(d).padStart(2, '0')}`;
    const dateObj = new Date(year, mon - 1, d);

    // Vergangene Tage
    if (dateObj < today) {
      days.push({ date: dateStr, status: 'past', available: 0, total: totalStock });
      continue;
    }

    // Buchungen zählen die diesen Tag überlappen (inkl. Puffer der Buchung + Puffer einer neuen Buchung)
    // Der Viewer-Puffer wird zusätzlich berücksichtigt: Wenn eine neue Buchung an diesem Tag
    // starten/enden würde, braucht sie ebenfalls Puffertage — diese müssen frei sein.
    const viewerBefore = viewerMode === 'abholung' ? buf.abholung_before : buf.versand_before;
    const viewerAfter = viewerMode === 'abholung' ? buf.abholung_after : buf.versand_after;

    let bookedCount = 0;
    if (bookings) {
      for (const bRaw of bookings) {
        const b = bRaw as {
          rental_from: string; rental_to: string;
          delivery_mode?: string; product_name?: string;
          product_id?: string; unit_id?: string; cameras?: unknown;
          ship_date_override?: string | null;
          return_due_date_override?: string | null;
        };
        const bMode = b.delivery_mode ?? 'versand';

        // Effektiver Zeitraum: Override hat Vorrang vor globalen Puffern.
        // Plus Viewer-Puffer (hypothetische neue Buchung braucht Versand vor
        // dieser Buchung + Rueckgabe-Puffer nach dieser Buchung).
        const bShip = computeShipDate(b.rental_from, bMode, buf, b.ship_date_override ?? null);
        const bReturn = computeReturnDueDate(b.rental_to, bMode, buf, b.return_due_date_override ?? null);
        const bFrom = new Date(bShip);
        const bTo = new Date(bReturn);
        bFrom.setDate(bFrom.getDate() - viewerAfter);
        bTo.setDate(bTo.getDate() + viewerBefore);
        // toIsoDate-aequivalent inline (Local-Date statt UTC-Shift)
        const fmtD = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const effFrom = fmtD(bFrom);
        const effTo = fmtD(bTo);

        if (effFrom <= dateStr && effTo >= dateStr) {
          // Eine Buchung belegt so viele Einheiten DIESES Produkts wie sie
          // Kameras dieses Produkts enthält (cameras[] = Wahrheit; Legacy:
          // product_name-Split, product_id = dieses Produkt). Gemischte
          // Modelle zählen pro Produkt korrekt — sonst Überbuchung.
          bookedCount += resolveBookingCameras(b).filter(
            (c) => c.product_id === productId,
          ).length;
        }
      }
    }

    // Blockierungen zählen
    let blockedCount = 0;
    if (blocked) {
      for (const bl of blocked) {
        if (bl.start_date <= dateStr && bl.end_date >= dateStr) {
          blockedCount++;
        }
      }
    }

    // Warenkorb-Reservierungen fremder Kunden an diesem Tag.
    const heldCount = holdBlockedDays.get(dateStr) ?? 0;

    const available = Math.max(0, totalStock - bookedCount - blockedCount - heldCount);

    let status: 'available' | 'partial' | 'booked' | 'blocked';
    if (blockedCount >= totalStock) {
      status = 'blocked';
    } else if (available === 0) {
      status = 'booked';
    } else if (available < totalStock) {
      status = 'partial';
    } else {
      status = 'available';
    }

    days.push({ date: dateStr, status, available, total: totalStock });
  }

  // Vorlaufzeit fuer die neue Buchung (ab heute): entspricht dem
  // admin-konfigurierten "Puffer vorher" fuer den aktuellen Lieferungs-Modus.
  // Optionaler Cutoff-Hour (admin_settings.booking_buffer_days.<mode>_cutoff_hour)
  // erhoeht den Vorlauf um +1 Tag, wenn die aktuelle Berlin-Stunde >= Cutoff ist —
  // verhindert z.B. eine "23:59-Buchung mit 3 Tagen Versand-Vorlauf" zu akzeptieren,
  // obwohl der Versand heute nicht mehr rausgeht.
  // Frontend rendert Tage innerhalb dieser Frist visuell als gesperrt.
  const leadTimeDays = getEffectiveLeadDays(buf, viewerMode);

  return NextResponse.json({
    days,
    leadTimeDays,
    bufferConfig: buf,
  });
}
