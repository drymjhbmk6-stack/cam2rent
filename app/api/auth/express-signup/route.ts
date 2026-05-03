import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { getCheckoutConfig } from '@/lib/checkout-config';
import { sendAndLog, escapeHtml } from '@/lib/email';
import { BUSINESS } from '@/lib/business-config';

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
  firstName?: string;
  lastName?: string;
  phone?: string | null;
  street?: string;
  zip?: string;
  city?: string;
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
  const firstName = (body.firstName ?? '').trim().slice(0, 60);
  const lastName = (body.lastName ?? '').trim().slice(0, 60);
  // Backwards-Compat: alter Aufruf mit nur fullName möglich
  const fullName = firstName || lastName
    ? `${firstName} ${lastName}`.trim()
    : (body.fullName ?? '').trim().slice(0, 120);
  const phone = (body.phone ?? '')?.toString().trim().slice(0, 30) || null;
  const street = (body.street ?? '').trim().slice(0, 120);
  const zip = (body.zip ?? '').trim();
  const city = (body.city ?? '').trim().slice(0, 80);

  if (!email || !validateEmail(email)) {
    return NextResponse.json({ error: 'invalid_email' }, { status: 400 });
  }
  if (!password || password.length < 8 || password.length > 128) {
    return NextResponse.json({ error: 'invalid_password', message: 'Passwort muss 8–128 Zeichen haben.' }, { status: 400 });
  }
  // Adress-Validierung nur wenn der Caller die neuen Felder mitschickt.
  // Alte Aufrufer (nur fullName) sollen weiterhin akzeptiert werden, damit
  // wir keinen Backward-Compat-Bruch riskieren.
  const hasAddress = !!(street || zip || city);
  if (hasAddress) {
    if (!street) return NextResponse.json({ error: 'invalid_street' }, { status: 400 });
    if (!/^\d{5}$/.test(zip)) return NextResponse.json({ error: 'invalid_zip' }, { status: 400 });
    if (!city) return NextResponse.json({ error: 'invalid_city' }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Existiert diese E-Mail bereits? Bevorzugt ueber RPC (siehe
  // supabase/supabase-check-email-rpc.sql); listUsers nur als Fallback solange
  // die Migration noch nicht draussen ist. Falls beide nichts liefern, faellt
  // createUser unten als "already registered" zurueck — das ist ohnehin die
  // Wahrheit der Auth-API.
  try {
    const { data: rpcData, error: rpcErr } = await supabase.rpc('check_email_exists', { p_email: email });
    if (!rpcErr && rpcData === true) {
      return NextResponse.json({ exists: true, message: 'E-Mail bereits registriert. Bitte einloggen.' });
    }
    if (rpcErr && !/does not exist|could not find/i.test(rpcErr.message)) {
      console.error('[express-signup] check_email_exists-RPC-Fehler:', rpcErr);
    }
    if (rpcErr && /does not exist|could not find/i.test(rpcErr.message)) {
      // Migration nicht durch — auf Legacy-Pfad fallen
      const { data: listData } = await supabase.auth.admin.listUsers({ perPage: 1000 });
      const existing = listData?.users?.find((u) => u.email?.toLowerCase() === email);
      if (existing) {
        return NextResponse.json({ exists: true, message: 'E-Mail bereits registriert. Bitte einloggen.' });
      }
    }
  } catch (err) {
    console.error('[express-signup] Email-Pruefung fehlgeschlagen:', err);
    // Kein harter Fehler — createUser wuerde eh mit "already registered" antworten
  }

  // User anlegen. email_confirm: true heisst, dass kein Bestaetigungsklick noetig ist,
  // bevor der User sich einloggen kann. Damit kann der Kunde direkt im Checkout weiter.
  // Trotzdem wird ueber sendWelcomeEmail (asynchron) eine Willkommens-Mail geschickt.
  //
  // Sweep 7 Vuln 23 — Display-Name NICHT in user_metadata speichern:
  // Da die E-Mail-Adresse bei email_confirm:true noch nicht verifiziert ist,
  // koennte ein Angreifer ein Konto auf eine fremde E-Mail mit einem
  // beleidigenden/diskreditierenden Namen anlegen. Spaetere Buchungen unter
  // der E-Mail wuerden den Angreifer-Namen auf Rechnung/Vertrag/Versand-Label
  // tragen. Der echte Eigentuemer der Adresse muesste manuell korrigieren.
  // Loesung: full_name erst beim ersten echten Login (oder Buchung) setzen,
  // wenn der Kunde das Profil selbst ausfuellt.
  const createResult = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {},
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
  // Sweep 7 Vuln 23: full_name + Adresse werden NICHT im Profil persistiert,
  // bis die E-Mail durch einen echten Login bestaetigt ist. Phone bleibt drin,
  // weil der Kunde sie aktiv eingegeben hat und sie kein Display-Name ist.
  if (userId) {
    try {
      await supabase.from('profiles').upsert(
        {
          id: userId,
          full_name: null,
          phone: phone,
          address_street: null,
          address_zip: null,
          address_city: null,
          verification_status: 'unverified',
        },
        { onConflict: 'id', ignoreDuplicates: false },
      );
    } catch (err) {
      console.error('[express-signup] Profil-Upsert fehlgeschlagen (nicht kritisch):', err);
    }
  }

  // Sicherheits-Hinweis an die E-Mail-Adresse: jemand hat ein Konto mit dieser
  // Adresse angelegt. Falls das nicht der Eigentuemer der Adresse war, wird er
  // hier alarmiert. Fire-and-forget, damit der Signup nicht blockiert.
  sendAndLog({
    to: email,
    subject: 'Neues Konto bei cam2rent angelegt',
    html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#0f172a;">
      <h2>Konto erstellt</h2>
      <p>Hallo${fullName ? ` ${escapeHtml(fullName)}` : ''},</p>
      <p>fuer diese E-Mail-Adresse wurde gerade ein Konto bei <strong>${escapeHtml(BUSINESS.name)}</strong> angelegt
      (IP: ${escapeHtml(ip)}).</p>
      <p><strong>Warst das du?</strong> Dann kannst du dich ab sofort einloggen — keine weitere Aktion noetig.</p>
      <p><strong>Warst das NICHT du?</strong> Bitte schreibe sofort an
      <a href="mailto:${BUSINESS.emailKontakt}">${BUSINESS.emailKontakt}</a>, damit wir das Konto sperren.
      Bis zur Klaerung kannst du keine Buchungen unter dieser Adresse durchfuehren.</p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
      <p style="font-size:12px;color:#6b7280;">${escapeHtml(BUSINESS.name)} · automatische Sicherheits-Benachrichtigung</p>
    </div>`,
    emailType: 'account_created_alert',
  }).catch((err) => console.error('[express-signup] alert mail failed:', err));

  return NextResponse.json({
    success: true,
    userId,
    message: 'Konto erstellt. Bitte einloggen.',
  });
}
