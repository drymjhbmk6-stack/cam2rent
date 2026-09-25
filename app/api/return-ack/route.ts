import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { verifyReturnAckToken } from '@/lib/return-ack-token';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { createAdminNotification } from '@/lib/admin-notifications';
import { getBerlinDateString } from '@/lib/timezone';

/**
 * Rueckmeldung des Kunden auf die Nachsende-Mail (oeffentlich, Token-geschuetzt).
 *
 * POST { bookingId, t, choice: 'will_return' | 'please_bill' }
 *
 * Bewusst POST (nicht GET): Link-Scanner in Mailprogrammen (z. B. Outlook
 * Safe Links) rufen GET-Links automatisch auf — das waere eine falsche
 * „Lesebestaetigung". Erst der Klick auf der Seite zaehlt.
 *
 * Gilt fuer alle noch offenen „Kommt nach"-Positionen der Buchung.
 */

export const dynamic = 'force-dynamic';

const limiter = rateLimit({ maxAttempts: 20, windowMs: 60 * 60 * 1000 });
const CHOICES = ['will_return', 'please_bill'] as const;
type Choice = (typeof CHOICES)[number];

const CHOICE_TEXT: Record<Choice, string> = {
  will_return: 'Kunde hat gelesen — schickt es zurück',
  please_bill: 'Kunde hat es nicht mehr — bittet um Rechnung',
};

function isMissingAckColumn(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  return err.code === '42703' || err.code === 'PGRST204'
    || /customer_ack_(at|choice)/i.test(String(err.message ?? ''));
}

export async function POST(req: NextRequest) {
  if (!limiter.check(`return-ack:${getClientIp(req)}`).success) {
    return NextResponse.json({ error: 'Zu viele Anfragen. Bitte später erneut versuchen.' }, { status: 429 });
  }

  let body: { bookingId?: string; t?: string; choice?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Ungültige Anfrage.' }, { status: 400 });
  }

  const bookingId = String(body.bookingId ?? '').trim().slice(0, 60);
  const token = String(body.t ?? '').trim().slice(0, 100);
  const choice = String(body.choice ?? '') as Choice;
  if (!CHOICES.includes(choice)) {
    return NextResponse.json({ error: 'Ungültige Auswahl.' }, { status: 400 });
  }
  if (!verifyReturnAckToken(bookingId, token)) {
    return NextResponse.json({ error: 'Der Link ist ungültig oder abgelaufen.' }, { status: 403 });
  }

  const supabase = createServiceClient();
  const { data: rows, error } = await supabase
    .from('booking_return_open_items')
    .select('*')
    .eq('booking_id', bookingId)
    .eq('status', 'open')
    .eq('resolution', 'follow_up');
  if (error) {
    return NextResponse.json({ error: 'Rückmeldung konnte nicht gespeichert werden.' }, { status: 500 });
  }
  if (!rows || rows.length === 0) {
    // Nichts mehr offen (z. B. schon eingetroffen) — für den Kunden trotzdem ok.
    return NextResponse.json({ success: true, nothingOpen: true });
  }

  const now = new Date().toISOString();
  const changed = rows.filter((r) => r.customer_ack_choice !== choice);
  if (changed.length === 0) {
    return NextResponse.json({ success: true, alreadyConfirmed: true });
  }

  const noteLine = `${CHOICE_TEXT[choice]} (${getBerlinDateString()})`;
  for (const r of changed) {
    const prev = String(r.notes ?? '').trim();
    const notes = (prev ? `${prev}\n${noteLine}` : noteLine).slice(0, 2000);
    const { error: upErr } = await supabase
      .from('booking_return_open_items')
      .update({ customer_ack_at: now, customer_ack_choice: choice, notes })
      .eq('id', r.id)
      .eq('status', 'open');
    if (upErr && isMissingAckColumn(upErr)) {
      // Migration fehlt → nur die Notiz festhalten.
      await supabase.from('booking_return_open_items').update({ notes }).eq('id', r.id).eq('status', 'open');
    }
  }

  const labels = changed.map((r) => `${r.qty}× ${r.label}`).join(', ');
  createAdminNotification(supabase, {
    type: 'return_ack',
    title: choice === 'will_return' ? 'Kunde schickt fehlende Teile zurück' : 'Kunde bittet um Rechnung für fehlende Teile',
    message: `Buchung ${bookingId} · ${labels}`,
    link: '/admin/retouren?tab=offen',
  }).catch(() => {});

  return NextResponse.json({ success: true });
}
