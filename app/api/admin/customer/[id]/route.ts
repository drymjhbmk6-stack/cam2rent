import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

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

    // 2. E-Mail aus auth.users
    let email = '';
    try {
      const { data: { user } } = await supabase.auth.admin.getUserById(customerId);
      email = user?.email || '';
    } catch {
      // Fallback
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
        blacklisted: profile.blacklisted || false,
        blacklist_reason: profile.blacklist_reason || '',
        blacklisted_at: profile.blacklisted_at,
        created_at: profile.created_at,
        anonymized: profile.anonymized || false,
        deleted_at: profile.deleted_at,
      },
      stats: {
        totalBookings,
        totalRevenue,
        avgBookingValue,
        lastBooking,
      },
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
