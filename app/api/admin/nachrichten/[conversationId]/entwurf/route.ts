import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { getCurrentAdminUser } from '@/lib/admin-auth';
import { verarbeiteKundenanfrage } from '@/lib/ai/auto-reply';
import { logAudit } from '@/lib/audit';

const SCHEMA_ERROR = /column|schema cache|PGRST|does not exist/i;

/**
 * POST /api/admin/nachrichten/[conversationId]/entwurf
 *
 * Verwaltet den KI-Antwort-Entwurf einer Konversation.
 * Body: { action: 'discard' | 'regenerate' }
 *
 *  - discard    → Entwurf verwerfen (der Admin antwortet selbst).
 *  - regenerate → neuen Entwurf erzeugen. Erzwingt den Entwurfs-Pfad, es geht
 *                 also NIE eine Mail raus, auch wenn die Gates "auto" saegen
 *                 wuerden — der Admin hat hier bewusst die Hand am Steuer.
 *
 * Permission laeuft ueber den bestehenden Prefix /api/admin/nachrichten
 * (Middleware → `kunden`).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  const { conversationId } = await params;

  let action = '';
  try {
    const body = await req.json();
    action = String(body?.action ?? '');
  } catch {
    return NextResponse.json({ error: 'Ungültige Anfrage.' }, { status: 400 });
  }
  if (action !== 'discard' && action !== 'regenerate') {
    return NextResponse.json({ error: 'Unbekannte Aktion.' }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Zugriffsrecht: Owner alles, Mitarbeiter nur eigene + unzugeordnete.
  const conv = await supabase
    .from('conversations')
    .select('id, assigned_admin_user_id, source, closed')
    .eq('id', conversationId)
    .maybeSingle();
  if (conv.error || !conv.data) {
    return NextResponse.json({ error: 'Konversation nicht gefunden.' }, { status: 404 });
  }
  const me = await getCurrentAdminUser();
  const assigned = (conv.data as { assigned_admin_user_id?: string | null }).assigned_admin_user_id;
  if (!me || (me.role !== 'owner' && assigned && assigned !== me.id)) {
    return NextResponse.json({ error: 'Keine Berechtigung für diese Konversation.' }, { status: 403 });
  }

  if (action === 'discard') {
    const { error } = await supabase
      .from('conversations')
      .update({ ai_draft: null, ai_draft_created_at: null })
      .eq('id', conversationId);
    if (error) {
      if (SCHEMA_ERROR.test(error.message)) {
        return NextResponse.json(
          { error: 'Migration ausstehend: supabase/supabase-ai-auto-reply.sql' },
          { status: 503 },
        );
      }
      return NextResponse.json({ error: 'Entwurf konnte nicht verworfen werden.' }, { status: 500 });
    }
    await logAudit({
      action: 'nachricht.ai_draft_discard',
      entityType: 'nachricht',
      entityId: conversationId,
      request: req,
    });
    return NextResponse.json({ success: true });
  }

  // regenerate — Antwort neu erzeugen, aber immer nur als Entwurf.
  const kanal = ((conv.data as { source?: string | null }).source ?? 'account') === 'email'
    ? 'email'
    : 'account';
  const result = await verarbeiteKundenanfrage(supabase, {
    conversationId,
    kanal,
    nurEntwurf: true,
  });

  if (result.status === 'skipped') {
    return NextResponse.json({ error: `Kein Entwurf möglich: ${result.grund}` }, { status: 422 });
  }

  await logAudit({
    action: 'nachricht.ai_draft_regenerate',
    entityType: 'nachricht',
    entityId: conversationId,
    request: req,
  });

  return NextResponse.json({ success: true, status: result.status });
}
