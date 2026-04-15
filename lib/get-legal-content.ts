import { createServiceClient } from '@/lib/supabase';
import { unstable_cache } from 'next/cache';

export interface LegalContent {
  slug: string;
  title: string;
  content: string;
  content_format: 'markdown' | 'html';
  version_number: number;
  published_at: string | null;
  updated_at: string | null;
}

/**
 * Lädt den aktuellen Inhalt eines Rechtsdokuments aus der DB.
 * Gecached per revalidateTag('legal:{slug}') — wird beim Publish invalidiert.
 * Fallback: null wenn Dokument nicht existiert (Seite zeigt dann Platzhalter).
 */
async function fetchLegalContent(slug: string): Promise<LegalContent | null> {
  const supabase = createServiceClient();

  const { data: doc } = await supabase
    .from('legal_documents')
    .select('id, slug, title, current_version_id, updated_at')
    .eq('slug', slug)
    .single();

  if (!doc?.current_version_id) return null;

  const { data: version } = await supabase
    .from('legal_document_versions')
    .select('content, content_format, version_number, published_at')
    .eq('id', doc.current_version_id)
    .single();

  if (!version) return null;

  return {
    slug: doc.slug,
    title: doc.title,
    content: version.content,
    content_format: version.content_format as 'markdown' | 'html',
    version_number: version.version_number,
    published_at: version.published_at,
    updated_at: doc.updated_at,
  };
}

/**
 * getLegalContent — cached Version von fetchLegalContent.
 * Revalidiert über Tag 'legal:{slug}'.
 */
export function getLegalContent(slug: string): Promise<LegalContent | null> {
  return unstable_cache(
    () => fetchLegalContent(slug),
    [`legal-content-${slug}`],
    { tags: [`legal:${slug}`], revalidate: 300 }
  )();
}
