import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

/**
 * GET /api/admin/kunden
 * Gibt alle Kunden mit Profil-Daten und Buchungsanzahl zurück.
 * Query: ?status=pending|verified|rejected|blacklisted
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = createServiceClient();
    const statusFilter = req.nextUrl.searchParams.get('status');

    // Alle Profile laden — nur Listen-relevante Spalten (Ausweisbilder etc. nicht nötig)
    const COLS_FULL =
      'id, full_name, phone, address_city, verification_status, verified_at, blacklisted, blacklist_reason, blacklisted_at, is_tester, special_discount_percent, special_discount_valid_until, deactivated_at, created_at';
    const COLS_FALLBACK =
      'id, full_name, phone, address_city, verification_status, verified_at, blacklisted, blacklist_reason, blacklisted_at, is_tester, created_at';

    // Inaktiv-gesetzte Konten (deactivated_at) sind aus der Liste raus — sichtbar
    // nur, wenn explizit der Filter "inactive" gewaehlt ist.
    const buildQuery = (cols: string, withLifecycle: boolean) => {
      let q = supabase.from('profiles').select(cols).order('created_at', { ascending: false });
      if (statusFilter === 'blacklisted') {
        q = q.eq('blacklisted', true);
      } else if (statusFilter && ['pending', 'verified', 'rejected', 'none'].includes(statusFilter)) {
        q = q.eq('verification_status', statusFilter);
      }
      if (withLifecycle) {
        if (statusFilter === 'inactive') {
          q = q.not('deactivated_at', 'is', null);
        } else {
          q = q.is('deactivated_at', null);
        }
      }
      return q;
    };

    type KundeProfileRow = {
      id: string;
      full_name: string | null;
      phone: string | null;
      address_city: string | null;
      verification_status: string | null;
      verified_at: string | null;
      blacklisted: boolean | null;
      blacklist_reason: string | null;
      blacklisted_at: string | null;
      is_tester: boolean | null;
      special_discount_percent?: number | null;
      special_discount_valid_until?: string | null;
      deactivated_at?: string | null;
      created_at: string;
    };

    let res = await buildQuery(COLS_FULL, true);
    // Defensiv: fehlt die Sonderkonditions-Migration → ohne die Spalten neu laden
    // (deactivated_at bleibt drin, ist eine eigene Migration).
    if (res.error && /special_discount/i.test(res.error.message)) {
      res = await buildQuery(
        'id, full_name, phone, address_city, verification_status, verified_at, blacklisted, blacklist_reason, blacklisted_at, is_tester, deactivated_at, created_at',
        true,
      );
    }
    // Defensiv: fehlt die Account-Lifecycle-Migration → ganz ohne deactivated_at
    // + ohne den Lifecycle-Filter neu laden.
    if (res.error && /deactivated_at/i.test(res.error.message)) {
      res = await buildQuery(COLS_FALLBACK, false);
    }

    if (res.error) {
      console.error('Profiles fetch error:', res.error);
      return NextResponse.json({ error: 'Fehler beim Laden.' }, { status: 500 });
    }

    const profiles = (res.data ?? []) as unknown as KundeProfileRow[];
    if (profiles.length === 0) {
      return NextResponse.json({ customers: [] });
    }

    const userIds = profiles.map((p) => p.id);

    // E-Mails/Last-Login (auth.admin) und die Buchungs-Count-Query sind
    // voneinander unabhaengig → parallel laden (spart einen Roundtrip).
    // Bewusst KEIN Limit/keine Pagination: die Kundenliste filtert/sucht/sortiert
    // client-seitig ueber die volle Liste (Suche „ueber alle Kunden").
    const [usersRes, bookingCountsRes] = await Promise.all([
      supabase.auth.admin.listUsers({ perPage: 1000 }),
      supabase.from('bookings').select('user_id').in('user_id', userIds),
    ]);
    const users = usersRes.data?.users;
    const usersErr = usersRes.error;
    const bookingCounts = bookingCountsRes.data;

    const emailMap = new Map<string, string>();
    const lastLoginMap = new Map<string, string | null>();
    if (!usersErr && users) {
      for (const u of users) {
        emailMap.set(u.id, u.email || '');
        lastLoginMap.set(u.id, u.last_sign_in_at || null);
      }
    }

    const countMap = new Map<string, number>();
    if (bookingCounts) {
      for (const b of bookingCounts) {
        if (b.user_id) {
          countMap.set(b.user_id, (countMap.get(b.user_id) || 0) + 1);
        }
      }
    }

    const customers = profiles.map((p) => ({
      id: p.id,
      full_name: p.full_name || '',
      email: emailMap.get(p.id) || '',
      phone: p.phone || '',
      address_city: p.address_city || '',
      verification_status: p.verification_status || 'none',
      verified_at: p.verified_at,
      blacklisted: p.blacklisted || false,
      blacklist_reason: p.blacklist_reason || '',
      blacklisted_at: p.blacklisted_at,
      is_tester: p.is_tester || false,
      special_discount_percent: p.special_discount_percent ?? null,
      special_discount_valid_until: p.special_discount_valid_until ?? null,
      deactivated_at: p.deactivated_at ?? null,
      booking_count: countMap.get(p.id) || 0,
      created_at: p.created_at,
      last_login: lastLoginMap.get(p.id) || null,
    }));

    return NextResponse.json({ customers });
  } catch (err) {
    console.error('GET /api/admin/kunden error:', err);
    return NextResponse.json({ error: 'Serverfehler.' }, { status: 500 });
  }
}
