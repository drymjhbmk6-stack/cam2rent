import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { renderEmailPreview, sendInboundReply } from '@/lib/email';
import { getCurrentAdminUser } from '@/lib/admin-auth';

const SCHEMA_ERROR = /column|schema cache|PGRST|does not exist/i;

interface ConvRow {
  id: string;
  customer_id: string | null;
  subject: string;
  booking_id: string | null;
  source?: string | null;
  customer_email?: string | null;
  customer_name?: string | null;
  assigned_admin_user_id?: string | null;
  inbox_address?: string | null;
}

/** Konversation laden — mit Fallback auf das alte Schema ohne E-Mail-Felder. */
async function loadConversation(
  supabase: ReturnType<typeof createServiceClient>,
  conversationId: string,
): Promise<ConvRow | null> {
  const full = await supabase
    .from('conversations')
    .select('id, customer_id, subject, booking_id, source, customer_email, customer_name, assigned_admin_user_id, inbox_address')
    .eq('id', conversationId)
    .maybeSingle();
  if (!full.error) return full.data as ConvRow | null;
  if (!SCHEMA_ERROR.test(full.error.message)) return null;
  const fallback = await supabase
    .from('conversations')
    .select('id, customer_id, subject, booking_id')
    .eq('id', conversationId)
    .maybeSingle();
  return (fallback.data as ConvRow | null) ?? null;
}

function mayAccess(me: { id: string; role: string } | null, conv: ConvRow): boolean {
  if (!me) return false;
  if (me.role === 'owner') return true;
  return !conv.assigned_admin_user_id || conv.assigned_admin_user_id === me.id;
}

/**
 * POST /api/admin/nachrichten/[conversationId]/preview
 * Rendert die E-Mail-Antwort exakt so, wie sie an den Kunden verschickt wuerde
 * (kompletter Cam2Rent-Wrapper) — OHNE tatsaechlichen Versand. Fuer die
 * Live-Vorschau im Admin-Chat.
 * Body: { body: string }  ->  { html, subject }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  const { conversationId } = await params;

  let payload: { body?: string };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'Ungültiger Request-Body.' }, { status: 400 });
  }
  const body = (payload.body ?? '').toString();

  const supabase = createServiceClient();
  const conv = await loadConversation(supabase, conversationId);
  if (!conv) {
    return NextResponse.json({ error: 'Konversation nicht gefunden.' }, { status: 404 });
  }

  const me = await getCurrentAdminUser();
  if (!mayAccess(me, conv)) {
    return NextResponse.json({ error: 'Keine Berechtigung für diese Konversation.' }, { status: 403 });
  }

  if ((conv.source ?? 'account') !== 'email') {
    return NextResponse.json({ error: 'Vorschau nur für E-Mail-Konversationen.' }, { status: 400 });
  }

  const customerName =
    conv.customer_name || (conv.customer_email ? conv.customer_email.split('@')[0] : 'Kunde');

  // Gleiche send-Funktion wie beim echten Versand — im Capture-Modus, kein
  // Versand, kein Log. Damit ist die Vorschau byte-genau die echte E-Mail.
  const { html, subject } = await renderEmailPreview(
    async (d: Parameters<typeof sendInboundReply>[0]) => { await sendInboundReply(d); },
    {
      customerEmail: conv.customer_email || 'kunde@example.com',
      customerName,
      subject: conv.subject,
      body,
    },
  );

  return NextResponse.json({ html, subject });
}
