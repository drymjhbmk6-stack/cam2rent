import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth, getCurrentAdminUser } from '@/lib/admin-auth';
import { logAudit } from '@/lib/audit';

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
      .gte('stripe_created_at', `${from}T00:00:00`)
      .lte('stripe_created_at', `${to}T23:59:59`);
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

  // Schritt 3: EUER-Snapshot
  let revenue = 0;
  let expenses = 0;
  let invoiceCount = 0;
  let expenseCount = 0;
  try {
    const { data: invs } = await supabase
      .from('invoices')
      .select('gross_amount')
      .eq('is_test', false)
      .neq('status', 'cancelled')
      .gte('invoice_date', from)
      .lte('invoice_date', to);
    revenue = (invs ?? []).reduce((s, i) => s + (i.gross_amount || 0), 0);
    invoiceCount = (invs ?? []).length;
  } catch {
    // ignore
  }
  try {
    const { data: exps } = await supabase
      .from('expenses')
      .select('amount')
      .eq('is_test', false)
      .is('deleted_at', null)
      .gte('expense_date', from)
      .lte('expense_date', to);
    expenses = (exps ?? []).reduce((s, e) => s + (e.amount || 0), 0);
    expenseCount = (exps ?? []).length;
  } catch {
    // ignore
  }

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

  // Aktuellen Lock-Stand laden
  const { data: lockSetting } = await supabase
    .from('admin_settings')
    .select('value')
    .eq('key', 'period_locks')
    .maybeSingle();
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
