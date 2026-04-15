import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';

/**
 * POST /api/admin/legal/publish — Neue Version veröffentlichen
 * Body: { document_id, content, content_format?, change_note? }
 * Nutzt die Postgres-Funktion publish_legal_version für atomare Versionierung.
 */
export async function POST(req: Request) {
  if (!await checkAdminAuth()) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { document_id, content, content_format, change_note } = body;

  if (!document_id || !content) {
    return NextResponse.json({ error: 'document_id und content erforderlich' }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data, error } = await supabase.rpc('publish_legal_version', {
    p_document_id: document_id,
    p_content: content,
    p_format: content_format || 'markdown',
    p_change_note: change_note || null,
    p_user_id: null,
  });

  if (error) {
    console.error('publish_legal_version Fehler:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Revalidation-Tag auslösen (ISR)
  // Slug nachschlagen für Revalidation
  const { data: doc } = await supabase
    .from('legal_documents')
    .select('slug')
    .eq('id', document_id)
    .single();

  if (doc?.slug) {
    try {
      const { revalidateTag } = await import('next/cache');
      revalidateTag(`legal:${doc.slug}`);
    } catch {
      // Revalidation nicht verfügbar in allen Umgebungen
    }
  }

  return NextResponse.json({ success: true, version_id: data });
}
