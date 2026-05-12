import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import { generateReel } from '@/lib/reels/orchestrator';
import { createAdminNotification } from '@/lib/admin-notifications';
import { logAudit } from '@/lib/audit';

export const maxDuration = 300;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const supabase = createServiceClient();
  const { data: entry, error: fetchError } = await supabase
    .from('social_reel_plan')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
  if (!entry) return NextResponse.json({ error: 'Eintrag nicht gefunden' }, { status: 404 });

  if (entry.status === 'generating') {
    return NextResponse.json({ error: 'Wird bereits generiert' }, { status: 409 });
  }

  await supabase.from('social_reel_plan').update({ status: 'generating' }).eq('id', id);

  try {
    const result = await generateReel({
      templateId: entry.template_id ?? undefined,
      topic: entry.topic ?? 'Action-Cam Erlebnis',
      keywords: entry.keywords ?? [],
      platforms: entry.platforms ?? ['instagram', 'facebook'],
      previewRequired: true,
      postDate: entry.scheduled_date ? new Date(entry.scheduled_date) : undefined,
    });

    await supabase.from('social_reel_plan').update({
      status: 'generated',
      generated_reel_id: result.reelId,
      error_message: null,
    }).eq('id', id);

    if (result.reelId) {
      await createAdminNotification(supabase, {
        type: 'reel_ready',
        title: 'Reel zum Reviewen',
        message: `Thema: ${entry.topic ?? 'Reel'}`,
        link: `/admin/social/reels/${result.reelId}`,
      });
    }

    await logAudit({
      action: 'reel_plan.generate',
      entityType: 'social_reel_plan',
      entityId: id,
      changes: { reel_id: result.reelId },
      request: req,
    });

    return NextResponse.json({ generated: true, reel_id: result.reelId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await supabase.from('social_reel_plan').update({ status: 'planned', error_message: msg }).eq('id', id);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
