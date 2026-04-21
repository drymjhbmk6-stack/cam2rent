import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { getCheckoutConfig } from '@/lib/checkout-config';

/**
 * Express-Signup — Konto-Erstellung direkt im Checkout.
 *
 * Legt einen Supabase-User via Admin-API an mit `email_confirm: true`, damit
 * der Client sich sofort mit Email+Passwort einloggen kann. Die Bestaetigungs-
 * Mail wird asynchron ueber das normale Login-/Passwort-Vergessen-System
 * verschickt (siehe /auth/callback fuer den Token-Flow).
 *
 * Rate-Limit: 5 Signups pro Stunde pro IP. Schoent dein Supabase-Free-Tier-
 * Limit (4/h) und verhindert Account-Flooding.
 *
 * Rueckgabe-Codes:
 *   200 { success: true }           — Account erstellt, Client kann einloggen
 *   200 { exists: true }            — E-Mail existiert schon → Login empfehlen
 *   403 { error: 'feature_disabled' } — Admin hat Express-Signup deaktiviert
 *   400 { error: 'invalid_body' }   — Validierung fehlgeschlagen
 *   429 { error: 'rate_limited' }   — Zu viele Versuche
 *   500 { error: '...' }            — Supabase-Fehler
 */

const signupLimiter = rateLimit({ maxAttempts: 5, windowMs: 60 * 60 * 1000 });

type Body = {
  email?: string;
  password?: string;
  fullName?: string;
};

function validateEmail(email: string): boolean {
  // konservativer RFC-5321-Subset
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const limit = signupLimiter.check(`express-signup:${ip}`);
  if (!limit.success) {
    return NextResponse.json(
      { error: 'rate_limited', message: 'Zu viele Registrierungen. Bitte spaeter erneut versuchen.' },
      { status: 429 },
    );
  }

  const cfg = await getCheckoutConfig();
  if (!cfg.expressSignupEnabled) {
    return NextResponse.json({ error: 'feature_disabled' }, { status: 403 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const email = (body.email ?? '').trim().toLowerCase();
  const password = body.password ?? '';
  const fullName = (body.fullName ?? '').trim().slice(0, 120);

  if (!email || !validateEmail(email)) {
    return NextResponse.json({ error: 'invalid_email' }, { status: 400 });
  }
  if (!password || password.length < 8 || password.length > 128) {
    return NextResponse.json({ error: 'invalid_password', message: 'Passwort muss 8–128 Zeichen haben.' }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Existiert diese E-Mail bereits?
  try {
    const { data: listData } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    const existing = listData?.users?.find(
      (u) => u.email?.toLowerCase() === email,
    );
    if (existing) {
      return NextResponse.json({ exists: true, message: 'E-Mail bereits registriert. Bitte einloggen.' });
    }
  } catch (err) {
    console.error('[express-signup] listUsers fehlgeschlagen:', err);
    // Kein harter Fehler — createUser wuerde eh mit "already registered" antworten
  }

  // User anlegen. email_confirm: true heisst, dass kein Bestaetigungsklick noetig ist,
  // bevor der User sich einloggen kann. Damit kann der Kunde direkt im Checkout weiter.
  // Trotzdem wird ueber sendWelcomeEmail (asynchron) eine Willkommens-Mail geschickt.
  const createResult = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: fullName ? { full_name: fullName } : {},
  });

  if (createResult.error) {
    const msg = createResult.error.message || '';
    if (msg.toLowerCase().includes('already') || msg.toLowerCase().includes('registered')) {
      return NextResponse.json({ exists: true, message: 'E-Mail bereits registriert. Bitte einloggen.' });
    }
    console.error('[express-signup] createUser fehlgeschlagen:', createResult.error);
    return NextResponse.json(
      { error: 'create_failed', message: msg || 'Konto konnte nicht erstellt werden.' },
      { status: 500 },
    );
  }

  const userId = createResult.data.user?.id;

  // Profil-Zeile anlegen wenn der handle_new_user-Trigger nicht greift.
  // Idempotent durch UPSERT auf id.
  if (userId) {
    try {
      await supabase.from('profiles').upsert(
        {
          id: userId,
          full_name: fullName || null,
          verification_status: 'unverified',
        },
        { onConflict: 'id', ignoreDuplicates: false },
      );
    } catch (err) {
      console.error('[express-signup] Profil-Upsert fehlgeschlagen (nicht kritisch):', err);
    }
  }

  return NextResponse.json({
    success: true,
    userId,
    message: 'Konto erstellt. Bitte einloggen.',
  });
}
