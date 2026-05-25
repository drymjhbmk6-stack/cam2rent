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

// Strikter Sanitizer fuer das optionale `details`-JSONB. Akzeptiert nur die
// Shape, die der Wizard heute sendet: { unavailable_items: [{accessory_id, name,
// needed, remaining}] }. Alles andere wird verworfen, damit kein Free-Text-
// User-Input ungefiltert in der DB landet.
function sanitizeDetails(raw: unknown): { unavailable_items: { accessory_id: string; name: string; needed: number; remaining: number }[] } | null {
  if (!raw || typeof raw !== 'object') return null;
  const items = (raw as { unavailable_items?: unknown }).unavailable_items;
  if (!Array.isArray(items)) return null;
  const cleaned: { accessory_id: string; name: string; needed: number; remaining: number }[] = [];
  for (const it of items.slice(0, 50)) {
    if (!it || typeof it !== 'object') continue;
    const r = it as Record<string, unknown>;
    const accessory_id = clean(r.accessory_id, 100);
    const name = clean(r.name, 200);
    const needed = Number(r.needed);
    const remaining = Number(r.remaining);
    if (!accessory_id || !name) continue;
    if (!Number.isFinite(needed) || needed < 0) continue;
    if (!Number.isFinite(remaining) || remaining < 0) continue;
    cleaned.push({
      accessory_id,
      name,
      needed: Math.min(999, Math.round(needed)),
      remaining: Math.min(9999, Math.round(remaining)),
    });
  }
  return cleaned.length > 0 ? { unavailable_items: cleaned } : null;
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
  const details = sanitizeDetails(body?.details);

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
    // Update: occurrence_count hoch, last_seen_at frisch — und neueste
    // `details`-Aufschluesselung uebernehmen, damit der Admin im UI immer
    // sieht, welche Items beim *letzten* Vorfall fehlten.
    const updPayload: Record<string, unknown> = {
      occurrence_count: (existing.occurrence_count ?? 0) + 1,
      last_seen_at: new Date().toISOString(),
    };
    if (details) updPayload.details = details;
    const { error: updErr } = await supabase
      .from('availability_alerts')
      .update(updPayload)
      .eq('id', existing.id);
    if (updErr && /details|column|schema cache|PGRST/i.test(updErr.message)) {
      // Migration `supabase-availability-alerts-details.sql` noch nicht durch:
      // retryen ohne `details`-Feld, Counter + Zeit trotzdem aktualisieren.
      delete updPayload.details;
      await supabase
        .from('availability_alerts')
        .update(updPayload)
        .eq('id', existing.id);
    }
  } else {
    const insertPayload: Record<string, unknown> = {
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
    };
    if (details) insertPayload.details = details;
    let { error } = await supabase
      .from('availability_alerts')
      .insert(insertPayload);
    if (error && /details|column|schema cache|PGRST/i.test(error.message) && 'details' in insertPayload) {
      // Migration `supabase-availability-alerts-details.sql` ausstehend — Alert
      // ohne Detail-Aufschluesselung anlegen, damit Push + Banner trotzdem
      // gehen.
      delete insertPayload.details;
      const retry = await supabase.from('availability_alerts').insert(insertPayload);
      error = retry.error;
    }
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
    if (details && details.unavailable_items.length > 0) {
      const fehlt = details.unavailable_items
        .map((it) => `${it.name} (benötigt ${it.needed}, frei ${it.remaining})`)
        .join(', ');
      lines.push(`Fehlt: ${fehlt}`);
    }
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
