import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createServiceClient } from '@/lib/supabase';
import { createAdminNotification } from '@/lib/admin-notifications';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { isTestMode } from '@/lib/env-mode';

/**
 * POST /api/availability-alerts
 *
 * Wird vom Buchungs-Wizard aufgerufen, wenn der Kunde wegen eines fehlenden /
 * ausgebuchten Basis-Sets nicht weiterbuchen kann. Erzeugt einen Eintrag in
 * `availability_alerts` (dedupliziert innerhalb von 24h auf gleicher
 * Kombi Kamera+Set+Zubehoer+Zeitraum+Typ) und feuert beim ersten Auftreten
 * eine `payment_failed`-aehnliche Admin-Notification + Web-Push.
 *
 * Oeffentlich aufrufbar (Kunden-Side), rate-limited per IP (20/h).
 */

const limiter = rateLimit({ maxAttempts: 20, windowMs: 60 * 60 * 1000 });

type AlertType = 'no_basic_set' | 'basic_set_unavailable' | 'set_unavailable' | 'accessory_unavailable';

const ALERT_LABEL: Record<AlertType, string> = {
  no_basic_set: 'Basis-Set fehlt',
  basic_set_unavailable: 'Basis-Set ausgebucht',
  set_unavailable: 'Set ausgebucht',
  accessory_unavailable: 'Zubehör ausgebucht',
};

function isAlertType(s: unknown): s is AlertType {
  return s === 'no_basic_set' || s === 'basic_set_unavailable'
    || s === 'set_unavailable' || s === 'accessory_unavailable';
}

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

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = limiter.check(`availability-alerts:${ip}`);
  if (!rl.success) {
    return NextResponse.json({ error: 'Zu viele Anfragen.' }, { status: 429 });
  }

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const rawAlertType = (body as Record<string, unknown>)?.alert_type;
  if (!isAlertType(rawAlertType)) {
    return NextResponse.json({ error: 'alert_type ungueltig.' }, { status: 400 });
  }
  const alertType: AlertType = rawAlertType;

  const productId = clean(body?.product_id, 100);
  const productName = clean(body?.product_name, 200);
  const setId = clean(body?.set_id, 100);
  const setName = clean(body?.set_name, 200);
  const accessoryId = clean(body?.accessory_id, 100);
  const accessoryName = clean(body?.accessory_name, 200);
  const rentalFrom = cleanDate(body?.rental_from);
  const rentalTo = cleanDate(body?.rental_to);

  // Optional: eingeloggter Kunde → user_id mitschreiben, sonst NULL.
  const cookieStore = await cookies();
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll() {},
      },
    },
  );
  const { data: { user } } = await supabaseAuth.auth.getUser();
  const customerUserId = user?.id ?? null;
  const customerEmail = user?.email ?? null;

  const supabase = createServiceClient();
  const testMode = await isTestMode();

  // Dedupe innerhalb 24h: gleiche Kombi (alert_type, product_id, set_id,
  // accessory_id, rental_from, rental_to) und resolved_at NULL.
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  let dedupeQuery = supabase
    .from('availability_alerts')
    .select('id, occurrence_count, last_seen_at')
    .eq('alert_type', alertType)
    .is('resolved_at', null)
    .gte('last_seen_at', dayAgo);
  dedupeQuery = productId ? dedupeQuery.eq('product_id', productId) : dedupeQuery.is('product_id', null);
  dedupeQuery = setId ? dedupeQuery.eq('set_id', setId) : dedupeQuery.is('set_id', null);
  dedupeQuery = accessoryId ? dedupeQuery.eq('accessory_id', accessoryId) : dedupeQuery.is('accessory_id', null);
  dedupeQuery = rentalFrom ? dedupeQuery.eq('rental_from', rentalFrom) : dedupeQuery.is('rental_from', null);
  dedupeQuery = rentalTo ? dedupeQuery.eq('rental_to', rentalTo) : dedupeQuery.is('rental_to', null);

  const { data: existing } = await dedupeQuery.maybeSingle();

  let isFirstOccurrence = true;

  if (existing?.id) {
    isFirstOccurrence = false;
    await supabase
      .from('availability_alerts')
      .update({
        occurrence_count: (existing.occurrence_count ?? 0) + 1,
        last_seen_at: new Date().toISOString(),
      })
      .eq('id', existing.id);
  } else {
    const { error } = await supabase
      .from('availability_alerts')
      .insert({
        alert_type: alertType,
        product_id: productId,
        product_name: productName,
        set_id: setId,
        set_name: setName,
        accessory_id: accessoryId,
        accessory_name: accessoryName,
        rental_from: rentalFrom,
        rental_to: rentalTo,
        customer_user_id: customerUserId,
        customer_email: customerEmail,
        is_test: testMode,
      });
    if (error && /availability_alerts|relation|does not exist|schema cache|PGRST/i.test(error.message)) {
      // Migration noch nicht durch — Telemetrie verwerfen, Customer-Flow
      // soll trotzdem normal blocken (das passiert im Wizard ohnehin).
      console.warn('[availability-alerts] Migration ausstehend:', error.message);
      return NextResponse.json({ ok: true, persisted: false });
    }
    if (error) {
      console.error('[availability-alerts] Insert-Fehler:', error.message);
      return NextResponse.json({ ok: true, persisted: false });
    }
  }

  // Admin-Notification + Push nur beim ersten Auftreten in 24h, sonst spammen
  // wir den Admin bei jedem Reload des Wizards.
  if (isFirstOccurrence) {
    const periodStr = rentalFrom && rentalTo
      ? `${rentalFrom} – ${rentalTo}`
      : (rentalFrom ?? '');
    const titleSuffix = productName ?? productId ?? 'Unbekannt';
    const title = `${ALERT_LABEL[alertType]} – ${titleSuffix}`;
    const lines: string[] = [];
    if (productName) lines.push(`Kamera: ${productName}`);
    if (setName) lines.push(`Set: ${setName}`);
    if (accessoryName) lines.push(`Zubehör: ${accessoryName}`);
    if (periodStr) lines.push(`Zeitraum: ${periodStr}`);
    if (customerEmail) lines.push(`Kunde: ${customerEmail}`);

    await createAdminNotification(supabase, {
      type: 'availability_alert',
      title,
      message: lines.join(' · '),
      link: '/admin/verfuegbarkeit-alerts',
    });
  }

  return NextResponse.json({ ok: true, persisted: true, isFirstOccurrence });
}
