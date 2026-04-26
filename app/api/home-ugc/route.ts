import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

export const runtime = 'nodejs';
export const revalidate = 600; // 10 min

/**
 * GET /api/home-ugc
 * Liefert freigegebene Kundenmaterial-Bilder fuer die Startseiten-Galerie.
 * Nur Bilder (keine Videos), nur mit Website- oder Social-Consent.
 * Signed URLs (24h) wegen privatem Bucket.
 */
export async function GET() {
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('customer_ugc_submissions')
      .select('id, customer_name, file_paths, file_kinds, caption, featured_at, consent_name_visible, consent_use_website, consent_use_social, status')
      .in('status', ['approved', 'featured'])
      .or('consent_use_website.eq.true,consent_use_social.eq.true')
      .order('featured_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(40);

    if (error) {
      return NextResponse.json({ items: [] });
    }

    type Item = {
      id: string;
      url: string;
      caption: string | null;
      authorName: string | null;
    };

    const items: Item[] = [];

    for (const row of data ?? []) {
      const paths: string[] = row.file_paths ?? [];
      const kinds: string[] = row.file_kinds ?? [];
      // Erstes Bild pro Submission reicht — Galerie soll vielfaeltig wirken
      const firstImageIdx = kinds.findIndex((k) => k === 'image');
      if (firstImageIdx === -1) continue;

      const path = paths[firstImageIdx];
      if (!path) continue;

      const { data: signed } = await supabase.storage
        .from('customer-ugc')
        .createSignedUrl(path, 60 * 60 * 24);
      if (!signed?.signedUrl) continue;

      items.push({
        id: row.id,
        url: signed.signedUrl,
        caption: row.caption ?? null,
        authorName: row.consent_name_visible ? (row.customer_name ?? null) : null,
      });

      if (items.length >= 12) break;
    }

    return NextResponse.json({ items });
  } catch {
    return NextResponse.json({ items: [] });
  }
}
