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

/** Wie lange wir maximal auf Supabase warten bevor wir auf die hardcoded
 * JSX-Fallback-Seite zurueckfallen. Wichtig beim Build: sonst kann der
 * Docker-Build haengen, wenn Supabase gerade 522/timeout liefert.
 */
const LEGAL_FETCH_TIMEOUT_MS = 5000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Supabase-Timeout nach ${ms}ms`)), ms)
    ),
  ]);
}

/**
 * Lädt den aktuellen Inhalt eines Rechtsdokuments aus der DB.
 * Gecached per revalidateTag('legal:{slug}') — wird beim Publish invalidiert.
 * Fallback: null wenn Dokument nicht existiert ODER Supabase nicht antwortet
 * (Seite zeigt dann die hardcoded JSX-Version — kein Build-Fail).
 */
async function fetchLegalContent(slug: string): Promise<LegalContent | null> {
  try {
    const supabase = createServiceClient();

    const docRes = await withTimeout(
      supabase
        .from('legal_documents')
        .select('id, slug, title, current_version_id, updated_at')
        .eq('slug', slug)
        .single(),
      LEGAL_FETCH_TIMEOUT_MS
    );
    const doc = docRes.data;

    if (!doc?.current_version_id) return null;

    const versionRes = await withTimeout(
      supabase
        .from('legal_document_versions')
        .select('content, content_format, version_number, published_at')
        .eq('id', doc.current_version_id)
        .single(),
      LEGAL_FETCH_TIMEOUT_MS
    );
    const version = versionRes.data;

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
  } catch (err) {
    console.warn(`[legal] getLegalContent("${slug}") fehlgeschlagen, Fallback auf statische JSX:`, err instanceof Error ? err.message : err);
    return null;
  }
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
