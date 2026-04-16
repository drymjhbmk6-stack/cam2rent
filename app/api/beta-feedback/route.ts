import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

/**
 * POST /api/beta-feedback — Speichert Beta-Feedback
 * GET  /api/beta-feedback — Laedt alle Feedbacks (Admin)
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const supabase = createServiceClient();

    const { error } = await supabase.from('beta_feedback').insert({
      tester_name: body.testerName || null,
      tester_email: body.testerEmail || null,
      wants_gutschein: body.wantsGutschein ?? false,
      answers: body.answers,
      user_agent: body.userAgent || null,
    });

    if (error) {
      console.error('Beta feedback save error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Beta feedback error:', err);
    return NextResponse.json({ error: 'Fehler beim Speichern.' }, { status: 500 });
  }
}

export async function GET() {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from('beta_feedback')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ feedbacks: data ?? [] });
}

/**
 * DELETE /api/beta-feedback?id=UUID — Löscht ein einzelnes Feedback
 */
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'id erforderlich.' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { error } = await supabase.from('beta_feedback').delete().eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
