import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createServiceClient } from '@/lib/supabase';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { sendNewMessageNotificationToAdmin } from '@/lib/email';
import { createAdminNotification } from '@/lib/admin-notifications';

const limiter = rateLimit({ maxAttempts: 10, windowMs: 60_000 });

async function getUser() {
  const cookieStore = await cookies();
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        },
      },
    }
  );
  const { data: { user } } = await supabaseAuth.auth.getUser();
  return user;
}

/**
 * GET /api/messages
 * List customer's conversations with unread count.
 */
export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Nicht angemeldet.' }, { status: 401 });

  const supabase = createServiceClient();

  const { data: conversations, error } = await supabase
    .from('conversations')
    .select('id, subject, booking_id, last_message_at, closed, created_at')
    .eq('customer_id', user.id)
    .order('last_message_at', { ascending: false });

  if (error) {
    return NextResponse.json({ conversations: [] });
  }

  // Get unread counts (admin messages not yet read by customer)
  const conversationIds = (conversations ?? []).map((c) => c.id);
  const unreadMap: Record<string, number> = {};

  if (conversationIds.length > 0) {
    const { data: unreadData } = await supabase
      .from('messages')
      .select('conversation_id')
      .in('conversation_id', conversationIds)
      .eq('sender_type', 'admin')
      .eq('read', false);

    if (unreadData) {
      for (const msg of unreadData) {
        unreadMap[msg.conversation_id] = (unreadMap[msg.conversation_id] || 0) + 1;
      }
    }
  }

  // Get last message preview per conversation
  const enriched = await Promise.all((conversations ?? []).map(async (conv) => {
    const { data: lastMsg } = await supabase
      .from('messages')
      .select('body, sender_type, created_at')
      .eq('conversation_id', conv.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    return {
      ...conv,
      unread_count: unreadMap[conv.id] || 0,
      last_message: lastMsg ? {
        body: lastMsg.body.substring(0, 100),
        sender_type: lastMsg.sender_type,
        created_at: lastMsg.created_at,
      } : null,
    };
  }));

  return NextResponse.json({ conversations: enriched });
}

/**
 * POST /api/messages
 * Create a new conversation + first message.
 * Body: { subject: string, body: string, booking_id?: string }
 */
export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const { success } = limiter.check(ip);
  if (!success) {
    return NextResponse.json({ error: 'Zu viele Anfragen.' }, { status: 429 });
  }

  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Nicht angemeldet.' }, { status: 401 });

  const { subject, body, booking_id } = await req.json();

  if (!subject?.trim() || !body?.trim()) {
    return NextResponse.json({ error: 'Betreff und Nachricht erforderlich.' }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Create conversation
  const { data: conv, error: convError } = await supabase
    .from('conversations')
    .insert({
      customer_id: user.id,
      subject: subject.trim(),
      booking_id: booking_id || null,
    })
    .select('id')
    .single();

  if (convError || !conv) {
    return NextResponse.json({ error: 'Konversation konnte nicht erstellt werden.' }, { status: 500 });
  }

  // Create first message
  const { error: msgError } = await supabase
    .from('messages')
    .insert({
      conversation_id: conv.id,
      sender_type: 'customer',
      sender_id: user.id,
      body: body.trim(),
    });

  if (msgError) {
    return NextResponse.json({ error: 'Nachricht konnte nicht gesendet werden.' }, { status: 500 });
  }

  // Send email notification to admin (fire-and-forget)
  const customerName = user.user_metadata?.full_name || user.email || 'Kunde';
  sendNewMessageNotificationToAdmin({
    customerName,
    customerEmail: user.email || '',
    subject: subject.trim(),
    messagePreview: body.trim().substring(0, 200),
  }).catch(() => {});

  // Admin-Benachrichtigung (fire-and-forget)
  createAdminNotification(supabase, {
    type: 'new_message',
    title: 'Neue Nachricht',
    message: `${user.email}: ${subject}`,
    link: `/admin/nachrichten`,
  });

  return NextResponse.json({ conversation_id: conv.id });
}
