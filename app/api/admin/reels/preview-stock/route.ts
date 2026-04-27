/**
 * Phase 3.2 — GET /api/admin/reels/preview-stock?query=...&source=pexels|pixabay
 *
 * Live-Vorschau-Endpoint fuer den "Andere Query"-Modal im Szenen-Editor.
 * Liefert die obersten ~6 Treffer aus der gewaehlten Stock-Quelle inkl.
 * Thumbnail-URL + Auflosung. Resultat wird im Modal als Grid angezeigt,
 * Admin pickt einen Clip und triggert dann den eigentlichen Regenerate-POST.
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkAdminAuth } from '@/lib/admin-auth';
import { pexelsSource } from '@/lib/reels/stock-sources/pexels';
import { pixabaySource } from '@/lib/reels/stock-sources/pixabay';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const query = searchParams.get('query')?.trim() ?? '';
  const sourceParam = searchParams.get('source')?.toLowerCase() ?? 'pexels';

  if (!query) {
    return NextResponse.json({ clips: [], error: 'query-Parameter fehlt' }, { status: 400 });
  }

  const source = sourceParam === 'pixabay' ? pixabaySource : pexelsSource;

  try {
    const available = await source.isAvailable();
    if (!available) {
      return NextResponse.json({ clips: [], error: `${source.name}-API-Key nicht konfiguriert` }, { status: 400 });
    }
    const clips = await source.search(query, {
      excludeIds: new Set<string>(),
      minHeight: 1080,
      perPage: 6,
    });
    return NextResponse.json({
      source: source.name,
      query,
      clips: clips.slice(0, 6).map((c) => ({
        externalId: c.externalId,
        downloadUrl: c.downloadUrl,
        width: c.width,
        height: c.height,
        durationSec: c.durationSec,
        attribution: c.attribution,
        pageUrl: c.pageUrl,
      })),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ clips: [], error: msg }, { status: 500 });
  }
}
