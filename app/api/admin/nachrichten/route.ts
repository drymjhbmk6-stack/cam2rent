import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { sendNewMessageNotificationToCustomer } from '@/lib/email';
import { logAudit } from '@/lib/audit';
import { getCurrentAdminUser } from '@/lib/admin-auth';

/**
 * GET /api/admin/nachrichten
 * List all conversations with customer info and unread counts.
 */
export async function GET() {
  const supabase = createServiceClient();
  const me = await getCurrentAdminUser();

  // Select inkl. E-Mail-Kanal-Felder; faellt bei fehlender Migration auf das
  // alte Schema zurueck (dann verhalten sich alle Konversationen wie 'account').
  let conversations: Array<{
    id: string;
    customer_id: string | null;
    subject: string;
    booking_id: string | null;
    last_message_at: string;
    closed: boolean;
    created_at: string;
    source?: string | null;
    customer_email?: string | null;
    customer_name?: string | null;
    assigned_admin_user_id?: string | null;
    inbox_address?: string | null;
  }> | null = null;

  const full = await supabase
    .from('conversations')
    .select('id, customer_id, subject, booking_id, last_message_at, closed, created_at, source, customer_email, customer_name, assigned_admin_user_id, inbox_address')
    .order('last_message_at', { ascending: false });

  if (full.error) {
    const fallback = await supabase
      .from('conversations')
      .select('id, customer_id, subject, booking_id, last_message_at, closed, created_at')
      .order('last_message_at', { ascending: false });
    if (fallback.error) {
      return NextResponse.json({ conversations: [] });
    }
    conversations = fallback.data;
  } else {
    conversations = full.data;
  }

  // Sichtbarkeit: Owner sieht alle Konversationen. Mitarbeiter sehen nur die
  // ihrem Postfach zugeordneten + unzugeordnete (allgemeine kontakt@-Mails +
  // Konto-Nachrichten ohne Zuordnung).
  if (me && me.role !== 'owner') {
    conversations = (conversations ?? []).filter(
      (c) => !c.assigned_admin_user_id || c.assigned_admin_user_id === me.id,
    );
  }

  // Enrich with customer info and unread counts
  const customerIds = [
    ...new Set((conversations ?? []).map((c) => c.customer_id).filter((id): id is string => !!id)),
  ];
  const profileMap: Record<string, { full_name: string; email: string }> = {};

  if (customerIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', customerIds);

    // Also get emails from auth (profiles might not have email)
    const { data: { users } } = await supabase.auth.admin.listUsers({ perPage: 1000 });

    if (profiles) {
      for (const p of profiles) {
        const authUser = users?.find((u) => u.id === p.id);
        profileMap[p.id] = {
          full_name: p.full_name || authUser?.email?.split('@')[0] || 'Unbekannt',
          email: authUser?.email || '',
        };
      }
    }
  }

  const conversationIds = (conversations ?? []).map((c) => c.id);
  const unreadMap: Record<string, number> = {};

  if (conversationIds.length > 0) {
    const { data: unreadData } = await supabase
      .from('messages')
      .select('conversation_id')
      .in('conversation_id', conversationIds)
      .eq('sender_type', 'customer')
      .eq('read', false);

    if (unreadData) {
      for (const msg of unreadData) {
        unreadMap[msg.conversation_id] = (unreadMap[msg.conversation_id] || 0) + 1;
      }
    }
  }

  // Letzte Nachricht pro Conversation — eine Bulk-Query, dann groupBy + max(created_at).
  // Vorher: 1 SELECT pro Conversation = N+1.
  type LastMsgRow = { conversation_id: string; body: string; sender_type: string; created_at: string };
  const lastMsgMap = new Map<string, LastMsgRow>();
  if (conversationIds.length > 0) {
    const { data: msgs } = await supabase
      .from('messages')
      .select('conversation_id, body, sender_type, created_at')
      .in('conversation_id', conversationIds)
      .order('created_at', { ascending: false });
    for (const m of (msgs ?? []) as LastMsgRow[]) {
      // dank ORDER BY created_at DESC ist der erste Eintrag pro conv = neueste Nachricht
      if (!lastMsgMap.has(m.conversation_id)) lastMsgMap.set(m.conversation_id, m);
    }
  }

  const enriched = (conversations ?? []).map((conv) => {
    const lastMsg = lastMsgMap.get(conv.id);
    const fromProfile = conv.customer_id ? profileMap[conv.customer_id] : undefined;
    const customer = fromProfile ?? {
      full_name:
        conv.customer_name ||
        conv.customer_email?.split('@')[0] ||
        'Unbekannt',
      email: conv.customer_email || '',
    };
    return {
      ...conv,
      source: conv.source ?? 'account',
      inbox_address: conv.inbox_address ?? null,
      customer,
      unread_count: unreadMap[conv.id] || 0,
      last_message: lastMsg ? {
        body: lastMsg.body.substring(0, 100),
        sender_type: lastMsg.sender_type,
        created_at: lastMsg.created_at,
      } : null,
    };
  });

  return NextResponse.json({ conversations: enriched });
}

/**
 * POST /api/admin/nachrichten
 * Admin initiiert eine NEUE Konversation mit einem Kunden.
 *
 * Body: { customer_id: string, subject: string, body: string, booking_id?: string | null }
 *
 * Schreibt `conversations` + erste `messages`-Row, schickt E-Mail-Benachrichtigung
 * an den Kunden (mit `isInitial: true` → Subject "Neue Nachricht von cam2rent").
 * Antwortet auf bestehende Konversationen laufen weiterhin ueber
 * POST /api/admin/nachrichten/[conversationId].
 */
export async function POST(req: NextRequest) {
  let payload: { customer_id?: string; subject?: string; body?: string; booking_id?: string | null };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'Ungueltiger Request-Body.' }, { status: 400 });
  }

  const customerId = (payload.customer_id ?? '').trim();
  const subject = (payload.subject ?? '').trim();
  const body = (payload.body ?? '').trim();
  const bookingIdRaw = payload.booking_id;
  const bookingId = typeof bookingIdRaw === 'string' && bookingIdRaw.trim() !== '' ? bookingIdRaw.trim() : null;

  if (!customerId) {
    return NextResponse.json({ error: 'Kunde fehlt.' }, { status: 400 });
  }
  if (subject.length < 3 || subject.length > 200) {
    return NextResponse.json({ error: 'Betreff muss 3 bis 200 Zeichen lang sein.' }, { status: 400 });
  }
  if (body.length < 1 || body.length > 5000) {
    return NextResponse.json({ error: 'Nachricht muss 1 bis 5000 Zeichen lang sein.' }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Kunde existiert? E-Mail laden fuer Benachrichtigung.
  const { data: { users } } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  const authUser = users?.find((u) => u.id === customerId);
  if (!authUser) {
    return NextResponse.json({ error: 'Kunde nicht gefunden.' }, { status: 404 });
  }

  // Optional: booking_id muss zum Kunden gehoeren.
  if (bookingId) {
    const { data: booking } = await supabase
      .from('bookings')
      .select('id, user_id')
      .eq('id', bookingId)
      .maybeSingle();
    if (!booking) {
      return NextResponse.json({ error: 'Buchung nicht gefunden.' }, { status: 404 });
    }
    if (booking.user_id !== customerId) {
      return NextResponse.json({ error: 'Buchung gehoert nicht zu diesem Kunden.' }, { status: 403 });
    }
  }

  const now = new Date().toISOString();

  // Conversation anlegen.
  const { data: conv, error: convErr } = await supabase
    .from('conversations')
    .insert({
      customer_id: customerId,
      subject,
      booking_id: bookingId,
      closed: false,
      last_message_at: now,
    })
    .select('id, customer_id, subject, booking_id, closed, created_at, last_message_at')
    .single();

  if (convErr || !conv) {
    return NextResponse.json({ error: 'Konversation konnte nicht angelegt werden.' }, { status: 500 });
  }

  // Erste Nachricht (Admin-Sender). Reply-Endpoint nutzt Dummy-UUID, weil
  // Admin keine echten Supabase-Auth-User-IDs hat — wir machen es genauso.
  const adminSenderId = '00000000-0000-0000-0000-000000000000';
  const { data: msg, error: msgErr } = await supabase
    .from('messages')
    .insert({
      conversation_id: conv.id,
      sender_type: 'admin',
      sender_id: adminSenderId,
      body,
      read: false,
    })
    .select('id, sender_type, sender_id, body, read, created_at')
    .single();

  if (msgErr || !msg) {
    // Cleanup: leere Conversation zuruecknehmen, damit kein Geistereintrag bleibt.
    await supabase.from('conversations').delete().eq('id', conv.id);
    return NextResponse.json({ error: 'Nachricht konnte nicht gespeichert werden.' }, { status: 500 });
  }

  // E-Mail an den Kunden (non-blocking — wenn Mail-Versand crashed, bleibt die
  // Konversation trotzdem in der DB, der Kunde sieht sie beim naechsten Login).
  if (authUser.email) {
    const fullName =
      (typeof authUser.user_metadata?.full_name === 'string' && authUser.user_metadata.full_name) ||
      authUser.email.split('@')[0];
    sendNewMessageNotificationToCustomer({
      customerEmail: authUser.email,
      customerName: fullName,
      subject,
      messagePreview: body.substring(0, 200),
      isInitial: true,
    }).catch(() => {});
  }

  // Admin-Identitaet fuer Audit-Log mit-ermitteln (best-effort).
  let adminUserId: string | null | undefined;
  let adminUserName: string | undefined;
  try {
    const me = await getCurrentAdminUser();
    if (me) {
      adminUserId = me.id === 'legacy-env' ? null : me.id;
      adminUserName = me.name;
    }
  } catch {
    // ignore
  }

  await logAudit({
    action: 'nachricht.start',
    entityType: 'nachricht',
    entityId: conv.id,
    entityLabel: subject,
    changes: {
      customer_id: customerId,
      booking_id: bookingId,
      subject,
    },
    adminUserId,
    adminUserName,
    request: req,
  });

  return NextResponse.json(
    {
      conversation: { ...conv, messages: [msg] },
      message: msg,
    },
    { status: 201 }
  );
}
