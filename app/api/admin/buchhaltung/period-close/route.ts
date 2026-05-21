import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth, getCurrentAdminUser } from '@/lib/admin-auth';
import { logAudit } from '@/lib/audit';
import { getBerlinDayStartFromDateString, getBerlinDayEndFromDateString } from '@/lib/timezone';

/**
 * Monatsabschluss-Wizard.
 *
 * GET ?period=YYYY-MM
 *   Liefert Status der vier Pruefschritte:
 *   1. Stripe-Abgleich (Anzahl unmatched im Zeitraum)
 *   2. Lieferanten-Klassifizierung (Anzahl pending purchase_items)
 *   3. EUER-Plausibilitaet (Einnahmen + Ausgaben des Monats)
 *   4. Lock-Status (period_locks[period])
 *
 * POST { period: 'YYYY-MM', confirm: true }
 *   Setzt admin_settings.period_locks[period] = { locked_at, locked_by }
 *   Idempotent — erneutes Schliessen ueberschreibt nicht.
 *
 * DELETE ?period=YYYY-MM
 *   Hebt einen Lock auf (mit Audit-Log + Begruendungs-Pflicht).
 */

interface LockEntry {
  locked_at: string;
  locked_by: string;
  unlocked_at?: string;
  unlocked_by?: string;
  unlock_reason?: string;
}

function validatePeriod(period: string | null): string | null {
  if (!period) return null;
  if (!/^\d{4}-\d{2}$/.test(period)) return null;
  return period;
}

function periodToRange(period: string): { from: string; to: string } {
  const [yearStr, monthStr] = period.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const lastDay = new Date(year, month, 0).getDate();
  return {
    from: `${period}-01`,
    to: `${period}-${String(lastDay).padStart(2, '0')}`,
  };
}

export async function GET(req: NextRequest) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }

  const period = validatePeriod(req.nextUrl.searchParams.get('period'));
  if (!period) {
    return NextResponse.json({ error: 'period im Format YYYY-MM erforderlich' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { from, to } = periodToRange(period);

  // Datumsgrenzen in Berlin-Zeit (wie reports/euer). Auf dem UTC-Server wuerde
  // ein nackter Datums-String sonst als UTC-Mitternacht interpretiert.
  const fromIso = getBerlinDayStartFromDateString(from) ?? `${from}T00:00:00Z`;
  const toIso = getBerlinDayEndFromDateString(to) ?? `${to}T23:59:59Z`;

  // Lock-Status
  const { data: lockSetting } = await supabase
    .from('admin_settings')
    .select('value')
    .eq('key', 'period_locks')
    .maybeSingle();
  const locks = (lockSetting?.value || {}) as Record<string, LockEntry>;
  const lock = locks[period] || null;

  // Schritt 1: Stripe-Abgleich
  let stripeUnmatched = 0;
  let stripeTotal = 0;
  try {
    const { data: txs } = await supabase
      .from('stripe_transactions')
      .select('id, match_status')
      .eq('is_test', false)
      .gte('stripe_created_at', fromIso)
      .lte('stripe_created_at', toIso);
    stripeTotal = (txs ?? []).length;
    stripeUnmatched = (txs ?? []).filter((t) => t.match_status === 'unmatched').length;
  } catch {
    // Tabelle fehlt → Schritt durchwinken
  }

  // Schritt 2: Lieferanten-Klassifizierung
  let purchasePending = 0;
  try {
    const { data: pending } = await supabase
      .from('purchase_items')
      .select('id, purchases:purchase_id(order_date)')
      .eq('classification', 'pending');
    // Nur Items aus dem Monat zaehlen
    purchasePending = (pending ?? []).filter((p) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const order = (p.purchases as any)?.order_date;
      if (!order) return true; // Sicherheits-Default: zaehlen
      return order >= from && order <= to;
    }).length;
  } catch {
    // Tabelle fehlt
  }

  // Schritt 3: EUER-Snapshot — spiegelt exakt die EÜR-Berechnung
  // (reports/euer/route.ts), damit der Wizard-Vorschauwert dem EÜR-Bericht
  // entspricht. Einnahmen aus bookings (nicht invoices), Ausgaben aus
  // expenses-Tabelle UND beleg_positionen der neuen Buchhaltungs-Welt.
  let revenue = 0;
  let expenses = 0;
  let invoiceCount = 0;
  let expenseCount = 0;

  // Einnahmen: realisierter Netto-Umsatz pro Buchung (Rabatt + Erstattung
  // abgezogen — Wasserfall analog reports/euer).
  try {
    const bookingCols = 'price_rental, price_accessories, price_haftung, shipping_price, discount_amount, duration_discount, loyalty_discount, refund_amount';
    const buildQuery = (cols: string) => supabase
      .from('bookings')
      .select(cols)
      .eq('is_test', false)
      .neq('status', 'cancelled')
      .gte('created_at', fromIso)
      .lte('created_at', toIso);
    let { data: bookings, error: bErr } = await buildQuery(bookingCols);
    if (bErr && /refund_amount|column|schema cache|PGRST/i.test(bErr.message)) {
      // Migration supabase-bookings-refund.sql noch nicht durch
      ({ data: bookings, error: bErr } = await buildQuery(bookingCols.replace(', refund_amount', '')));
    }
    type BRow = {
      price_rental: number | null; price_accessories: number | null;
      price_haftung: number | null; shipping_price: number | null;
      discount_amount: number | null; duration_discount: number | null;
      loyalty_discount: number | null; refund_amount: number | null;
    };
    const rows = (bookings ?? []) as unknown as BRow[];
    let acc = 0;
    for (const b of rows) {
      const r = Number(b.price_rental ?? 0);
      const a = Number(b.price_accessories ?? 0);
      const h = Number(b.price_haftung ?? 0);
      const s = Number(b.shipping_price ?? 0);
      const d = Number(b.discount_amount ?? 0) + Number(b.duration_discount ?? 0) + Number(b.loyalty_discount ?? 0);
      const base = r + a;
      let rentalNet = r;
      let accNet = a;
      if (d > 0 && base > 0) {
        rentalNet = Math.max(0, r - Math.min(r, Math.round(d * (r / base) * 100) / 100));
        accNet = Math.max(0, a - Math.min(a, Math.round(d * (a / base) * 100) / 100));
      }
      let refundLeft = Number(b.refund_amount ?? 0);
      const applyRefund = (val: number): number => {
        if (refundLeft <= 0 || val <= 0) return val;
        const c = Math.min(val, refundLeft);
        refundLeft = Math.round((refundLeft - c) * 100) / 100;
        return Math.round((val - c) * 100) / 100;
      };
      rentalNet = applyRefund(rentalNet);
      accNet = applyRefund(accNet);
      const hNet = applyRefund(h);
      const sNet = applyRefund(s);
      acc += rentalNet + accNet + hNet + sNet;
    }
    revenue = Math.round(acc * 100) / 100;
    invoiceCount = rows.length;
  } catch {
    // bookings-Tabelle fehlt
  }

  // Ausgaben Quelle 1: expenses-Tabelle (Spalte gross_amount).
  try {
    const { data: exps } = await supabase
      .from('expenses')
      .select('gross_amount')
      .eq('is_test', false)
      .is('deleted_at', null)
      .gte('expense_date', from)
      .lte('expense_date', to);
    expenses += (exps ?? []).reduce((s, e) => s + (e.gross_amount || 0), 0);
    expenseCount += (exps ?? []).length;
  } catch {
    // ignore
  }

  // Ausgaben Quelle 2: beleg_positionen der neuen Buchhaltungs-Welt
  // (festgeschrieben, klassifiziert als ausgabe/verbrauch/gwg — analog
  // reports/euer). AfA-Positionen erzeugen separate Asset-Eintraege und
  // werden hier NICHT mitgezaehlt.
  try {
    const { data: belegPos } = await supabase
      .from('beleg_positionen')
      .select('gesamt_brutto, beleg:belege!inner(beleg_datum, status, is_test)')
      .in('klassifizierung', ['ausgabe', 'verbrauch', 'gwg']);
    type RawPos = { gesamt_brutto: number | null; beleg: unknown };
    for (const pos of ((belegPos ?? []) as unknown as RawPos[])) {
      const belegRaw = pos.beleg;
      const beleg = (Array.isArray(belegRaw) ? belegRaw[0] : belegRaw) as
        | { beleg_datum: string; status: string; is_test: boolean }
        | null
        | undefined;
      if (!beleg) continue;
      if (beleg.status !== 'festgeschrieben') continue;
      if (beleg.is_test) continue;
      if (beleg.beleg_datum < from || beleg.beleg_datum > to) continue;
      expenses += Number(pos.gesamt_brutto || 0);
      expenseCount += 1;
    }
  } catch {
    // beleg_positionen-Tabelle fehlt
  }
  expenses = Math.round(expenses * 100) / 100;

  // Berechne Status pro Schritt
  const steps = {
    stripe: {
      complete: stripeUnmatched === 0,
      total: stripeTotal,
      unmatched: stripeUnmatched,
    },
    purchases: {
      complete: purchasePending === 0,
      pending: purchasePending,
    },
    euer: {
      complete: true, // immer ok — ist nur Vorschau
      revenue,
      expenses,
      profit: revenue - expenses,
      invoiceCount,
      expenseCount,
    },
    lock: {
      complete: !!lock,
      lock,
    },
  };

  const allComplete = steps.stripe.complete && steps.purchases.complete && steps.euer.complete;

  return NextResponse.json({
    period,
    from,
    to,
    steps,
    canClose: allComplete && !lock,
    isLocked: !!lock,
  });
}

export async function POST(req: NextRequest) {
  // Gesamter Handler in try/catch — eine unbehandelte Exception wuerde sonst
  // einen 500 mit leerem Body liefern, und der Wizard zeigt nur ein
  // kryptisches "Unexpected end of JSON input" statt der echten Ursache.
  try {
    if (!(await checkAdminAuth())) {
      return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
    }

    let body: { period?: string; confirm?: boolean; force?: boolean };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Ungueltiges JSON' }, { status: 400 });
    }

    const period = validatePeriod(body.period || null);
    if (!period) {
      return NextResponse.json({ error: 'period im Format YYYY-MM erforderlich' }, { status: 400 });
    }
    if (!body.confirm) {
      return NextResponse.json({ error: 'confirm:true erforderlich' }, { status: 400 });
    }

    const supabase = createServiceClient();
    const me = await getCurrentAdminUser();

    // Aktuellen Lock-Stand laden. Der Lese-Fehler wird ausgewertet — sonst
    // wuerde bei einem stillen Fehler `locks` auf {} fallen und der folgende
    // Upsert ALLE bereits abgeschlossenen Monate ueberschreiben (Datenverlust).
    const { data: lockSetting, error: loadErr } = await supabase
      .from('admin_settings')
      .select('value')
      .eq('key', 'period_locks')
      .maybeSingle();
    if (loadErr) {
      return NextResponse.json(
        { error: `Lock-Stand konnte nicht geladen werden: ${loadErr.message}` },
        { status: 500 },
      );
    }
    const locks = (lockSetting?.value || {}) as Record<string, LockEntry>;

    if (locks[period] && !locks[period].unlocked_at) {
      return NextResponse.json({ error: 'Periode ist bereits abgeschlossen' }, { status: 409 });
    }

    // Soft-Lock setzen
    locks[period] = {
      locked_at: new Date().toISOString(),
      locked_by: me?.name || me?.email || 'admin',
    };

    const { error } = await supabase
      .from('admin_settings')
      .upsert({ key: 'period_locks', value: locks }, { onConflict: 'key' });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await logAudit({
      action: 'period.close',
      entityType: 'period',
      entityId: period,
      entityLabel: `Monatsabschluss ${period}`,
      changes: { locked_at: locks[period].locked_at },
      request: req,
    });

    return NextResponse.json({ ok: true, lock: locks[period] });
  } catch (e) {
    console.error('[period-close POST] Unerwarteter Fehler:', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Interner Fehler beim Monatsabschluss' },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }

  const period = validatePeriod(req.nextUrl.searchParams.get('period'));
  if (!period) {
    return NextResponse.json({ error: 'period im Format YYYY-MM erforderlich' }, { status: 400 });
  }
  const reason = req.nextUrl.searchParams.get('reason') || '';
  if (!reason || reason.length < 10) {
    return NextResponse.json({ error: 'Begruendung mit mind. 10 Zeichen erforderlich (?reason=...)' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const me = await getCurrentAdminUser();

  const { data: lockSetting } = await supabase
    .from('admin_settings')
    .select('value')
    .eq('key', 'period_locks')
    .maybeSingle();
  const locks = (lockSetting?.value || {}) as Record<string, LockEntry>;

  if (!locks[period]) {
    return NextResponse.json({ error: 'Periode ist nicht gesperrt' }, { status: 404 });
  }

  // Statt zu loeschen: unlock-Marker setzen (Audit-Trail erhalten)
  locks[period] = {
    ...locks[period],
    unlocked_at: new Date().toISOString(),
    unlocked_by: me?.name || me?.email || 'admin',
    unlock_reason: reason,
  };

  await supabase
    .from('admin_settings')
    .upsert({ key: 'period_locks', value: locks }, { onConflict: 'key' });

  await logAudit({
    action: 'period.unlock',
    entityType: 'period',
    entityId: period,
    entityLabel: `Wiedergeoeffnet: ${period}`,
    changes: { reason, original_locked_at: locks[period].locked_at },
    request: req,
  });

  return NextResponse.json({ ok: true });
}
