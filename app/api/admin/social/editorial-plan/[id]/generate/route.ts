import { NextRequest, NextResponse } from 'next/server';
import { checkAdminAuth } from '@/lib/admin-auth';
import { generateEntryPost } from '@/lib/meta/generate-plan-entry';
import { logAudit } from '@/lib/audit';

/**
 * POST /api/admin/social/editorial-plan/[id]/generate
 * Generiert den Post zu einem Plan-Eintrag SOFORT, ohne Scheduler-Check.
 * Ruft Claude + DALL-E auf. Kann 20-60 Sekunden dauern — der User wartet.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const result = await generateEntryPost(id);
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  await logAudit({
    action: 'social_editorial_plan.generate',
    entityType: 'social_editorial_plan',
    entityId: id,
    changes: { post_id: result.post_id },
    request: req,
  });

  return NextResponse.json({ post_id: result.post_id });
}
