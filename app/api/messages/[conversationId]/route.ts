import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createServiceClient } from '@/lib/supabase';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { sendNewMessageNotificationToAdmin } from '@/lib/email';

const limiter = rateLimit({ maxAttempts: 20, windowMs: 60_000 });

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
 * GET /api/messages/[conversationId]
 * Get all messages in a conversation. Marks admin messages as read.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  const { conversationId } = await params;
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Nicht angemeldet.' }, { status: 401 });

  const supabase = createServiceClient();

  // Verify ownership
  const { data: conv } = await supabase
    .from('conversations')
    .select('id, subject, booking_id, closed, created_at')
    .eq('id', conversationId)
    .eq('customer_id', user.id)
    .single();

  if (!conv) {
    return NextResponse.json({ error: 'Konversation nicht gefunden.' }, { status: 404 });
  }

  // Get messages
  const { data: messages } = await supabase
    .from('messages')
    .select('id, sender_type, sender_id, body, read, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  // Mark admin messages as read (fire-and-forget)
  supabase
    .from('messages')
    .update({ read: true })
    .eq('conversation_id', conversationId)
    .eq('sender_type', 'admin')
    .eq('read', false)
    .then(() => {});

  return NextResponse.json({ conversation: conv, messages: messages ?? [] });
}

/**
 * POST /api/messages/[conversationId]
 * Customer sends a reply. Body: { body: string }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  const { conversationId } = await params;
  const ip = getClientIp(req);
  const { success } = limiter.check(ip);
  if (!success) {
    return NextResponse.json({ error: 'Zu viele Anfragen.' }, { status: 429 });
  }

  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Nicht angemeldet.' }, { status: 401 });

  const { body } = await req.json();
  if (!body?.trim()) {
    return NextResponse.json({ error: 'Nachricht darf nicht leer sein.' }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Verify ownership + not closed
  const { data: conv } = await supabase
    .from('conversations')
    .select('id, closed, subject')
    .eq('id', conversationId)
    .eq('customer_id', user.id)
    .single();

  if (!conv) {
    return NextResponse.json({ error: 'Konversation nicht gefunden.' }, { status: 404 });
  }
  if (conv.closed) {
    return NextResponse.json({ error: 'Diese Konversation ist geschlossen.' }, { status: 400 });
  }

  // Insert message
  const { data: msg, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_type: 'customer',
      sender_id: user.id,
      body: body.trim(),
    })
    .select('id, created_at')
    .single();

  if (error || !msg) {
    return NextResponse.json({ error: 'Nachricht konnte nicht gesendet werden.' }, { status: 500 });
  }

  // Update last_message_at
  await supabase
    .from('conversations')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', conversationId);

  // Email notification (fire-and-forget)
  const customerName = user.user_metadata?.full_name || user.email || 'Kunde';
  sendNewMessageNotificationToAdmin({
    customerName,
    customerEmail: user.email || '',
    subject: conv.subject,
    messagePreview: body.trim().substring(0, 200),
  }).catch(() => {});

  return NextResponse.json({ message_id: msg.id });
}
