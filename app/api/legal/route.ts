import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

/**
 * GET /api/legal?slug=agb — Öffentliche API: Aktuelle Version eines Dokuments
 * Wird von Shop-Seiten genutzt (Server Components).
 * Cached für 5 Minuten.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const slug = searchParams.get('slug');

  if (!slug) {
    return NextResponse.json({ error: 'slug Parameter erforderlich' }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Dokument + aktuelle Version in einem Join
  const { data: doc, error } = await supabase
    .from('legal_documents')
    .select('id, slug, title, current_version_id, updated_at')
    .eq('slug', slug)
    .single();

  if (error || !doc) {
    return NextResponse.json({ error: 'Dokument nicht gefunden' }, { status: 404 });
  }

  if (!doc.current_version_id) {
    return NextResponse.json({ error: 'Keine veröffentlichte Version vorhanden' }, { status: 404 });
  }

  const { data: version } = await supabase
    .from('legal_document_versions')
    .select('id, version_number, content, content_format, published_at')
    .eq('id', doc.current_version_id)
    .single();

  return NextResponse.json(
    {
      slug: doc.slug,
      title: doc.title,
      content: version?.content ?? '',
      content_format: version?.content_format ?? 'markdown',
      version_number: version?.version_number ?? 1,
      published_at: version?.published_at,
      updated_at: doc.updated_at,
    },
    {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    }
  );
}
