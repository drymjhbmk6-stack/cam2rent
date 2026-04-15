import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }

  const { id } = await params;
  const supabase = createServiceClient();

  const { data: creditNote } = await supabase
    .from('credit_notes')
    .select('status')
    .eq('id', id)
    .maybeSingle();

  if (!creditNote) {
    return NextResponse.json({ error: 'Gutschrift nicht gefunden.' }, { status: 404 });
  }

  if (creditNote.status !== 'pending_review') {
    return NextResponse.json({ error: 'Nur Entwürfe können verworfen werden.' }, { status: 400 });
  }

  const { error } = await supabase
    .from('credit_notes')
    .update({ status: 'rejected' })
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
