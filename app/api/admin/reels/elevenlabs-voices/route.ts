/**
 * GET/POST /api/admin/reels/elevenlabs-voices
 *
 * Holt die Stimmen-Liste vom ElevenLabs-Account des Users.
 *
 * - GET (ohne Override): liest gespeicherten Key aus reels_settings.
 * - POST mit Body { apiKey } (Sweep 8 M5): Override fuer Test vor dem Speichern.
 *   Vorher GET ?api_key=... — der Key landete in Hetzner/Coolify-Access-Logs.
 *
 * Response: { voices: [{ voice_id, name, category, labels, preview_url }] }
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkAdminAuth } from '@/lib/admin-auth';
import { createServiceClient } from '@/lib/supabase';

export const runtime = 'nodejs';

interface ElevenLabsVoice {
  voice_id: string;
  name: string;
  category?: string;
  labels?: Record<string, string>;
  preview_url?: string;
  description?: string;
}

async function getApiKey(): Promise<string> {
  const supabase = createServiceClient();
  const { data } = await supabase.from('admin_settings').select('value').eq('key', 'reels_settings').maybeSingle();
  if (!data?.value) return '';
  try {
    const parsed = typeof data.value === 'string' ? JSON.parse(data.value) : (data.value as { elevenlabs_api_key?: string });
    return (parsed?.elevenlabs_api_key ?? '').trim();
  } catch {
    return '';
  }
}

async function loadVoices(apiKey: string) {
  if (!apiKey) {
    return NextResponse.json({ error: 'ElevenLabs API Key fehlt — bitte zuerst eintragen und speichern.' }, { status: 400 });
  }
  try {
    const res = await fetch('https://api.elevenlabs.io/v1/voices', {
      headers: { 'xi-api-key': apiKey, Accept: 'application/json' },
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return NextResponse.json({ error: `ElevenLabs ${res.status}: ${errText.slice(0, 200) || 'Fehler'}` }, { status: 502 });
    }
    const body = await res.json();
    const voices: ElevenLabsVoice[] = Array.isArray(body?.voices) ? body.voices : [];
    const slim = voices.map((v) => ({
      voice_id: v.voice_id,
      name: v.name,
      category: v.category ?? null,
      labels: v.labels ?? null,
      preview_url: v.preview_url ?? null,
      description: v.description ?? null,
    }));
    return NextResponse.json({ voices: slim });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Netzwerk-Fehler' }, { status: 500 });
  }
}

export async function GET() {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return loadVoices(await getApiKey());
}

export async function POST(req: NextRequest) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const overrideKey = typeof body?.apiKey === 'string' ? body.apiKey.trim() : '';
  return loadVoices(overrideKey || (await getApiKey()));
}
