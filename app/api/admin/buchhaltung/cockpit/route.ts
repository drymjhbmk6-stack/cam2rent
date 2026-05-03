import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';

/**
 * Cockpit-Inbox: aggregiert alle "Heute zu tun"-Punkte fuer die Buchhaltungs-Startseite.
 * Jede Sektion ist defensiv mit try/catch, damit fehlende Tabellen / Migrationen nicht
 * den ganzen Cockpit-View kippen.
 */

export type CockpitTodoSeverity = 'info' | 'warning' | 'critical' | 'ok';

export interface CockpitTodo {
  id: string;
  severity: CockpitTodoSeverity;
  icon: string;
  title: string;
  subtitle?: string;
  count?: number;
  amount?: number;
  action?: { label: string; tab?: string; href?: string };
}

export async function GET() {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }

  const supabase = createServiceClient();
  const todos: CockpitTodo[] = [];
  const now = new Date();

  // 1) Ueberfaellige Rechnungen
  try {
    const { data: openInvoices } = await supabase
      .from('invoices')
      .select('id, gross_amount, invoice_date, due_date')
      .eq('is_test', false)
      .or('status.in.(open,overdue),payment_status.in.(open,overdue)');

    const overdue = (openInvoices ?? []).filter((inv) => {
      const due = inv.due_date ? new Date(inv.due_date) : new Date(inv.invoice_date);
      return due.getTime() < now.getTime();
    });

    if (overdue.length > 0) {
      const totalOverdue = overdue.reduce((s, i) => s + (i.gross_amount || 0), 0);
      todos.push({
        id: 'overdue_invoices',
        severity: overdue.length >= 3 ? 'critical' : 'warning',
        icon: 'alert',
        title: `${overdue.length} überfällige ${overdue.length === 1 ? 'Rechnung' : 'Rechnungen'}`,
        subtitle: `Gesamt offen: ${totalOverdue.toFixed(2).replace('.', ',')} €`,
        count: overdue.length,
        amount: totalOverdue,
        action: { label: 'Mahn-Entwürfe prüfen', tab: 'offene-posten' /* legacy → mapped to einnahmen?sub=offen */ },
      });
    }
  } catch {
    // invoices-Tabelle fehlt — ignorieren
  }

  // 2) Stripe-Buchungen unverknuepft
  try {
    const { data: txs } = await supabase
      .from('stripe_transactions')
      .select('id, match_status, amount, is_test')
      .eq('is_test', false)
      .eq('match_status', 'unmatched');

    const unmatched = txs ?? [];
    if (unmatched.length > 0) {
      const sum = unmatched.reduce((s, t) => s + (t.amount || 0), 0);
      todos.push({
        id: 'unmatched_stripe',
        severity: unmatched.length >= 5 ? 'warning' : 'info',
        icon: 'link',
        title: `${unmatched.length} Stripe-Zahlungen ohne Buchung`,
        subtitle: `Volumen: ${sum.toFixed(2).replace('.', ',')} €`,
        count: unmatched.length,
        amount: sum,
        action: { label: 'Abgleich starten', tab: 'stripe' },
      });
    }
  } catch {
    // stripe_transactions-Tabelle fehlt
  }

  // 3) Lieferanten-Rechnungen wartend auf Klassifizierung
  try {
    const { data: pendingItems } = await supabase
      .from('purchase_items')
      .select('id, net_price, purchase_id, classification')
      .eq('classification', 'pending');

    const pending = pendingItems ?? [];
    if (pending.length > 0) {
      const sum = pending.reduce((s, p) => s + (p.net_price || 0), 0);
      const purchaseCount = new Set(pending.map((p) => p.purchase_id)).size;
      todos.push({
        id: 'pending_purchases',
        severity: 'warning',
        icon: 'inbox',
        title: `${pending.length} ${pending.length === 1 ? 'Position' : 'Positionen'} aus ${purchaseCount} Lieferanten-${purchaseCount === 1 ? 'Rechnung' : 'Rechnungen'}`,
        subtitle: `Klassifizierung offen · Netto: ${sum.toFixed(2).replace('.', ',')} €`,
        count: pending.length,
        amount: sum,
        action: { label: 'Zum Einkauf', href: '/admin/einkauf' },
      });
    }
  } catch {
    // purchase_items-Tabelle fehlt
  }

  // 4) Monatsabschluss-Status — Vergleich gegen aktuellen Monat
  try {
    // Berlin-Monat ermitteln
    const berlinNow = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
    const [yStr, mStr] = berlinNow.split('-');
    const curYear = parseInt(yStr, 10);
    const curMonth = parseInt(mStr, 10); // 1-12
    // Vormonat
    const prevMonth = curMonth === 1 ? 12 : curMonth - 1;
    const prevYear = curMonth === 1 ? curYear - 1 : curYear;
    const prevKey = `${prevYear}-${String(prevMonth).padStart(2, '0')}`;

    const { data: lockSetting } = await supabase
      .from('admin_settings')
      .select('value')
      .eq('key', 'period_locks')
      .maybeSingle();

    const locks = (lockSetting?.value || {}) as Record<string, { locked_at: string }>;
    const prevLocked = !!locks[prevKey];

    // Heute = im aktuellen Monat. Wenn der Vormonat nicht abgeschlossen ist und wir
    // sind nach dem 5. des neuen Monats — dann ist es Zeit.
    const dayOfMonth = parseInt(berlinNow.split('-')[2], 10);
    if (!prevLocked && dayOfMonth >= 1) {
      const monthLabel = new Date(prevYear, prevMonth - 1, 15).toLocaleDateString('de-DE', {
        month: 'long',
        year: 'numeric',
        timeZone: 'Europe/Berlin',
      });
      todos.push({
        id: 'monthly_close',
        severity: dayOfMonth >= 10 ? 'warning' : 'info',
        icon: 'calendar',
        title: `Monatsabschluss ${monthLabel} steht aus`,
        subtitle: dayOfMonth >= 10 ? 'Empfohlen bis zum 10. des Folgemonats' : 'Bald abschließen',
        action: { label: 'Wizard starten', tab: 'reports' },
      });
    }
  } catch {
    // admin_settings-Lookup fehlgeschlagen — kein Abbruch
  }

  // 5) USt-VA-Erinnerung (nur Regelbesteuerung)
  try {
    const { data: taxRow } = await supabase
      .from('admin_settings')
      .select('value')
      .eq('key', 'tax_mode')
      .maybeSingle();
    const taxMode = taxRow?.value || 'kleinunternehmer';

    if (taxMode === 'regelbesteuerung') {
      // USt-VA in DE: 10. des Folgemonats. Wir warnen 5 Tage vorher.
      const berlinNow = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
      const dayOfMonth = parseInt(berlinNow.split('-')[2], 10);
      if (dayOfMonth >= 5 && dayOfMonth <= 10) {
        const daysLeft = Math.max(0, 10 - dayOfMonth);
        todos.push({
          id: 'ust_va_due',
          severity: daysLeft <= 2 ? 'critical' : 'warning',
          icon: 'calendar',
          title: `USt-Voranmeldung fällig in ${daysLeft} ${daysLeft === 1 ? 'Tag' : 'Tagen'}`,
          subtitle: 'Abgabefrist: 10. des Monats',
          action: { label: 'USt-VA vorbereiten', tab: 'reports' },
        });
      }
    }
  } catch {
    // tax_mode-Lookup fehlgeschlagen
  }

  // 6) Offene Mahn-Entwuerfe (vom Cron erstellt, warten auf Freigabe)
  try {
    const { data: drafts } = await supabase
      .from('dunning_notices')
      .select('id, level, fee_amount')
      .eq('status', 'draft');

    const draftsList = drafts ?? [];
    if (draftsList.length > 0) {
      todos.push({
        id: 'dunning_drafts',
        severity: 'warning',
        icon: 'mail',
        title: `${draftsList.length} ${draftsList.length === 1 ? 'Mahn-Entwurf wartet' : 'Mahn-Entwürfe warten'} auf Freigabe`,
        subtitle: 'Vom täglichen Cron erstellt',
        count: draftsList.length,
        action: { label: 'Mahnungen prüfen', tab: 'offene-posten' /* legacy */ },
      });
    }
  } catch {
    // dunning_notices-Tabelle fehlt
  }

  // 7) Gutschriften wartend auf Freigabe
  try {
    const { data: pendingCN } = await supabase
      .from('credit_notes')
      .select('id, gross_amount')
      .eq('is_test', false)
      .eq('status', 'pending_review');

    const pendingList = pendingCN ?? [];
    if (pendingList.length > 0) {
      const sum = pendingList.reduce((s, c) => s + (c.gross_amount || 0), 0);
      todos.push({
        id: 'pending_credit_notes',
        severity: 'info',
        icon: 'check',
        title: `${pendingList.length} ${pendingList.length === 1 ? 'Gutschrift wartet' : 'Gutschriften warten'} auf Freigabe`,
        subtitle: `Summe: ${sum.toFixed(2).replace('.', ',')} €`,
        count: pendingList.length,
        amount: sum,
        action: { label: 'Gutschriften prüfen', tab: 'gutschriften' /* legacy */ },
      });
    }
  } catch {
    // credit_notes-Tabelle fehlt
  }

  // Sortierung: critical > warning > info > ok
  const severityRank: Record<CockpitTodoSeverity, number> = { critical: 0, warning: 1, info: 2, ok: 3 };
  todos.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);

  // Wenn keine ToDos: positives Signal
  if (todos.length === 0) {
    todos.push({
      id: 'all_clear',
      severity: 'ok',
      icon: 'check',
      title: 'Alles erledigt',
      subtitle: 'Keine offenen Aufgaben in der Buchhaltung',
    });
  }

  return NextResponse.json({ todos });
}
