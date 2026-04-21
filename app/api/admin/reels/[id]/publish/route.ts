import { NextRequest, NextResponse } from 'next/server';
import { checkAdminAuth } from '@/lib/admin-auth';
import { publishReel } from '@/lib/reels/publisher';
import { logAudit } from '@/lib/audit';

export const runtime = 'nodejs';
export const maxDuration = 300;

/** POST /api/admin/reels/[id]/publish — sofort auf Meta veröffentlichen */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await ctx.params;

  const result = await publishReel(id);

  await logAudit({
    action: 'reel.publish',
    entityType: 'social_reel',
    entityId: id,
    changes: { fb_reel_id: result.fb_reel_id, ig_reel_id: result.ig_reel_id, errors: result.errors },
    request: req,
  });

  return NextResponse.json(result, { status: result.success ? 200 : 207 });
}
