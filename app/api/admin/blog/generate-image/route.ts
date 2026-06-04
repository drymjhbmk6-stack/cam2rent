import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { generateBlogImageWithFallback } from '@/lib/blog-image';

async function getKeys(): Promise<{ openai: string | null; unsplash: string | null }> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('admin_settings')
    .select('value')
    .eq('key', 'blog_settings')
    .single();
  if (!data?.value) return { openai: null, unsplash: null };
  try {
    const settings = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
    return {
      openai: settings?.openai_api_key || null,
      unsplash: settings?.unsplash_access_key || null,
    };
  } catch {
    return { openai: null, unsplash: null };
  }
}

/**
 * POST /api/admin/blog/generate-image
 * Erzeugt ein Titelbild: erst DALL-E 3, bei Fehler automatisch Unsplash.
 *
 * Body: { prompt: string, title?: string, keywords?: string }
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { prompt, title, keywords } = body;

  if (!prompt) {
    return NextResponse.json({ error: 'Bild-Prompt ist erforderlich.' }, { status: 400 });
  }

  const { openai, unsplash } = await getKeys();
  if (!openai && !unsplash) {
    return NextResponse.json(
      { error: 'Weder OpenAI- noch Unsplash-Key konfiguriert. Bitte unter Blog → Einstellungen hinterlegen.' },
      { status: 400 },
    );
  }

  try {
    const result = await generateBlogImageWithFallback({
      openaiKey: openai,
      unsplashKey: unsplash,
      prompt,
      title,
      keywords,
    });
    return NextResponse.json({
      url: result.url,
      alt: result.alt,
      prompt,
      source: result.source,
      warning: result.warning ?? null,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unbekannter Fehler';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
