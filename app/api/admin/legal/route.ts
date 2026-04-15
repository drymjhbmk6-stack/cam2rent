import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';

/**
 * GET /api/admin/legal — Alle Dokumente mit aktueller Version
 * GET /api/admin/legal?slug=agb — Einzelnes Dokument mit Content
 * GET /api/admin/legal?slug=agb&versions=1 — Dokument + Versionshistorie
 */
export async function GET(req: Request) {
  if (!await checkAdminAuth()) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const slug = searchParams.get('slug');
  const withVersions = searchParams.get('versions') === '1';
  const supabase = createServiceClient();

  // Einzelnes Dokument
  if (slug) {
    const { data: doc, error } = await supabase
      .from('legal_documents')
      .select('id, slug, title, current_version_id, updated_at')
      .eq('slug', slug)
      .single();

    if (error || !doc) {
      return NextResponse.json({ error: 'Dokument nicht gefunden' }, { status: 404 });
    }

    // Aktuelle Version laden
    let currentVersion = null;
    if (doc.current_version_id) {
      const { data } = await supabase
        .from('legal_document_versions')
        .select('id, version_number, content, content_format, change_note, published_at, published_by, is_current')
        .eq('id', doc.current_version_id)
        .single();
      currentVersion = data;
    }

    // Versionshistorie
    let versions = null;
    if (withVersions) {
      const { data } = await supabase
        .from('legal_document_versions')
        .select('id, version_number, content, content_format, change_note, published_at, published_by, is_current')
        .eq('document_id', doc.id)
        .order('version_number', { ascending: false });
      versions = data;
    }

    return NextResponse.json({ document: doc, currentVersion, versions });
  }

  // Alle Dokumente (Übersicht)
  const { data: docs, error } = await supabase
    .from('legal_documents')
    .select('id, slug, title, current_version_id, updated_at')
    .order('title');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Aktuelle Versionen nachladen (change_note + published_at)
  const versionIds = docs?.map((d) => d.current_version_id).filter(Boolean) ?? [];
  let versionMap: Record<string, { version_number: number; change_note: string | null; published_at: string }> = {};

  if (versionIds.length > 0) {
    const { data: versions } = await supabase
      .from('legal_document_versions')
      .select('id, version_number, change_note, published_at')
      .in('id', versionIds);

    if (versions) {
      versionMap = Object.fromEntries(versions.map((v) => [v.id, v]));
    }
  }

  const result = (docs ?? []).map((doc) => ({
    ...doc,
    currentVersion: doc.current_version_id ? versionMap[doc.current_version_id] ?? null : null,
  }));

  return NextResponse.json({ documents: result });
}
