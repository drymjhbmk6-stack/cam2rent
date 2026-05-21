import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { sendNewMessageNotificationToCustomer, sendInboundReply } from '@/lib/email';
import { logAudit } from '@/lib/audit';

const SCHEMA_ERROR = /column|schema cache|PGRST|does not exist/i;

interface ConvRow {
  id: string;
  customer_id: string | null;
  subject: string;
  booking_id: string | null;
  closed: boolean;
  created_at: string;
  source?: string | null;
  customer_email?: string | null;
  customer_name?: string | null;
}

/** Konversation laden — mit Fallback auf das alte Schema ohne E-Mail-Felder. */
async function loadConversation(
  supabase: ReturnType<typeof createServiceClient>,
  conversationId: string,
): Promise<ConvRow | null> {
  const full = await supabase
    .from('conversations')
    .select('id, customer_id, subject, booking_id, closed, created_at, source, customer_email, customer_name')
    .eq('id', conversationId)
    .maybeSingle();
  if (!full.error) return full.data as ConvRow | null;
  if (!SCHEMA_ERROR.test(full.error.message)) return null;
  const fallback = await supabase
    .from('conversations')
    .select('id, customer_id, subject, booking_id, closed, created_at')
    .eq('id', conversationId)
    .maybeSingle();
  return (fallback.data as ConvRow | null) ?? null;
}

/**
 * GET /api/admin/nachrichten/[conversationId]
 * Alle Nachrichten einer Konversation. Markiert Kundennachrichten als gelesen.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  const { conversationId } = await params;
  const supabase = createServiceClient();

  const conv = await loadConversation(supabase, conversationId);
  if (!conv) {
    return NextResponse.json({ error: 'Konversation nicht gefunden.' }, { status: 404 });
  }

  // Nachrichten — mit Fallback ohne body_html/email_message_id.
  let messages: Array<{
    id: string;
    sender_type: string;
    sender_id: string;
    body: string;
    body_html?: string | null;
    email_message_id?: string | null;
    read: boolean;
    created_at: string;
  }> = [];
  const msgFull = await supabase
    .from('messages')
    .select('id, sender_type, sender_id, body, body_html, email_message_id, read, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });
  if (msgFull.error && SCHEMA_ERROR.test(msgFull.error.message)) {
    const msgFallback = await supabase
      .from('messages')
      .select('id, sender_type, sender_id, body, read, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });
    messages = msgFallback.data ?? [];
  } else {
    messages = msgFull.data ?? [];
  }

  // Anhaenge pro Nachricht (Bulk-Query, defensiv bei fehlender Tabelle).
  const attByMessage: Record<string, Array<{ id: string; filename: string; mime_type: string | null; size_bytes: number | null }>> = {};
  const messageIds = messages.map((m) => m.id);
  if (messageIds.length > 0) {
    const { data: atts } = await supabase
      .from('message_attachments')
      .select('id, message_id, filename, mime_type, size_bytes')
      .in('message_id', messageIds);
    for (const a of atts ?? []) {
      (attByMessage[a.message_id] ??= []).push({
        id: a.id,
        filename: a.filename,
        mime_type: a.mime_type,
        size_bytes: a.size_bytes,
      });
    }
  }

  // Kundennachrichten als gelesen markieren.
  supabase
    .from('messages')
    .update({ read: true })
    .eq('conversation_id', conversationId)
    .eq('sender_type', 'customer')
    .eq('read', false)
    .then(() => {});

  // Kundeninfo: bei Konto-Konversation aus profiles/auth, sonst aus den
  // E-Mail-Feldern der Konversation.
  let customerName = conv.customer_name || '';
  let customerEmail = conv.customer_email || '';
  if (conv.customer_id) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', conv.customer_id)
      .maybeSingle();
    try {
      const { data } = await supabase.auth.admin.listUsers({ perPage: 1000 });
      const authUser = data?.users?.find((u) => u.id === conv.customer_id);
      customerEmail = customerEmail || authUser?.email || '';
      customerName = customerName || profile?.full_name || authUser?.email?.split('@')[0] || '';
    } catch {
      customerName = customerName || profile?.full_name || '';
    }
  }
  if (!customerName) customerName = customerEmail.split('@')[0] || 'Unbekannt';

  return NextResponse.json({
    conversation: {
      ...conv,
      source: conv.source ?? 'account',
      customer: { full_name: customerName, email: customerEmail },
    },
    messages: messages.map((m) => ({
      ...m,
      attachments: attByMessage[m.id] ?? [],
    })),
  });
}

/**
 * POST /api/admin/nachrichten/[conversationId]
 * Admin-Antwort. Body: { body: string }
 *
 * Bei source='email' geht die Antwort als ECHTE E-Mail an den Kunden raus.
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

  const conv = await loadConversation(supabase, conversationId);
  if (!conv) {
    return NextResponse.json({ error: 'Konversation nicht gefunden.' }, { status: 404 });
  }

  const isEmailThread = (conv.source ?? 'account') === 'email';

  // Platzhalter-sender_id (Admin-Cookie-Auth, kein Supabase-Auth-User).
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

  await supabase
    .from('conversations')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', conversationId);

  if (isEmailThread) {
    // Echte E-Mail-Antwort. In-Reply-To = Message-ID der letzten Kundenmail.
    let customerEmail = conv.customer_email || '';
    if (!customerEmail && conv.customer_id) {
      try {
        const { data } = await supabase.auth.admin.listUsers({ perPage: 1000 });
        customerEmail = data?.users?.find((u) => u.id === conv.customer_id)?.email || '';
      } catch {
        // ignore
      }
    }
    if (customerEmail) {
      let inReplyTo: string | null = null;
      const { data: lastInbound } = await supabase
        .from('messages')
        .select('email_message_id')
        .eq('conversation_id', conversationId)
        .eq('sender_type', 'customer')
        .not('email_message_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (lastInbound?.email_message_id) inReplyTo = lastInbound.email_message_id;

      try {
        const resendId = await sendInboundReply({
          customerEmail,
          customerName: conv.customer_name || customerEmail.split('@')[0],
          subject: conv.subject,
          body: body.trim(),
          bookingId: conv.booking_id,
          inReplyToMessageId: inReplyTo,
        });
        if (resendId) {
          await supabase
            .from('messages')
            .update({ email_message_id: resendId })
            .eq('id', msg.id);
        }
      } catch {
        // Mail-Versand fehlgeschlagen — Nachricht bleibt in der DB,
        // Admin kann erneut antworten.
      }
    }
  } else {
    // Konto-Konversation: nur "neue Nachricht"-Benachrichtigung.
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
  }

  await logAudit({
    action: isEmailThread ? 'nachricht.email_reply' : 'nachricht.reply',
    entityType: 'nachricht',
    entityId: conversationId,
    request: req,
  });

  return NextResponse.json({ message_id: msg.id });
}

/**
 * PATCH /api/admin/nachrichten/[conversationId]
 * Konversation schliessen/wiedereroeffnen. Body: { closed: boolean }
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
