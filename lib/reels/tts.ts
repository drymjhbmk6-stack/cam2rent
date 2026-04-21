/**
 * Text-to-Speech fuer Reels — OpenAI TTS.
 *
 * Nutzt den vorhandenen OpenAI-API-Key aus admin_settings.blog_settings.
 * Voice-Modelle: 'alloy' | 'echo' | 'fable' | 'nova' | 'onyx' | 'shimmer'
 *
 * Kosten (Stand 2026): tts-1 = $15 / 1M Zeichen. Ein Reel braucht
 * typisch 150-300 Zeichen → ~0.003-0.006 $ pro Reel. tts-1-hd kostet
 * $30 / 1M — doppelt so teuer, aber besserer Klang.
 *
 * Output: MP3-Buffer. FFmpeg kann MP3 direkt als Audio-Track einlesen.
 */

import OpenAI from 'openai';
import { createServiceClient } from '@/lib/supabase';

export type TTSVoice = 'alloy' | 'echo' | 'fable' | 'nova' | 'onyx' | 'shimmer';
export type TTSModel = 'tts-1' | 'tts-1-hd';
export type TTSStyle = 'calm' | 'normal' | 'energetic';

/**
 * Mapping Style → Speed-Faktor (OpenAI TTS akzeptiert 0.25–4.0).
 *  - calm:      langsamer, ruhiger Ton
 *  - normal:    leicht ueber Normal (1.05) — Standard fuer Reels
 *  - energetic: schneller (1.15) — wirkt enthusiastischer
 */
export const STYLE_SPEED: Record<TTSStyle, number> = {
  calm: 0.95,
  normal: 1.05,
  energetic: 1.15,
};

/**
 * Normalisiert Markennamen vor dem TTS-Call, damit OpenAI die richtige
 * Aussprache trifft. "cam2rent" wuerde im deutschen TTS-Kontext sonst
 * zu "cam zwei rent" (die 2 als Zahlwort gesprochen).
 *
 * Phonetische Schreibung "cam to rent" → wird in beiden Sprachen
 * korrekt englisch ausgesprochen.
 */
function normalizeForSpeech(text: string): string {
  return text
    // Domain mit ".de" → "punkt D E" (klingt natuerlicher als "punkt de")
    .replace(/\bcam2rent\.de\b/gi, 'cam to rent punkt D E')
    // Markenname allein → "cam to rent"
    .replace(/\bcam2rent\b/gi, 'cam to rent');
}

async function getOpenAIKey(): Promise<string> {
  const supabase = createServiceClient();
  const { data } = await supabase.from('admin_settings').select('value').eq('key', 'blog_settings').maybeSingle();
  if (!data?.value) throw new Error('OpenAI API Key fehlt (Blog → Einstellungen).');

  let settings: { openai_api_key?: string };
  try {
    settings = typeof data.value === 'string' ? JSON.parse(data.value) : (data.value as { openai_api_key?: string });
  } catch {
    throw new Error('OpenAI API Key: blog_settings-JSON kaputt');
  }
  const key = settings.openai_api_key?.trim();
  if (!key) throw new Error('OpenAI API Key leer in blog_settings.openai_api_key.');
  return key;
}

export interface GenerateSpeechOptions {
  voice?: TTSVoice;           // Default: 'nova' (weiblich, jung, natuerlich)
  model?: TTSModel;           // Default: 'tts-1' (guenstiger)
  speed?: number;             // 0.25–4.0, Default 1.05 (Reels sind flott)
}

/**
 * Erzeugt MP3-Audio aus Text. Wirft bei API-Fehler.
 */
export async function generateSpeech(text: string, opts: GenerateSpeechOptions = {}): Promise<Buffer> {
  const apiKey = await getOpenAIKey();
  const client = new OpenAI({ apiKey });

  const normalized = normalizeForSpeech(text);

  const response = await client.audio.speech.create({
    model: opts.model ?? 'tts-1',
    voice: opts.voice ?? 'nova',
    input: normalized.slice(0, 4000), // OpenAI-Limit: 4096 Zeichen
    speed: opts.speed ?? 1.05,
    response_format: 'mp3',
  });

  return Buffer.from(await response.arrayBuffer());
}
