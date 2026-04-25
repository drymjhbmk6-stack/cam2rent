import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

/**
 * POST /api/auth/check-email
 * Body: { email: string }
 * Response: { exists: boolean }
 *
 * Prueft ueber die RPC `public.check_email_exists(p_email)`, ob eine E-Mail in
 * `auth.users` existiert. Vorher wurde `supabase.auth.admin.listUsers({
 * perPage: 1000 })` benutzt — das skalierte nicht und liess sich per
 * IP-Rotation enumerieren.
 *
 * Migration: `supabase/supabase-check-email-rpc.sql` ausfuehren, danach laeuft
 * der RPC-Pfad. Bevor die Migration durch ist, faellt der Code auf den alten
 * listUsers-Weg zurueck, damit der Endpoint nicht bricht.
 *
 * Rate-Limit 10/min pro IP — verhindert weitere Enumeration. (Vorher 30/min.)
 */

const limiter = rateLimit({ maxAttempts: 10, windowMs: 60 * 1000 });

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const { success } = limiter.check(`check-email:${ip}`);
  if (!success) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }

  let body: { email?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const email = (body.email ?? '').trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return NextResponse.json({ exists: false });
  }

  const supabase = createServiceClient();

  // Bevorzugt: RPC (skaliert + kein Daten-Leak). Wenn die Migration noch
  // nicht ausgefuehrt ist, liefert Supabase einen "function does not exist"-
  // Fehler — wir fallen dann auf den alten Weg zurueck, damit der Endpoint
  // nicht bricht und sich Bestandsumgebungen ohne Migration weiter benutzen
  // lassen.
  try {
    const { data, error } = await supabase.rpc('check_email_exists', { p_email: email });
    if (!error && typeof data === 'boolean') {
      return NextResponse.json({ exists: data });
    }
    if (error && !/does not exist|could not find/i.test(error.message)) {
      console.error('[check-email] RPC-Fehler:', error);
      return NextResponse.json({ exists: false });
    }
  } catch (err) {
    console.error('[check-email] RPC-Aufruf fehlgeschlagen:', err);
  }

  // Fallback (nur bis Migration ausgefuehrt): listUsers — mit dem Bewusstsein,
  // dass das die alte ineffiziente Loesung ist.
  try {
    const { data } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    const exists = !!data?.users?.some((u) => u.email?.toLowerCase() === email);
    return NextResponse.json({ exists });
  } catch (err) {
    console.error('[check-email] listUsers-Fallback fehlgeschlagen:', err);
    return NextResponse.json({ exists: false });
  }
}
