/**
 * POST /api/admin/reels/voice-preview
 *
 * Erzeugt eine kurze MP3-Audio-Vorschau einer TTS-Stimme, damit der Admin
 * vor dem Reel-Render hören kann, wie die gewählte Kombi aus voice/style/model
 * klingt.
 *
 * Body: { voice, style, model, text? }
 * Response: audio/mpeg Blob (MP3, ~1-3 Sekunden Sample-Text)
 *
 * Rate-Limit: 10 Calls / Minute pro IP, weil jeder Call OpenAI-Geld kostet
 * (~0,003 € pro Sample bei tts-1-hd). Verhindert versehentliche Doppelklick-
 * Spirals und absichtlichen Missbrauch.
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkAdminAuth } from '@/lib/admin-auth';
import { generateSpeech, STYLE_SPEED, type TTSVoice, type TTSModel, type TTSStyle } from '@/lib/reels/tts';
import { rateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const maxDuration = 30;

const ALLOWED_VOICES: TTSVoice[] = ['alloy', 'echo', 'fable', 'nova', 'onyx', 'shimmer'];
const ALLOWED_MODELS: TTSModel[] = ['tts-1', 'tts-1-hd'];
const ALLOWED_STYLES: TTSStyle[] = ['calm', 'normal', 'energetic'];

const DEFAULT_SAMPLE = 'Hey, schau mal — die GoPro Hero 13 für dein nächstes Abenteuer. Action, Wasser, Outdoor. Mieten auf cam2rent.de.';

const limiter = rateLimit({ maxAttempts: 10, windowMs: 60_000 });

export async function POST(req: NextRequest) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const rl = limiter.check(`voice-preview:${ip}`);
  if (!rl.success) {
    return NextResponse.json({ error: 'Rate-Limit erreicht — bitte 1 Minute warten.' }, { status: 429 });
  }

  let body: { voice?: string; style?: string; model?: string; text?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const voice = ALLOWED_VOICES.includes(body.voice as TTSVoice) ? (body.voice as TTSVoice) : 'nova';
  const model = ALLOWED_MODELS.includes(body.model as TTSModel) ? (body.model as TTSModel) : 'tts-1-hd';
  const style = ALLOWED_STYLES.includes(body.style as TTSStyle) ? (body.style as TTSStyle) : 'normal';

  // Cap auf 200 Zeichen — länger braucht keine Vorschau, schützt vor Kosten-Spam
  const text = (body.text?.trim() || DEFAULT_SAMPLE).slice(0, 200);

  try {
    const audio = await generateSpeech(text, {
      voice,
      model,
      speed: STYLE_SPEED[style],
    });
    return new NextResponse(new Uint8Array(audio), {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': audio.length.toString(),
        'Cache-Control': 'private, max-age=300',
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'TTS-Fehler';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
