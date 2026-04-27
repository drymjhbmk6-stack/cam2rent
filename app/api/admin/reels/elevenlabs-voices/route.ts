/**
 * GET /api/admin/reels/elevenlabs-voices
 *
 * Holt die Stimmen-Liste vom ElevenLabs-Account des Users. Bei kostenfreien
 * Plaenen sind das ~10 Default-Voices, in bezahlten Plaenen kommen
 * Eigen-Voices und der "Voice Library"-Pool dazu.
 *
 * Optional `?api_key=...` als Override (z.B. wenn der Admin den Key gerade
 * eintippt und vor dem Speichern testen will). Sonst wird der gespeicherte
 * Key aus reels_settings gelesen.
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

export async function GET(req: NextRequest) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const overrideKey = searchParams.get('api_key')?.trim();
  const apiKey = overrideKey || (await getApiKey());

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
    // Schlanker für UI: nur die Felder, die wir wirklich anzeigen
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
