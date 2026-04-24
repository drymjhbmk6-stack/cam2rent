import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServiceClient } from '@/lib/supabase';

export const runtime = 'nodejs';

type Params = Promise<{ id: string }>;

/**
 * POST /api/customer-ugc/withdraw/[id]
 * Kunde zieht seine Einwilligung zurueck. Dateien werden geloescht,
 * Status auf "withdrawn" gesetzt. Bereits ausgegebene Gutscheine bleiben
 * guelting — das ist steuerlich/rechtlich sauber (Widerruf ist nur fuer
 * zukuenftige Nutzung).
 * Body: { reason?: string }
 */
export async function POST(req: NextRequest, { params }: { params: Params }) {
  const { id } = await params;

  const authHeader = req.headers.get('authorization');
  if (!authHeader) {
    return NextResponse.json({ error: 'Nicht angemeldet.' }, { status: 401 });
  }

  const token = authHeader.replace('Bearer ', '');
  const supabaseAuth = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const {
    data: { user },
    error: authError,
  } = await supabaseAuth.auth.getUser(token);

  if (authError || !user) {
    return NextResponse.json({ error: 'Nicht angemeldet.' }, { status: 401 });
  }

  let reason = '';
  try {
    const body = await req.json();
    reason = String(body?.reason ?? '').trim().slice(0, 500);
  } catch {
    // leerer Body ist OK
  }

  const supabase = createServiceClient();

  const { data: submission, error: loadErr } = await supabase
    .from('customer_ugc_submissions')
    .select('id, user_id, file_paths, status')
    .eq('id', id)
    .maybeSingle();

  if (loadErr || !submission) {
    return NextResponse.json({ error: 'Einreichung nicht gefunden.' }, { status: 404 });
  }

  if (submission.user_id !== user.id) {
    return NextResponse.json({ error: 'Keine Berechtigung.' }, { status: 403 });
  }

  if (submission.status === 'withdrawn') {
    return NextResponse.json({ success: true, alreadyWithdrawn: true });
  }

  // Dateien aus Storage entfernen (best effort — kein Abbruch bei Fehler)
  if (Array.isArray(submission.file_paths) && submission.file_paths.length > 0) {
    const { error: removeErr } = await supabase.storage
      .from('customer-ugc')
      .remove(submission.file_paths);
    if (removeErr) {
      console.error('[ugc-withdraw] Storage-Remove-Fehler:', removeErr.message);
    }
  }

  const { error: updateErr } = await supabase
    .from('customer_ugc_submissions')
    .update({
      status: 'withdrawn',
      withdrawn_at: new Date().toISOString(),
      withdrawn_reason: reason || null,
      file_paths: [],
    })
    .eq('id', id);

  if (updateErr) {
    console.error('[ugc-withdraw] Update-Fehler:', updateErr.message);
    return NextResponse.json({ error: 'Widerruf fehlgeschlagen.' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
