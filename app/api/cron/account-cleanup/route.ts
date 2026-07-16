import { NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/cron-auth';
import { createServiceClient } from '@/lib/supabase';
import { acquireCronLock, releaseCronLock } from '@/lib/cron-lock';
import {
  loadAccountLifecycleConfig,
  type AccountLifecycleConfig,
} from '@/lib/account-lifecycle-config';
import { anonymizeCustomerCore } from '@/lib/anonymize-customer';
import {
  sendUnverifiedDeletionWarning,
  sendInactiveDeactivationWarning,
} from '@/lib/email';
import { logAudit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * GET/POST /api/cron/account-cleanup
 *
 * Taeglich auszufuehren (z.B. 07:30 Berlin). Vier Schritte:
 *
 *  1. Nicht verifizierte Konten (verification_status IS NULL/'none') OHNE
 *     Buchung, aelter als `unverified_warn_after_days` → letzte Erinnerungs-Mail
 *     (`account_unverified_warning`) + Marker `unverified_warning_sent_at`.
 *  2. Nicht verifizierte Konten, deren Erinnerung > `unverified_grace_hours` her
 *     ist und die immer noch nicht verifiziert sind → anonymisieren + Profil
 *     entfernen (Konto ist damit weg, E-Mail wieder frei).
 *  3. Inaktive Konten (kein Login seit `inactive_warn_after_days`) → Warn-Mail
 *     (`account_inactive_warning`) + Marker `inactive_warning_sent_at`.
 *  4. Inaktive Konten, deren Warnung > `inactive_grace_days` her ist und die
 *     sich nicht neu eingeloggt haben → DEAKTIVIEREN (deactivated_at), NICHT
 *     loeschen. Reaktivierung automatisch beim naechsten Login
 *     (siehe /api/customer-login-track).
 *
 * Sicherheits-/Datenschutz-Filter durchgehend: Tester-, gesperrte, bereits
 * anonymisierte und bereits deaktivierte Konten werden ausgenommen; die
 * Loeschung Unverifizierter greift nur bei Konten OHNE jede Buchung; die
 * Deaktivierung nimmt Konten mit offener Buchung aus.
 *
 * Crontab (--resolve umgeht Cloudflare, siehe CLAUDE.md):
 *   30 7 * * * curl -s -X POST --resolve cam2rent.de:443:127.0.0.1 \
 *       -H "x-cron-secret: $CRON_SECRET" https://cam2rent.de/api/cron/account-cleanup
 */
export async function GET(req: NextRequest) { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }

type SB = ReturnType<typeof createServiceClient>;

// Buchungen in diesen Status gelten als "offen" (blockieren die Deaktivierung).
const TERMINAL_STATUSES = ['cancelled', 'completed', 'returned'];

async function handle(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const lock = await acquireCronLock('account-cleanup');
  if (!lock.acquired) {
    return NextResponse.json({ skipped: lock.reason });
  }

  try {
    const supabase = createServiceClient();
    const config = await loadAccountLifecycleConfig(supabase);
    if (!config.enabled) {
      return NextResponse.json({ ok: true, skipped: 'disabled' });
    }

    // Auth-User einmal laden (E-Mail + letzter Login) — fuer alle 4 Schritte.
    const authMap = await loadAuthUsers(supabase);

    const result: Record<string, unknown> = {};
    result.unverified_warned = await stepUnverifiedWarn(supabase, config, authMap);
    result.unverified_deleted = await stepUnverifiedDelete(supabase, config, req);
    result.inactive_warned = await stepInactiveWarn(supabase, config, authMap);
    result.inactive_deactivated = await stepInactiveDeactivate(supabase, config, authMap, req);

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error('[account-cleanup] fatal:', err);
    return NextResponse.json({ ok: false, error: 'internal' }, { status: 500 });
  } finally {
    await releaseCronLock('account-cleanup');
  }
}

// ─── Auth-User laden (paginiert) ──────────────────────────────────────────────
interface AuthInfo { email: string | null; lastSignIn: string | null }

async function loadAuthUsers(supabase: SB): Promise<Map<string, AuthInfo>> {
  const map = new Map<string, AuthInfo>();
  try {
    for (let page = 1; page <= 20; page++) {
      const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) break;
      const users = data?.users ?? [];
      for (const u of users) {
        map.set(u.id, { email: u.email || null, lastSignIn: u.last_sign_in_at || null });
      }
      if (users.length < 1000) break;
    }
  } catch (err) {
    console.error('[account-cleanup] loadAuthUsers:', err);
  }
  return map;
}

// Nur Profil-Spalten laden, die es vor der Migration evtl. nicht gibt → defensiv.
function isMissingColumn(err: { message?: string; code?: string } | null): boolean {
  if (!err) return false;
  const m = `${err.message || ''}`.toLowerCase();
  return err.code === '42703' || m.includes('column') || m.includes('schema cache');
}

/** userIds, die ueberhaupt eine Buchung haben. */
async function userIdsWithAnyBooking(supabase: SB, ids: string[]): Promise<Set<string>> {
  const set = new Set<string>();
  if (ids.length === 0) return set;
  const { data } = await supabase.from('bookings').select('user_id').in('user_id', ids);
  for (const b of data ?? []) if (b.user_id) set.add(b.user_id);
  return set;
}

/** userIds mit offener (nicht-terminaler) Buchung. */
async function userIdsWithOpenBooking(supabase: SB, ids: string[]): Promise<Set<string>> {
  const set = new Set<string>();
  if (ids.length === 0) return set;
  const { data } = await supabase
    .from('bookings')
    .select('user_id, status')
    .in('user_id', ids)
    .not('status', 'in', `(${TERMINAL_STATUSES.join(',')})`);
  for (const b of data ?? []) if (b.user_id) set.add(b.user_id);
  return set;
}

// ─── Schritt 1: Unverifizierte warnen ─────────────────────────────────────────
async function stepUnverifiedWarn(
  supabase: SB,
  config: AccountLifecycleConfig,
  authMap: Map<string, AuthInfo>,
): Promise<number> {
  const cutoff = new Date(Date.now() - config.unverified_warn_after_days * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, verification_status, created_at')
    .or('verification_status.is.null,verification_status.eq.none')
    .lt('created_at', cutoff)
    .is('unverified_warning_sent_at', null)
    .is('deactivated_at', null)
    .not('anonymized', 'is', true)
    .not('is_tester', 'is', true)
    .not('blacklisted', 'is', true)
    .limit(200);
  if (error) {
    if (isMissingColumn(error)) return -1; // Migration fehlt → No-Op
    console.error('[account-cleanup] unverified-warn select:', error);
    return 0;
  }
  const rows = data ?? [];
  if (rows.length === 0) return 0;

  // Nur Konten OHNE jede Buchung (echte "nie was gemacht"-Karteileichen).
  const withBooking = await userIdsWithAnyBooking(supabase, rows.map((r) => r.id));
  let n = 0;
  for (const r of rows) {
    if (withBooking.has(r.id)) continue;
    const email = authMap.get(r.id)?.email;
    if (!email || email.endsWith('@anonymisiert.local')) continue;
    try {
      await sendUnverifiedDeletionWarning({
        to: email,
        name: r.full_name,
        graceHours: config.unverified_grace_hours,
      });
      await supabase
        .from('profiles')
        .update({ unverified_warning_sent_at: new Date().toISOString() })
        .eq('id', r.id);
      n++;
    } catch (err) {
      console.error('[account-cleanup] unverified-warn send:', r.id, err);
    }
  }
  return n;
}

// ─── Schritt 2: Unverifizierte loeschen (anonymisieren + Profil entfernen) ─────
async function stepUnverifiedDelete(
  supabase: SB,
  config: AccountLifecycleConfig,
  req: NextRequest,
): Promise<number> {
  const cutoff = new Date(Date.now() - config.unverified_grace_hours * 3_600_000).toISOString();
  const { data, error } = await supabase
    .from('profiles')
    .select('id, verification_status')
    .or('verification_status.is.null,verification_status.eq.none')
    .not('unverified_warning_sent_at', 'is', null)
    .lt('unverified_warning_sent_at', cutoff)
    .is('deactivated_at', null)
    .not('anonymized', 'is', true)
    .not('is_tester', 'is', true)
    .not('blacklisted', 'is', true)
    .limit(200);
  if (error) {
    if (isMissingColumn(error)) return -1;
    console.error('[account-cleanup] unverified-delete select:', error);
    return 0;
  }
  const rows = data ?? [];
  if (rows.length === 0) return 0;

  // Sicherheitsnetz: NUR Konten ohne jede Buchung anfassen.
  const withBooking = await userIdsWithAnyBooking(supabase, rows.map((r) => r.id));
  let n = 0;
  for (const r of rows) {
    if (withBooking.has(r.id)) continue;
    try {
      const res = await anonymizeCustomerCore(supabase, r.id);
      if (!res.ok) continue;

      // Konto komplett aus der Liste nehmen: konto-gebundene Hilfstabellen +
      // Profil-Zeile entfernen (analog reset-tester). Auth-User bleibt gebannt
      // mit umbenannter E-Mail (Original-Adresse ist wieder frei).
      for (const table of [
        'cart_holds',
        'customer_login_history',
        'customer_push_subscriptions',
        'customer_ugc_submissions',
      ]) {
        try {
          await supabase.from(table).delete().eq('user_id', r.id);
        } catch { /* best-effort */ }
      }
      try {
        await supabase.from('profiles').delete().eq('id', r.id);
      } catch (e) {
        console.warn('[account-cleanup] profile delete:', r.id, e);
      }

      await logAudit({
        action: 'customer.auto_delete_unverified',
        entityType: 'customer',
        entityId: r.id,
        request: req,
      });
      n++;
    } catch (err) {
      console.error('[account-cleanup] unverified-delete:', r.id, err);
    }
  }
  return n;
}

// ─── Schritt 3: Inaktive warnen ───────────────────────────────────────────────
async function stepInactiveWarn(
  supabase: SB,
  config: AccountLifecycleConfig,
  authMap: Map<string, AuthInfo>,
): Promise<number> {
  // Notwendige Bedingung: das Konto ist mindestens so alt wie das Inaktiv-Fenster
  // (jemand, der erst gestern registriert hat, kann nicht 1 Jahr inaktiv sein).
  const cutoff = new Date(Date.now() - config.inactive_warn_after_days * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, created_at')
    .lt('created_at', cutoff)
    .is('inactive_warning_sent_at', null)
    .is('deactivated_at', null)
    .not('anonymized', 'is', true)
    .not('is_tester', 'is', true)
    .not('blacklisted', 'is', true)
    .limit(500);
  if (error) {
    if (isMissingColumn(error)) return -1;
    console.error('[account-cleanup] inactive-warn select:', error);
    return 0;
  }
  const rows = data ?? [];
  if (rows.length === 0) return 0;

  // Konten mit offener Buchung ausnehmen.
  const openBooking = await userIdsWithOpenBooking(supabase, rows.map((r) => r.id));
  let n = 0;
  for (const r of rows) {
    if (openBooking.has(r.id)) continue;
    const info = authMap.get(r.id);
    const email = info?.email;
    if (!email || email.endsWith('@anonymisiert.local')) continue;
    // Letzte Aktivitaet = letzter Login, sonst Registrierungsdatum.
    const lastActivity = info?.lastSignIn || r.created_at;
    if (new Date(lastActivity).getTime() > new Date(cutoff).getTime()) continue; // war zu kürzlich aktiv
    try {
      await sendInactiveDeactivationWarning({
        to: email,
        name: r.full_name,
        graceDays: config.inactive_grace_days,
      });
      await supabase
        .from('profiles')
        .update({ inactive_warning_sent_at: new Date().toISOString() })
        .eq('id', r.id);
      n++;
    } catch (err) {
      console.error('[account-cleanup] inactive-warn send:', r.id, err);
    }
  }
  return n;
}

// ─── Schritt 4: Inaktive deaktivieren ─────────────────────────────────────────
async function stepInactiveDeactivate(
  supabase: SB,
  config: AccountLifecycleConfig,
  authMap: Map<string, AuthInfo>,
  req: NextRequest,
): Promise<number> {
  const graceCutoff = new Date(Date.now() - config.inactive_grace_days * 86_400_000).toISOString();
  const activityCutoff = new Date(Date.now() - config.inactive_warn_after_days * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from('profiles')
    .select('id, created_at')
    .not('inactive_warning_sent_at', 'is', null)
    .lt('inactive_warning_sent_at', graceCutoff)
    .is('deactivated_at', null)
    .not('anonymized', 'is', true)
    .not('is_tester', 'is', true)
    .not('blacklisted', 'is', true)
    .limit(500);
  if (error) {
    if (isMissingColumn(error)) return -1;
    console.error('[account-cleanup] inactive-deactivate select:', error);
    return 0;
  }
  const rows = data ?? [];
  if (rows.length === 0) return 0;

  const openBooking = await userIdsWithOpenBooking(supabase, rows.map((r) => r.id));
  let n = 0;
  for (const r of rows) {
    if (openBooking.has(r.id)) continue;
    // Defensiv: hat sich der Kunde doch neu eingeloggt (Marker wurde von
    // login-track nicht geleert?), NICHT deaktivieren.
    const info = authMap.get(r.id);
    const lastActivity = info?.lastSignIn || r.created_at;
    if (new Date(lastActivity).getTime() > new Date(activityCutoff).getTime()) continue;
    try {
      await supabase
        .from('profiles')
        .update({ deactivated_at: new Date().toISOString() })
        .eq('id', r.id)
        .is('deactivated_at', null);
      await logAudit({
        action: 'customer.auto_deactivate',
        entityType: 'customer',
        entityId: r.id,
        request: req,
      });
      n++;
    } catch (err) {
      console.error('[account-cleanup] inactive-deactivate:', r.id, err);
    }
  }
  return n;
}
