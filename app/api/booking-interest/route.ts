import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { isTestMode } from '@/lib/env-mode';

/**
 * POST /api/booking-interest
 *
 * Wird vom Buchungs-Wizard aufgerufen, sobald der Kunde die Zusammenfassung
 * (Step 4) erreicht. Erfasst ANONYM (keine user_id, keine E-Mail, keine IP)
 * welche Kamera + welches Zubehoer + welcher Mietzeitraum konfiguriert wurde —
 * fuer die Nachfrage-Analyse im Admin ("Was wird nachgefragt").
 *
 * Oeffentlich aufrufbar (Kunden-Side), rate-limited per IP (60/h) — die IP
 * dient nur dem Rate-Limit und wird NICHT gespeichert.
 */

const limiter = rateLimit({ maxAttempts: 60, windowMs: 60 * 60 * 1000 });

function clean(s: unknown, max = 200): string | null {
  if (typeof s !== 'string') return null;
  const trimmed = s.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

function cleanDate(s: unknown): string | null {
  if (typeof s !== 'string') return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return s;
}

function cleanAccessories(input: unknown): { id: string; name: string; qty: number }[] {
  if (!Array.isArray(input)) return [];
  const out: { id: string; name: string; qty: number }[] = [];
  for (const raw of input.slice(0, 50)) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const id = clean(r.id, 100);
    if (!id) continue;
    const name = clean(r.name, 200) ?? id;
    let qty = Number(r.qty);
    if (!Number.isFinite(qty) || qty < 1) qty = 1;
    qty = Math.min(99, Math.floor(qty));
    out.push({ id, name, qty });
  }
  return out;
}

function daysBetween(from: string | null, to: string | null): number | null {
  if (!from || !to) return null;
  const a = new Date(from + 'T00:00:00Z').getTime();
  const b = new Date(to + 'T00:00:00Z').getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  return Math.round((b - a) / 86400000) + 1;
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = limiter.check(`booking-interest:${ip}`);
  if (!rl.success) {
    return NextResponse.json({ ok: true, persisted: false });
  }

  const body = await req.json().catch(() => ({} as Record<string, unknown>));

  const productId = clean(body?.product_id, 100);
  const productName = clean(body?.product_name, 200);
  if (!productId) {
    return NextResponse.json({ error: 'product_id erforderlich.' }, { status: 400 });
  }
  const setId = clean(body?.set_id, 100);
  const setName = clean(body?.set_name, 200);
  const accessories = cleanAccessories(body?.accessories);
  const rentalFrom = cleanDate(body?.rental_from);
  const rentalTo = cleanDate(body?.rental_to);
  const rentalDays = daysBetween(rentalFrom, rentalTo);
  const deliveryMode = body?.delivery_mode === 'abholung' ? 'abholung'
    : body?.delivery_mode === 'versand' ? 'versand' : null;
  const haftung = clean(body?.haftung, 30);

  const supabase = createServiceClient();
  const testMode = await isTestMode();

  const { error } = await supabase
    .from('booking_interest')
    .insert({
      product_id: productId,
      product_name: productName,
      set_id: setId,
      set_name: setName,
      accessories,
      rental_from: rentalFrom,
      rental_to: rentalTo,
      rental_days: rentalDays,
      delivery_mode: deliveryMode,
      haftung,
      is_test: testMode,
    });

  if (error) {
    // Migration noch nicht durch oder anderer DB-Fehler — Telemetrie verwerfen,
    // der Buchungs-Flow darf davon nie beeintraechtigt werden.
    console.warn('[booking-interest] Insert uebersprungen:', error.message);
    return NextResponse.json({ ok: true, persisted: false });
  }

  return NextResponse.json({ ok: true, persisted: true });
}
