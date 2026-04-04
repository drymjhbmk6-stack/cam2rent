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

    // Alle Profile laden
    let query = supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (statusFilter === 'blacklisted') {
      query = query.eq('blacklisted', true);
    } else if (statusFilter && ['pending', 'verified', 'rejected', 'none'].includes(statusFilter)) {
      query = query.eq('verification_status', statusFilter);
    }

    const { data: profiles, error } = await query;

    if (error) {
      console.error('Profiles fetch error:', error);
      return NextResponse.json({ error: 'Fehler beim Laden.' }, { status: 500 });
    }

    if (!profiles || profiles.length === 0) {
      return NextResponse.json({ customers: [] });
    }

    // E-Mails aus auth.users holen (admin API)
    const { data: { users }, error: usersErr } = await supabase.auth.admin.listUsers({
      perPage: 1000,
    });

    const emailMap = new Map<string, string>();
    if (!usersErr && users) {
      for (const u of users) {
        emailMap.set(u.id, u.email || '');
      }
    }

    // Buchungsanzahl pro User
    const userIds = profiles.map((p) => p.id);
    const { data: bookingCounts } = await supabase
      .from('bookings')
      .select('user_id')
      .in('user_id', userIds);

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
      booking_count: countMap.get(p.id) || 0,
      created_at: p.created_at,
    }));

    return NextResponse.json({ customers });
  } catch (err) {
    console.error('GET /api/admin/kunden error:', err);
    return NextResponse.json({ error: 'Serverfehler.' }, { status: 500 });
  }
}
