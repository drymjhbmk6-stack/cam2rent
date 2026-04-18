import { NextRequest, NextResponse } from 'next/server';
import { checkAdminAuth } from '@/lib/admin-auth';
import { createServiceClient } from '@/lib/supabase';
import { generateFromTemplate } from '@/lib/meta/ai-content';

/**
 * POST /api/admin/social/generate
 * Body: { template_id?, caption_prompt?, image_prompt?, default_hashtags?, variables? }
 *
 * Entweder eine template_id ODER einen freien caption_prompt übergeben.
 */
export async function POST(req: NextRequest) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  let captionPrompt: string | undefined = body.caption_prompt;
  let imagePrompt: string | undefined = body.image_prompt;
  let defaultHashtags: string[] = body.default_hashtags ?? [];

  if (body.template_id) {
    const supabase = createServiceClient();
    const { data: tpl, error } = await supabase
      .from('social_templates')
      .select('caption_prompt, image_prompt, default_hashtags')
      .eq('id', body.template_id)
      .single();
    if (error || !tpl) {
      return NextResponse.json({ error: 'Template nicht gefunden' }, { status: 404 });
    }
    captionPrompt = tpl.caption_prompt;
    imagePrompt = tpl.image_prompt ?? undefined;
    defaultHashtags = tpl.default_hashtags ?? [];
  }

  if (!captionPrompt) {
    return NextResponse.json({ error: 'caption_prompt oder template_id erforderlich' }, { status: 400 });
  }

  try {
    const result = await generateFromTemplate({
      caption_prompt: captionPrompt,
      image_prompt: imagePrompt,
      default_hashtags: defaultHashtags,
      variables: body.variables ?? {},
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unbekannter Fehler';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
