import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import { getFacebookPostInsights, getInstagramPostInsights } from '@/lib/meta/graph-api';

/** GET /api/admin/social/insights?post_id=... → aktuelle Insights holen + cachen */
export async function GET(req: NextRequest) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const postId = url.searchParams.get('post_id');
  if (!postId) return NextResponse.json({ error: 'post_id fehlt' }, { status: 400 });

  const supabase = createServiceClient();
  const { data: post } = await supabase
    .from('social_posts')
    .select('fb_post_id, ig_post_id, fb_account:social_accounts!fb_account_id(access_token), ig_account:social_accounts!ig_account_id(access_token)')
    .eq('id', postId)
    .single();

  if (!post) return NextResponse.json({ error: 'Post nicht gefunden' }, { status: 404 });

  type AccRef = { access_token: string } | null;
  const p = post as unknown as { fb_post_id?: string | null; ig_post_id?: string | null; fb_account: AccRef; ig_account: AccRef };

  const results: Record<string, unknown> = {};

  if (p.fb_post_id && p.fb_account?.access_token) {
    try {
      const ins = await getFacebookPostInsights(p.fb_post_id, p.fb_account.access_token);
      await supabase.from('social_insights').upsert(
        { post_id: postId, platform: 'facebook', ...ins, fetched_at: new Date().toISOString() },
        { onConflict: 'post_id,platform' }
      );
      results.facebook = ins;
    } catch (err) {
      results.facebook = { error: err instanceof Error ? err.message : String(err) };
    }
  }

  if (p.ig_post_id && p.ig_account?.access_token) {
    try {
      const ins = await getInstagramPostInsights(p.ig_post_id, p.ig_account.access_token);
      await supabase.from('social_insights').upsert(
        { post_id: postId, platform: 'instagram', ...ins, fetched_at: new Date().toISOString() },
        { onConflict: 'post_id,platform' }
      );
      results.instagram = ins;
    } catch (err) {
      results.instagram = { error: err instanceof Error ? err.message : String(err) };
    }
  }

  return NextResponse.json(results);
}
