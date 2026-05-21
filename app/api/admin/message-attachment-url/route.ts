import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { getCurrentAdminUser } from '@/lib/admin-auth';

/**
 * GET /api/admin/message-attachment-url?id=<message_attachment-id>
 *
 * Liefert eine Signed URL (5 Min) fuer einen E-Mail-Anhang aus dem privaten
 * Bucket `email-attachments`. Der Storage-Pfad wird serverseitig aus der
 * message_attachments-Zeile aufgeloest — der Client uebergibt nur die ID,
 * kein freier Pfad (kein Path-Traversal moeglich).
 */
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: 'Ungueltige ID.' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data: att } = await supabase
    .from('message_attachments')
    .select('storage_path, message_id')
    .eq('id', id)
    .maybeSingle();

  if (!att) {
    return NextResponse.json({ error: 'Anhang nicht gefunden.' }, { status: 404 });
  }

  // Mitarbeiter duerfen nur Anhaenge aus ihnen zugeordneten (oder
  // unzugeordneten) Konversationen oeffnen; Owner alles. Faellt die
  // per-employee-Migration aus, degradiert die Pruefung offen (wie zuvor).
  const me = await getCurrentAdminUser();
  if (me && me.role !== 'owner') {
    const { data: msg } = await supabase
      .from('messages')
      .select('conversation_id')
      .eq('id', att.message_id)
      .maybeSingle();
    if (msg) {
      const { data: conv } = await supabase
        .from('conversations')
        .select('assigned_admin_user_id')
        .eq('id', msg.conversation_id)
        .maybeSingle();
      if (conv?.assigned_admin_user_id && conv.assigned_admin_user_id !== me.id) {
        return NextResponse.json({ error: 'Keine Berechtigung.' }, { status: 403 });
      }
    }
  }

  const { data, error } = await supabase.storage
    .from('email-attachments')
    .createSignedUrl(att.storage_path, 60 * 5);

  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: error?.message ?? 'URL nicht erzeugbar.' }, { status: 404 });
  }

  return NextResponse.redirect(data.signedUrl, { status: 302 });
}
