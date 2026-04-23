import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { createAdminNotification } from '@/lib/admin-notifications';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

const waitlistLimiter = rateLimit({ maxAttempts: 10, windowMs: 60 * 60 * 1000 }); // 10/h

/**
 * POST /api/waitlist
 * Body: { productId: string; email: string; source?: 'card' | 'detail' }
 *
 * Trägt einen Interessenten für eine Kamera ohne Seriennummer in die
 * Warteliste ein. Dupletten (gleiches Produkt + gleiche E-Mail) werden
 * idempotent als Erfolg behandelt — der Nutzer bekommt kein "Fehler".
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (!waitlistLimiter.check(ip).success) {
    return NextResponse.json({ error: 'Zu viele Anfragen. Bitte versuche es später erneut.' }, { status: 429 });
  }

  let body: { productId?: string; email?: string; source?: string; useCase?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Ungültige Anfrage.' }, { status: 400 });
  }

  const productId = typeof body.productId === 'string' ? body.productId.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const source = typeof body.source === 'string' ? body.source.slice(0, 32) : null;
  const useCase =
    typeof body.useCase === 'string' && body.useCase.trim()
      ? body.useCase.trim().slice(0, 200)
      : null;

  if (!productId) {
    return NextResponse.json({ error: 'Produkt fehlt.' }, { status: 400 });
  }
  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'Bitte gib eine gültige E-Mail-Adresse an.' }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Produkt aus admin_config.products nachschlagen (für Admin-Notification)
  let productName = productId;
  try {
    const { data: config } = await supabase
      .from('admin_config')
      .select('value')
      .eq('key', 'products')
      .single();
    const products = (config?.value ?? {}) as Record<string, { id: string; name?: string }>;
    const entry = products[productId];
    if (entry?.name) productName = entry.name;
  } catch {
    // best-effort — Name ist nur für Notification
  }

  // Duplikat-sicher via unique-constraint (product_id, email)
  const { error } = await supabase
    .from('waitlist_subscriptions')
    .insert({ product_id: productId, email, source, use_case: useCase });

  if (error) {
    // 23505 = unique_violation → Interessent steht bereits auf der Liste
    if (error.code === '23505') {
      return NextResponse.json({ ok: true, alreadyRegistered: true });
    }
    console.error('[waitlist] insert failed:', error.message);
    return NextResponse.json({ error: 'Speichern fehlgeschlagen.' }, { status: 500 });
  }

  // Admin-Benachrichtigung (non-blocking — aber wir awaiten, damit sie sicher
  // angelegt wird; Push ist innerhalb fire-and-forget)
  const useCaseSuffix = useCase ? ` Nutzung: ${useCase}.` : '';
  await createAdminNotification(supabase, {
    type: 'new_waitlist',
    title: `Neuer Warteliste-Eintrag: ${productName}`,
    message: `${email} möchte benachrichtigt werden, sobald ${productName} verfügbar ist.${useCaseSuffix}`,
    link: '/admin/warteliste',
  });

  return NextResponse.json({ ok: true });
}
