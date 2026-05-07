import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

export const runtime = 'nodejs';
export const revalidate = 600; // 10 min

/**
 * GET /api/home-ugc
 * Liefert freigegebene Kundenmaterial-Bilder fuer die Startseiten-Galerie.
 * Nur Bilder (keine Videos), Sweep 8 H1: NUR mit Website-Consent
 * (Sweep 7 hatte irrtuemlich auch Social-Consent gezeigt — § 22 KUG-Verstoss).
 * Signed URLs (1h statt 24h) wegen privatem Bucket — kuerzere Lifetime
 * reduziert Reuse-Risiko bei Cache-Leak.
 */
export async function GET() {
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('customer_ugc_submissions')
      .select('id, customer_name, file_paths, file_kinds, caption, featured_at, consent_name_visible, consent_use_website, status')
      .in('status', ['approved', 'featured'])
      .eq('consent_use_website', true)
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
        .createSignedUrl(path, 60 * 60); // 1h statt 24h (Sweep 8 H1)
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
