import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { sendNewMessageNotificationToCustomer } from '@/lib/email';
import { logAudit } from '@/lib/audit';

/**
 * GET /api/admin/nachrichten/[conversationId]
 * Get all messages in a conversation. Marks customer messages as read.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  const { conversationId } = await params;
  const supabase = createServiceClient();

  const { data: conv } = await supabase
    .from('conversations')
    .select('id, customer_id, subject, booking_id, closed, created_at')
    .eq('id', conversationId)
    .single();

  if (!conv) {
    return NextResponse.json({ error: 'Konversation nicht gefunden.' }, { status: 404 });
  }

  const { data: messages } = await supabase
    .from('messages')
    .select('id, sender_type, sender_id, body, read, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  // Mark customer messages as read
  supabase
    .from('messages')
    .update({ read: true })
    .eq('conversation_id', conversationId)
    .eq('sender_type', 'customer')
    .eq('read', false)
    .then(() => {});

  // Get customer info
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', conv.customer_id)
    .single();

  const { data: { users } } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  const authUser = users?.find((u) => u.id === conv.customer_id);

  return NextResponse.json({
    conversation: {
      ...conv,
      customer: {
        full_name: profile?.full_name || authUser?.email?.split('@')[0] || 'Unbekannt',
        email: authUser?.email || '',
      },
    },
    messages: messages ?? [],
  });
}

/**
 * POST /api/admin/nachrichten/[conversationId]
 * Admin reply. Body: { body: string }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  const { conversationId } = await params;
  const { body } = await req.json();

  if (!body?.trim()) {
    return NextResponse.json({ error: 'Nachricht darf nicht leer sein.' }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data: conv } = await supabase
    .from('conversations')
    .select('id, customer_id, subject')
    .eq('id', conversationId)
    .single();

  if (!conv) {
    return NextResponse.json({ error: 'Konversation nicht gefunden.' }, { status: 404 });
  }

  // Use a placeholder admin sender_id (admin cookie auth, not Supabase auth)
  const adminSenderId = '00000000-0000-0000-0000-000000000000';

  const { data: msg, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_type: 'admin',
      sender_id: adminSenderId,
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

  // Email notification to customer (fire-and-forget)
  const { data: { users } } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  const customer = users?.find((u) => u.id === conv.customer_id);
  if (customer?.email) {
    sendNewMessageNotificationToCustomer({
      customerEmail: customer.email,
      customerName: customer.user_metadata?.full_name || customer.email.split('@')[0],
      subject: conv.subject,
      messagePreview: body.trim().substring(0, 200),
    }).catch(() => {});
  }

  await logAudit({
    action: 'nachricht.reply',
    entityType: 'nachricht',
    entityId: conversationId,
    request: req,
  });

  return NextResponse.json({ message_id: msg.id });
}

/**
 * PATCH /api/admin/nachrichten/[conversationId]
 * Close/reopen a conversation. Body: { closed: boolean }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  const { conversationId } = await params;
  const { closed } = await req.json();

  const supabase = createServiceClient();

  const { error } = await supabase
    .from('conversations')
    .update({ closed: !!closed })
    .eq('id', conversationId);

  if (error) {
    return NextResponse.json({ error: 'Fehler beim Aktualisieren.' }, { status: 500 });
  }

  await logAudit({
    action: closed ? 'nachricht.close' : 'nachricht.reopen',
    entityType: 'nachricht',
    entityId: conversationId,
    request: req,
  });

  return NextResponse.json({ success: true });
}
