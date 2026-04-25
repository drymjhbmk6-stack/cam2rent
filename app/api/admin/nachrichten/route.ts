import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

/**
 * GET /api/admin/nachrichten
 * List all conversations with customer info and unread counts.
 */
export async function GET() {
  const supabase = createServiceClient();

  const { data: conversations, error } = await supabase
    .from('conversations')
    .select('id, customer_id, subject, booking_id, last_message_at, closed, created_at')
    .order('last_message_at', { ascending: false });

  if (error) {
    return NextResponse.json({ conversations: [] });
  }

  // Enrich with customer info and unread counts
  const customerIds = [...new Set((conversations ?? []).map((c) => c.customer_id))];
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
    return {
      ...conv,
      customer: profileMap[conv.customer_id] || { full_name: 'Unbekannt', email: '' },
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
