import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import OpenAI from 'openai';

async function getOpenAIKey(): Promise<string | null> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('admin_settings')
    .select('value')
    .eq('key', 'blog_settings')
    .single();
  if (!data?.value) return null;
  try {
    const settings = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
    return settings?.openai_api_key || null;
  } catch {
    return null;
  }
}

/**
 * POST /api/admin/blog/generate-image
 * Generiert ein Titelbild mit DALL-E 3 und speichert es in Supabase Storage.
 *
 * Body: { prompt: string, title?: string }
 * - prompt: Bild-Prompt (von Claude generiert oder manuell)
 * - title: Artikel-Titel für den Alt-Text
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { prompt, title } = body;

  if (!prompt) {
    return NextResponse.json({ error: 'Bild-Prompt ist erforderlich.' }, { status: 400 });
  }

  const apiKey = await getOpenAIKey();
  if (!apiKey) {
    return NextResponse.json(
      { error: 'OpenAI API Key nicht konfiguriert. Bitte unter Blog → Einstellungen hinterlegen.' },
      { status: 400 },
    );
  }

  try {
    const client = new OpenAI({ apiKey });

    const response = await client.images.generate({
      model: 'dall-e-3',
      prompt,
      n: 1,
      size: '1792x1024', // Landscape für Blog-Header
      quality: 'hd',
      style: 'natural', // Fotorealistisch statt künstlerisch
    });

    const imageUrl = response.data?.[0]?.url;
    if (!imageUrl) {
      return NextResponse.json({ error: 'Kein Bild generiert.' }, { status: 500 });
    }

    // Bild herunterladen
    const imageRes = await fetch(imageUrl);
    if (!imageRes.ok) {
      return NextResponse.json({ error: 'Generiertes Bild konnte nicht heruntergeladen werden.' }, { status: 500 });
    }

    const buffer = Buffer.from(await imageRes.arrayBuffer());
    const filename = `blog-ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;

    // In Supabase Storage hochladen
    const supabase = createServiceClient();
    const { error: uploadError } = await supabase.storage
      .from('blog-images')
      .upload(filename, buffer, { contentType: 'image/png', upsert: false });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { data: urlData } = supabase.storage
      .from('blog-images')
      .getPublicUrl(filename);

    return NextResponse.json({
      url: urlData.publicUrl,
      alt: title || 'KI-generiertes Titelbild',
      prompt,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unbekannter Fehler';
    return NextResponse.json({ error: `Bild-Generierung fehlgeschlagen: ${message}` }, { status: 500 });
  }
}
