import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/customer-login-track
 *
 * Protokolliert einen erfolgreichen Kunden-Login in `customer_login_history`.
 * Wird vom AuthProvider bei `onAuthStateChange('SIGNED_IN')` fire-and-forget
 * mit dem Session-Access-Token im Authorization-Header aufgerufen.
 *
 * Sicherheit: der User wird ausschliesslich ueber das mitgelieferte JWT
 * aufgeloest (`auth.getUser(token)`) — ein Angreifer kann keinen Login fuer
 * eine fremde user_id eintragen.
 *
 * Dedupe: max. 1 Zeile pro User je 10 Minuten (Tab-Wechsel / Re-Validierung
 * feuern 'SIGNED_IN' teils mehrfach).
 *
 * Defensiv: fehlt die Migration, ist der Endpoint ein No-Op (kein 500).
 */

const limiter = rateLimit({ maxAttempts: 30, windowMs: 60 * 60 * 1000 });

function isMissingTable(err: { message?: string; code?: string } | null): boolean {
  if (!err) return false;
  const m = `${err.message || ''}`.toLowerCase();
  return (
    err.code === '42P01' ||
    m.includes('customer_login_history') ||
    m.includes('schema cache') ||
    m.includes('does not exist')
  );
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : '';
    if (!token) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    const ip = getClientIp(req);
    const rl = limiter.check(`login-track:${ip}`);
    if (!rl.success) {
      return NextResponse.json({ ok: false }, { status: 429 });
    }

    const supabase = createServiceClient();
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser(token);

    if (userErr || !user) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    // Reaktivierung: war das Konto wegen Inaktivitaet auf "inaktiv" gesetzt oder
    // stand eine Inaktivitaets-Warnung an, wird durch diesen Login beides
    // zurueckgesetzt → Konto ist wieder aktiv, Inaktivitaets-Uhr laeuft neu.
    // Defensiv: fehlt die Migration (Spalten), wird der Fehler ignoriert.
    try {
      const { data: prof } = await supabase
        .from('profiles')
        .select('deactivated_at, inactive_warning_sent_at')
        .eq('id', user.id)
        .maybeSingle();
      if (prof && (prof.deactivated_at || prof.inactive_warning_sent_at)) {
        await supabase
          .from('profiles')
          .update({ deactivated_at: null, inactive_warning_sent_at: null })
          .eq('id', user.id);
      }
    } catch {
      /* Spalten fehlen (Migration) → kein Reaktivierungs-Reset noetig */
    }

    // Dedupe: existiert in den letzten 10 Minuten schon ein Login fuer diesen User?
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: recent, error: recentErr } = await supabase
      .from('customer_login_history')
      .select('id')
      .eq('user_id', user.id)
      .gte('created_at', tenMinAgo)
      .limit(1);

    if (recentErr) {
      if (isMissingTable(recentErr)) {
        return NextResponse.json({ ok: true, skipped: 'migration_pending' });
      }
      // Anderer Lesefehler — nicht kritisch, kein Insert versuchen.
      return NextResponse.json({ ok: true });
    }

    if (recent && recent.length > 0) {
      return NextResponse.json({ ok: true, deduped: true });
    }

    const ua = (req.headers.get('user-agent') || '').slice(0, 400);
    const { error: insErr } = await supabase.from('customer_login_history').insert({
      user_id: user.id,
      email: user.email || null,
      ip,
      user_agent: ua,
    });

    if (insErr && !isMissingTable(insErr)) {
      console.error('login-track insert error:', insErr);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('POST /api/customer-login-track error:', err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
