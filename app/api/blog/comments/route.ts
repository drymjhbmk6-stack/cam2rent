import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

/** GET /api/blog/comments?post_id=... - Genehmigte Kommentare */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const postId = searchParams.get('post_id');

  if (!postId) {
    return NextResponse.json({ error: 'post_id ist erforderlich.' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('blog_comments')
    .select('id, author_name, content, created_at')
    .eq('post_id', postId)
    .eq('status', 'approved')
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ comments: data ?? [] });
}

/** POST /api/blog/comments - Neuen Kommentar einreichen */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { post_id, author_name, author_email, content } = body;

  if (!post_id || !author_name || !author_email || !content) {
    return NextResponse.json({ error: 'Alle Felder sind erforderlich.' }, { status: 400 });
  }

  // Einfache E-Mail-Validierung
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(author_email)) {
    return NextResponse.json({ error: 'Ungültige E-Mail-Adresse.' }, { status: 400 });
  }

  // Content-Laenge begrenzen
  if (content.length > 2000) {
    return NextResponse.json({ error: 'Kommentar darf maximal 2000 Zeichen lang sein.' }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Pruefen ob Post existiert und published ist
  const { data: post } = await supabase
    .from('blog_posts')
    .select('id')
    .eq('id', post_id)
    .eq('status', 'published')
    .single();

  if (!post) {
    return NextResponse.json({ error: 'Artikel nicht gefunden.' }, { status: 404 });
  }

  const { error } = await supabase
    .from('blog_comments')
    .insert({
      post_id,
      author_name: author_name.trim(),
      author_email: author_email.trim().toLowerCase(),
      content: content.trim(),
      status: 'pending',
    });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, message: 'Kommentar eingereicht. Wird nach Prüfung freigeschaltet.' });
}
