import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';

export const runtime = 'nodejs';
export const maxDuration = 60;

/** GET /api/admin/reels/music — Liste aller Musik-Tracks */
export async function GET() {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('social_reel_music')
    .select('*')
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ tracks: data ?? [] });
}

/**
 * POST /api/admin/reels/music
 *
 * Zwei Modi:
 *  - JSON-Body { name, url, mood?, attribution?, source? }     → externe URL speichern
 *  - multipart/form-data mit file (MP3) + name                 → hochladen + DB-Eintrag
 */
export async function POST(req: NextRequest) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const contentType = req.headers.get('content-type') ?? '';
  const supabase = createServiceClient();

  if (contentType.includes('multipart/form-data')) {
    // Upload-Pfad
    const form = await req.formData();
    const file = form.get('file');
    const name = (form.get('name') as string | null)?.trim() || '';
    const mood = ((form.get('mood') as string | null) ?? '').trim() || null;
    const attribution = ((form.get('attribution') as string | null) ?? '').trim() || null;

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Datei fehlt (Feldname: file)' }, { status: 400 });
    }
    if (!name) {
      return NextResponse.json({ error: 'Name fehlt' }, { status: 400 });
    }
    if (file.size > 25 * 1024 * 1024) {
      return NextResponse.json({ error: 'Datei ueber 25 MB — bitte kleinere MP3 verwenden' }, { status: 400 });
    }
    const contentMime = file.type || 'audio/mpeg';
    if (!contentMime.startsWith('audio/') && !contentMime.includes('mp3') && !contentMime.includes('mpeg')) {
      return NextResponse.json({ error: `Ungueltiger MIME-Typ: ${contentMime}` }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const safeName = name.replace(/[^a-z0-9-_]+/gi, '-').toLowerCase();
    const storagePath = `music/${Date.now()}-${safeName}.mp3`;

    const { error: upErr } = await supabase.storage.from('social-reels').upload(storagePath, buffer, {
      contentType: 'audio/mpeg',
      upsert: false,
    });
    if (upErr) {
      return NextResponse.json({ error: `Upload fehlgeschlagen: ${upErr.message}` }, { status: 500 });
    }
    const { data: urlData } = supabase.storage.from('social-reels').getPublicUrl(storagePath);
    const publicUrl = urlData?.publicUrl;
    if (!publicUrl) {
      return NextResponse.json({ error: 'Public URL konnte nicht generiert werden' }, { status: 500 });
    }

    const { data, error } = await supabase
      .from('social_reel_music')
      .insert({ name, url: publicUrl, storage_path: storagePath, mood, attribution, source: 'upload' })
      .select('*')
      .single();
    if (error) {
      // Rollback Storage-File
      await supabase.storage.from('social-reels').remove([storagePath]).catch(() => {});
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ track: data }, { status: 201 });
  }

  // JSON-Pfad (externe URL)
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const url = typeof body.url === 'string' ? body.url.trim() : '';
  if (!name || !url) {
    return NextResponse.json({ error: 'name + url sind Pflicht' }, { status: 400 });
  }
  try {
    new URL(url);
  } catch {
    return NextResponse.json({ error: 'url ist keine gueltige URL' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('social_reel_music')
    .insert({
      name,
      url,
      mood: typeof body.mood === 'string' ? body.mood : null,
      attribution: typeof body.attribution === 'string' ? body.attribution : null,
      source: typeof body.source === 'string' ? body.source : 'url',
    })
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ track: data }, { status: 201 });
}
