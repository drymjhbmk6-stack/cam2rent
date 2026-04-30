import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import { logAudit } from '@/lib/audit';

/** GET — alle Serien mit Parts */
export async function GET() {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const supabase = createServiceClient();
  const { data: series, error } = await supabase
    .from('social_series')
    .select('*, parts:social_series_parts(*)')
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ series: series ?? [] });
}

/** POST — neue Serie mit Parts anlegen */
export async function POST(req: NextRequest) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();

  const supabase = createServiceClient();
  const { data: series, error: seriesError } = await supabase.from('social_series').insert({
    title: body.title,
    description: body.description ?? '',
    platforms: body.platforms ?? ['facebook', 'instagram'],
    total_parts: body.parts?.length ?? 3,
    status: 'active',
  }).select().single();
  if (seriesError || !series) return NextResponse.json({ error: seriesError?.message ?? 'Fehler' }, { status: 500 });

  const parts = (body.parts ?? []) as Array<{ topic: string; angle?: string; keywords?: string[] }>;
  if (parts.length > 0) {
    const partsData = parts.map((p, i) => ({
      series_id: series.id,
      part_number: i + 1,
      topic: p.topic,
      angle: p.angle ?? null,
      keywords: p.keywords ?? [],
    }));
    const { error: partsError } = await supabase.from('social_series_parts').insert(partsData);
    if (partsError) return NextResponse.json({ error: partsError.message }, { status: 500 });
  }

  await logAudit({
    action: 'social_series.create',
    entityType: 'social_series',
    entityId: series?.id,
    entityLabel: series?.title,
    changes: { parts: parts.length },
    request: req,
  });

  return NextResponse.json({ series });
}
