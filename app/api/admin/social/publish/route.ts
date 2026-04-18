import { NextRequest, NextResponse } from 'next/server';
import { checkAdminAuth } from '@/lib/admin-auth';
import { publishPost } from '@/lib/meta/publisher';

/** POST /api/admin/social/publish  body: { id: string } — sofort veröffentlichen */
export async function POST(req: NextRequest) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: 'id fehlt' }, { status: 400 });

  const result = await publishPost(id);
  return NextResponse.json(result, { status: result.success ? 200 : 207 });
}
