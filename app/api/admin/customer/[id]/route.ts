import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';

/**
 * GET /api/admin/customer/[id]
 * Gibt alle Kundendaten inkl. Buchungen, Schäden, Nachrichten, Bewertungen zurück.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: customerId } = await params;

    if (!customerId) {
      return NextResponse.json({ error: 'Kunden-ID erforderlich.' }, { status: 400 });
    }

    const supabase = createServiceClient();

    // 1. Profil laden
    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', customerId)
      .single();

    if (profileErr || !profile) {
      return NextResponse.json({ error: 'Kunde nicht gefunden.' }, { status: 404 });
    }

    // 2. E-Mail + letzter Login aus auth.users
    let email = '';
    let lastLogin: string | null = null;
    try {
      const { data: { user } } = await supabase.auth.admin.getUserById(customerId);
      email = user?.email || '';
      lastLogin = user?.last_sign_in_at || null;
    } catch {
      // Fallback
    }

    // 2b. Login-Verlauf (letzte 10) aus customer_login_history.
    // Defensiv: fehlt die Migration, liefert der Select error → leere Liste.
    let loginHistory: Array<Record<string, unknown>> = [];
    {
      const { data: lh } = await supabase
        .from('customer_login_history')
        .select('id, created_at, ip, user_agent')
        .eq('user_id', customerId)
        .order('created_at', { ascending: false })
        .limit(10);
      loginHistory = lh || [];
    }

    // 3. Buchungen laden
    const { data: bookings } = await supabase
      .from('bookings')
      .select('id, product_name, rental_from, rental_to, price_total, status, created_at')
      .eq('user_id', customerId)
      .order('created_at', { ascending: false });

    // 4. Schäden laden (über Buchungs-IDs)
    let damages: Array<Record<string, unknown>> = [];
    const bookingIds = (bookings || []).map((b) => b.id);
    if (bookingIds.length > 0) {
      const { data: damageData } = await supabase
        .from('damage_reports')
        .select('id, booking_id, description, status, damage_amount, created_at')
        .in('booking_id', bookingIds)
        .order('created_at', { ascending: false });

      // Buchungs-Info zu Schäden hinzufügen
      const bookingMap = new Map((bookings || []).map((b) => [b.id, b]));
      damages = (damageData || []).map((d) => ({
        ...d,
        product_name: bookingMap.get(d.booking_id)?.product_name || '',
      }));
    }

    // 5. Nachrichten laden
    const { data: conversations } = await supabase
      .from('conversations')
      .select('id, subject, booking_id, created_at, closed')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false });

    const conversationIds = (conversations || []).map((c) => c.id);
    let messages: Array<Record<string, unknown>> = [];
    if (conversationIds.length > 0) {
      const { data: msgData } = await supabase
        .from('messages')
        .select('id, conversation_id, sender_type, body, read, created_at')
        .in('conversation_id', conversationIds)
        .order('created_at', { ascending: true });

      messages = msgData || [];
    }

    // 6. Bewertungen laden
    const { data: reviewsRaw } = await supabase
      .from('reviews')
      .select('*')
      .eq('user_id', customerId)
      .order('created_at', { ascending: false });

    // Falls reviews kein user_id haben, über bookings suchen
    let reviews = reviewsRaw || [];
    if (reviews.length === 0 && bookingIds.length > 0) {
      const { data: reviewsByBooking } = await supabase
        .from('reviews')
        .select('*')
        .in('booking_id', bookingIds)
        .order('created_at', { ascending: false });

      reviews = reviewsByBooking || [];
    }

    // Stats berechnen
    const totalBookings = (bookings || []).length;
    const totalRevenue = (bookings || []).reduce((sum, b) => sum + (b.price_total || 0), 0);
    const avgBookingValue = totalBookings > 0 ? totalRevenue / totalBookings : 0;
    const lastBooking = (bookings || []).length > 0 ? (bookings || [])[0].created_at : null;

    return NextResponse.json({
      customer: {
        id: profile.id,
        full_name: profile.full_name || '',
        email,
        phone: profile.phone || '',
        address_street: profile.address_street || '',
        address_zip: profile.address_zip || '',
        address_city: profile.address_city || '',
        verification_status: profile.verification_status || 'none',
        verified_at: profile.verified_at,
        id_front_url: profile.id_front_url || null,
        id_back_url: profile.id_back_url || null,
        blacklisted: profile.blacklisted || false,
        blacklist_reason: profile.blacklist_reason || '',
        blacklisted_at: profile.blacklisted_at,
        is_tester: profile.is_tester || false,
        special_discount_percent: profile.special_discount_percent ?? null,
        special_discount_reason: profile.special_discount_reason || '',
        special_discount_valid_until: profile.special_discount_valid_until || null,
        special_discount_set_by: profile.special_discount_set_by || null,
        special_discount_set_at: profile.special_discount_set_at || null,
        created_at: profile.created_at,
        anonymized: profile.anonymized || false,
        deleted_at: profile.deleted_at,
      },
      stats: {
        totalBookings,
        totalRevenue,
        avgBookingValue,
        lastBooking,
        lastLogin,
      },
      loginHistory,
      bookings: bookings || [],
      damages,
      conversations: (conversations || []).map((conv) => ({
        ...conv,
        messages: messages.filter((m) => m.conversation_id === conv.id),
      })),
      reviews,
    });
  } catch (err) {
    console.error('GET /api/admin/customer/[id] error:', err);
    return NextResponse.json({ error: 'Serverfehler.' }, { status: 500 });
  }
}

/**
 * PATCH /api/admin/customer/[id]
 * Aktualisiert die Stammdaten eines Kunden (Name, Telefon, Adresse, E-Mail).
 * Name wird als full_name in `profiles` gespeichert; E-Mail in auth.users.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: customerId } = await params;
    if (!customerId) {
      return NextResponse.json({ error: 'Kunden-ID erforderlich.' }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const supabase = createServiceClient();

    // Profil muss existieren
    const { data: existing, error: existErr } = await supabase
      .from('profiles')
      .select('id, full_name, phone, address_street, address_zip, address_city')
      .eq('id', customerId)
      .single();
    if (existErr || !existing) {
      return NextResponse.json({ error: 'Kunde nicht gefunden.' }, { status: 404 });
    }

    const clean = (v: unknown, max: number): string =>
      typeof v === 'string' ? v.trim().slice(0, max) : '';

    // Name kann als full_name ODER getrennt als vorname/nachname kommen
    let fullName: string | undefined;
    if (typeof body.full_name === 'string') {
      fullName = clean(body.full_name, 200);
    } else if (typeof body.vorname === 'string' || typeof body.nachname === 'string') {
      fullName = [clean(body.vorname, 100), clean(body.nachname, 100)]
        .filter(Boolean)
        .join(' ');
    }

    const profileUpdate: Record<string, string> = {};
    if (fullName !== undefined) profileUpdate.full_name = fullName;
    if (typeof body.phone === 'string') profileUpdate.phone = clean(body.phone, 50);
    if (typeof body.address_street === 'string') profileUpdate.address_street = clean(body.address_street, 200);
    if (typeof body.address_zip === 'string') profileUpdate.address_zip = clean(body.address_zip, 20);
    if (typeof body.address_city === 'string') profileUpdate.address_city = clean(body.address_city, 100);

    if (Object.keys(profileUpdate).length > 0) {
      const { error: updErr } = await supabase
        .from('profiles')
        .update(profileUpdate)
        .eq('id', customerId);
      if (updErr) {
        console.error('PATCH customer profile update error:', updErr);
        return NextResponse.json({ error: 'Stammdaten konnten nicht gespeichert werden.' }, { status: 500 });
      }
    }

    // E-Mail in auth.users (nur wenn übergeben + geändert)
    let emailChanged = false;
    if (typeof body.email === 'string') {
      const newEmail = clean(body.email, 200).toLowerCase();
      if (newEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
        const { data: { user } } = await supabase.auth.admin.getUserById(customerId);
        const current = (user?.email || '').toLowerCase();
        if (newEmail !== current) {
          const { error: emailErr } = await supabase.auth.admin.updateUserById(customerId, {
            email: newEmail,
            email_confirm: true,
          });
          if (emailErr) {
            console.error('PATCH customer email update error:', emailErr);
            return NextResponse.json(
              { error: 'E-Mail konnte nicht geändert werden (evtl. bereits vergeben).' },
              { status: 409 },
            );
          }
          emailChanged = true;
        }
      } else if (newEmail) {
        return NextResponse.json({ error: 'Ungültige E-Mail-Adresse.' }, { status: 422 });
      }
    }

    await logAudit({
      action: 'customer.update',
      entityType: 'customer',
      entityId: customerId,
      changes: { ...profileUpdate, ...(emailChanged ? { email: 'geändert' } : {}) },
      request: req,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('PATCH /api/admin/customer/[id] error:', err);
    return NextResponse.json({ error: 'Serverfehler.' }, { status: 500 });
  }
}
