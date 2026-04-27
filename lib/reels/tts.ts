/**
 * Text-to-Speech fuer Reels — unterstuetzt zwei Provider:
 *
 *  • OpenAI (Default, billig): tts-1 / tts-1-hd, 6 Stimmen, ~0.003-0.006 $/Reel.
 *  • ElevenLabs (deutlich natuerlicher fuer Deutsch, aber teurer):
 *    eleven_multilingual_v2, beliebige Voice-IDs, ~0.05-0.15 $/Reel je nach Plan.
 *
 * Der Provider wird ueber `admin_settings.reels_settings.voice_provider`
 * konfiguriert und an `generateSpeechFromSettings` weitergereicht — bzw.
 * direkt in `generateSpeechOpenAI` / `generateSpeechElevenLabs` aufgerufen.
 *
 * Output: MP3-Buffer. FFmpeg kann MP3 direkt als Audio-Track einlesen.
 */

import OpenAI from 'openai';
import { createServiceClient } from '@/lib/supabase';

export type TTSProvider = 'openai' | 'elevenlabs';

// OpenAI-spezifisch
export type TTSVoice = 'alloy' | 'echo' | 'fable' | 'nova' | 'onyx' | 'shimmer';
export type TTSModel = 'tts-1' | 'tts-1-hd';
export type TTSStyle = 'calm' | 'normal' | 'energetic';

// ElevenLabs-spezifisch
export type ElevenLabsModel =
  | 'eleven_multilingual_v2'
  | 'eleven_turbo_v2_5'
  | 'eleven_flash_v2_5';

export interface ElevenLabsVoiceSettings {
  stability?: number;       // 0.0-1.0, Default 0.5
  similarity_boost?: number; // 0.0-1.0, Default 0.75
  style?: number;            // 0.0-1.0, Default 0.0 (nur v2-Multilingual)
  use_speaker_boost?: boolean; // Default true
}

/**
 * Mapping Style → Speed-Faktor (OpenAI TTS akzeptiert 0.25–4.0).
 *  - calm:      langsamer, ruhiger Ton
 *  - normal:    leicht ueber Normal (1.05) — Standard fuer Reels
 *  - energetic: schneller (1.15) — wirkt enthusiastischer
 *
 * ElevenLabs hat keinen direkten Speed-Parameter — der Style wird ueber
 * stability/style-Werte modelliert (siehe styleToElevenLabsSettings).
 */
export const STYLE_SPEED: Record<TTSStyle, number> = {
  calm: 0.95,
  normal: 1.05,
  energetic: 1.15,
};

/**
 * Style → ElevenLabs voice_settings. Wir mappen unsere 3 Stile auf
 * sinnvolle Default-Kombis. Der User kann die Werte im UI ueberschreiben.
 */
export function styleToElevenLabsSettings(style: TTSStyle): ElevenLabsVoiceSettings {
  switch (style) {
    case 'calm':
      return { stability: 0.7, similarity_boost: 0.75, style: 0.0, use_speaker_boost: true };
    case 'energetic':
      return { stability: 0.35, similarity_boost: 0.75, style: 0.4, use_speaker_boost: true };
    case 'normal':
    default:
      return { stability: 0.5, similarity_boost: 0.75, style: 0.15, use_speaker_boost: true };
  }
}

/**
 * Normalisiert Markennamen vor dem TTS-Call. "cam2rent" wuerde sonst zu
 * "cam zwei rent" (Zahlwort). Phonetische Schreibung "cam to rent" wird
 * bei beiden Anbietern korrekt englisch ausgesprochen.
 */
function normalizeForSpeech(text: string): string {
  return text
    .replace(/\bcam2rent\.de\b/gi, 'cam to rent punkt D E')
    .replace(/\bcam2rent\b/gi, 'cam to rent');
}

interface ReelsSettingsSubset {
  voice_provider?: TTSProvider;
  voice_name?: TTSVoice;
  voice_model?: TTSModel;
  voice_style?: TTSStyle;
  elevenlabs_api_key?: string;
  elevenlabs_voice_id?: string;
  elevenlabs_model_id?: ElevenLabsModel;
  elevenlabs_stability?: number;
  elevenlabs_similarity_boost?: number;
  elevenlabs_style?: number;
  elevenlabs_speaker_boost?: boolean;
}

/** Liest blog_settings.openai_api_key (wir teilen den Key mit Blog/Bild-KI). */
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

/** Liest reels_settings.elevenlabs_api_key. */
async function getElevenLabsKey(): Promise<string> {
  const supabase = createServiceClient();
  const { data } = await supabase.from('admin_settings').select('value').eq('key', 'reels_settings').maybeSingle();
  if (!data?.value) throw new Error('ElevenLabs API Key fehlt — bitte unter Reels-Einstellungen hinterlegen.');

  let settings: ReelsSettingsSubset;
  try {
    settings = typeof data.value === 'string' ? JSON.parse(data.value) : (data.value as ReelsSettingsSubset);
  } catch {
    throw new Error('ElevenLabs API Key: reels_settings-JSON kaputt');
  }
  const key = settings.elevenlabs_api_key?.trim();
  if (!key) throw new Error('ElevenLabs API Key leer in reels_settings.elevenlabs_api_key.');
  return key;
}

export interface GenerateSpeechOpenAIOptions {
  voice?: TTSVoice;
  model?: TTSModel;
  speed?: number;
  apiKey?: string; // Override fuer Tests / Voice-Preview ohne DB-Roundtrip
}

/** OpenAI TTS — schnell + billig, mittelmaessige deutsche Aussprache. */
export async function generateSpeechOpenAI(text: string, opts: GenerateSpeechOpenAIOptions = {}): Promise<Buffer> {
  const apiKey = opts.apiKey ?? (await getOpenAIKey());
  const client = new OpenAI({ apiKey });
  const normalized = normalizeForSpeech(text);

  const response = await client.audio.speech.create({
    model: opts.model ?? 'tts-1-hd',
    voice: opts.voice ?? 'nova',
    input: normalized.slice(0, 4000),
    speed: opts.speed ?? 1.05,
    response_format: 'mp3',
  });

  return Buffer.from(await response.arrayBuffer());
}

/**
 * @deprecated Backward-Compat-Alias. Neue Aufrufer sollten
 * `generateSpeechOpenAI` oder `generateSpeechFromSettings` nutzen.
 */
export const generateSpeech = generateSpeechOpenAI;

export interface GenerateSpeechElevenLabsOptions {
  voiceId: string;
  modelId?: ElevenLabsModel;
  voiceSettings?: ElevenLabsVoiceSettings;
  apiKey?: string;
}

/** ElevenLabs TTS — natuerlicher fuer Deutsch, aber teurer. */
export async function generateSpeechElevenLabs(
  text: string,
  opts: GenerateSpeechElevenLabsOptions,
): Promise<Buffer> {
  if (!opts.voiceId?.trim()) {
    throw new Error('ElevenLabs voiceId fehlt — bitte in den Reels-Einstellungen waehlen.');
  }
  const apiKey = opts.apiKey ?? (await getElevenLabsKey());
  const normalized = normalizeForSpeech(text).slice(0, 5000);

  const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(opts.voiceId)}?output_format=mp3_44100_128`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text: normalized,
      model_id: opts.modelId ?? 'eleven_multilingual_v2',
      voice_settings: {
        stability: opts.voiceSettings?.stability ?? 0.5,
        similarity_boost: opts.voiceSettings?.similarity_boost ?? 0.75,
        style: opts.voiceSettings?.style ?? 0.15,
        use_speaker_boost: opts.voiceSettings?.use_speaker_boost ?? true,
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`ElevenLabs ${res.status}: ${errText.slice(0, 200) || 'Unbekannter Fehler'}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Provider-Switch — liest die Settings selber und ruft den passenden Provider.
 * Hauptaufrufer ist der Reel-Orchestrator, der dadurch nichts ueber Provider
 * wissen muss.
 */
export async function generateSpeechFromSettings(text: string, settings: ReelsSettingsSubset): Promise<Buffer> {
  const provider: TTSProvider = settings.voice_provider ?? 'openai';

  if (provider === 'elevenlabs') {
    if (!settings.elevenlabs_voice_id?.trim()) {
      throw new Error('ElevenLabs Voice-ID fehlt — bitte in den Reels-Einstellungen waehlen.');
    }
    const style: TTSStyle = settings.voice_style ?? 'normal';
    const styleDefaults = styleToElevenLabsSettings(style);
    return generateSpeechElevenLabs(text, {
      voiceId: settings.elevenlabs_voice_id,
      modelId: settings.elevenlabs_model_id ?? 'eleven_multilingual_v2',
      voiceSettings: {
        stability: settings.elevenlabs_stability ?? styleDefaults.stability,
        similarity_boost: settings.elevenlabs_similarity_boost ?? styleDefaults.similarity_boost,
        style: settings.elevenlabs_style ?? styleDefaults.style,
        use_speaker_boost: settings.elevenlabs_speaker_boost ?? styleDefaults.use_speaker_boost,
      },
    });
  }

  // OpenAI Default
  const style: TTSStyle = settings.voice_style ?? 'normal';
  return generateSpeechOpenAI(text, {
    voice: settings.voice_name ?? 'nova',
    model: settings.voice_model ?? 'tts-1-hd',
    speed: STYLE_SPEED[style],
  });
}
