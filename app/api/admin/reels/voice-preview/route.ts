/**
 * POST /api/admin/reels/voice-preview
 *
 * Erzeugt eine kurze MP3-Audio-Vorschau einer TTS-Stimme. Unterstuetzt
 * beide Provider:
 *
 *   • OpenAI: Body { provider: 'openai', voice, style, model, text? }
 *   • ElevenLabs: Body { provider: 'elevenlabs', voiceId, modelId?, style?,
 *                        stability?, similarity_boost?, style_weight?,
 *                        speaker_boost?, apiKey?, text? }
 *
 * Antwort: audio/mpeg (MP3-Buffer).
 *
 * Rate-Limit: 10/min pro IP — schuetzt vor Doppelklick-Spirals und
 * Missbrauch (OpenAI ~0.003 €/Sample, ElevenLabs ~0.05-0.15 € je nach Plan).
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkAdminAuth } from '@/lib/admin-auth';
import {
  generateSpeechOpenAI,
  generateSpeechElevenLabs,
  STYLE_SPEED,
  styleToElevenLabsSettings,
  type TTSVoice,
  type TTSModel,
  type TTSStyle,
  type TTSProvider,
  type ElevenLabsModel,
} from '@/lib/reels/tts';
import { rateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const maxDuration = 30;

const ALLOWED_VOICES: TTSVoice[] = ['alloy', 'echo', 'fable', 'nova', 'onyx', 'shimmer'];
const ALLOWED_OPENAI_MODELS: TTSModel[] = ['tts-1', 'tts-1-hd'];
const ALLOWED_ELEVENLABS_MODELS: ElevenLabsModel[] = ['eleven_multilingual_v2', 'eleven_turbo_v2_5', 'eleven_flash_v2_5'];
const ALLOWED_STYLES: TTSStyle[] = ['calm', 'normal', 'energetic'];
const ALLOWED_PROVIDERS: TTSProvider[] = ['openai', 'elevenlabs'];

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

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const provider = ALLOWED_PROVIDERS.includes(body.provider as TTSProvider)
    ? (body.provider as TTSProvider)
    : 'openai';
  const style = ALLOWED_STYLES.includes(body.style as TTSStyle) ? (body.style as TTSStyle) : 'normal';
  const text = ((body.text as string)?.trim() || DEFAULT_SAMPLE).slice(0, 250);

  try {
    let audio: Buffer;

    if (provider === 'elevenlabs') {
      const voiceId = (body.voiceId as string)?.trim();
      if (!voiceId) {
        return NextResponse.json({ error: 'voiceId ist Pflicht fuer ElevenLabs.' }, { status: 400 });
      }
      const modelId = ALLOWED_ELEVENLABS_MODELS.includes(body.modelId as ElevenLabsModel)
        ? (body.modelId as ElevenLabsModel)
        : 'eleven_multilingual_v2';
      const styleDefaults = styleToElevenLabsSettings(style);
      const apiKeyOverride = (body.apiKey as string)?.trim() || undefined;

      audio = await generateSpeechElevenLabs(text, {
        voiceId,
        modelId,
        apiKey: apiKeyOverride,
        voiceSettings: {
          stability: typeof body.stability === 'number' ? body.stability : styleDefaults.stability,
          similarity_boost: typeof body.similarity_boost === 'number' ? body.similarity_boost : styleDefaults.similarity_boost,
          style: typeof body.style_weight === 'number' ? body.style_weight : styleDefaults.style,
          use_speaker_boost: typeof body.speaker_boost === 'boolean' ? body.speaker_boost : styleDefaults.use_speaker_boost,
        },
      });
    } else {
      const voice = ALLOWED_VOICES.includes(body.voice as TTSVoice) ? (body.voice as TTSVoice) : 'nova';
      const model = ALLOWED_OPENAI_MODELS.includes(body.model as TTSModel) ? (body.model as TTSModel) : 'tts-1-hd';
      audio = await generateSpeechOpenAI(text, {
        voice,
        model,
        speed: STYLE_SPEED[style],
      });
    }

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
