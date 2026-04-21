/**
 * Claude-Skript-Generator für Reels.
 *
 * Nimmt ein Template (Prompt + Parameter) und produziert ein strukturiertes
 * JSON-Skript mit Szenen, Text-Overlays, Caption und Hashtags.
 *
 * API-Key aus admin_settings.blog_settings.anthropic_api_key (derselbe wie Blog/Social).
 */

import Anthropic from '@anthropic-ai/sdk';
import { createServiceClient } from '@/lib/supabase';
import { sanitizePromptInput } from '@/lib/prompt-sanitize';
import { seasonPromptBlock } from '@/lib/meta/season';

export interface ReelScene {
  duration: number;               // Sekunden
  search_query: string;           // Pexels-Suchbegriff (Englisch für bessere Treffer)
  text_overlay: string;           // Kurzer Text auf dem Clip (max 8 Worte)
  kind?: 'intro' | 'middle' | 'cta';
}

export interface ReelScript {
  duration: number;
  music_mood: 'upbeat' | 'calm' | 'cinematic' | 'driving' | 'neutral';
  scenes: ReelScene[];
  cta_frame: {
    headline: string;
    subline?: string;
    duration: number;
  };
  caption: string;
  hashtags: string[];
}

async function getAnthropicKey(): Promise<string> {
  const supabase = createServiceClient();
  const { data, error } = await supabase.from('admin_settings').select('value').eq('key', 'blog_settings').maybeSingle();

  if (error) {
    throw new Error(`Anthropic Key: DB-Fehler beim Lesen von admin_settings — ${error.message}`);
  }
  if (!data) {
    throw new Error('Anthropic Key: Zeile admin_settings.blog_settings fehlt. Blog → Einstellungen einmal speichern.');
  }
  if (data.value === null || data.value === undefined) {
    throw new Error('Anthropic Key: admin_settings.blog_settings.value ist NULL. Blog → Einstellungen einmal speichern.');
  }

  // value kann String (gespeichert via JSON.stringify) oder Object (jsonb nativ) sein
  let settings: { anthropic_api_key?: string };
  try {
    settings = typeof data.value === 'string' ? JSON.parse(data.value) : (data.value as { anthropic_api_key?: string });
  } catch (err) {
    throw new Error(`Anthropic Key: blog_settings-JSON kaputt — ${err instanceof Error ? err.message : 'Parse-Error'}`);
  }
  if (!settings || typeof settings !== 'object') {
    throw new Error(`Anthropic Key: blog_settings hat unerwarteten Typ ${typeof settings}`);
  }
  const key = settings.anthropic_api_key?.trim();
  if (!key) {
    const fieldsPresent = Object.keys(settings).join(', ') || '(leer)';
    throw new Error(`Anthropic Key: Feld "anthropic_api_key" fehlt oder leer. Vorhandene Felder: ${fieldsPresent}`);
  }
  return key;
}

function fillPlaceholders(template: string, vars: Record<string, string | number | undefined>): string {
  let out = template;
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined || v === null) continue;
    out = out.split(`{${k}}`).join(sanitizePromptInput(String(v)));
  }
  return out;
}

const SYSTEM_PROMPT = `Du schreibst Skripte für kurze Social-Media-Reels (vertikale 9:16-Videos, 15–30 Sekunden) für den Action-Cam-Verleih cam2rent.de.

Zielgruppe: Action-Sport-Enthusiasten in Deutschland/Österreich/Schweiz.

WICHTIG — du musst IMMER mit einem validen JSON-Objekt antworten, kein Markdown, keine Erklärungen drumherum. Struktur:

{
  "duration": 20,
  "music_mood": "upbeat|calm|cinematic|driving|neutral",
  "scenes": [
    { "duration": 2, "search_query": "englische pexels-suche", "text_overlay": "Kurzer DE-Text", "kind": "intro" },
    { "duration": 5, "search_query": "...", "text_overlay": "...", "kind": "middle" },
    { "duration": 5, "search_query": "...", "text_overlay": "...", "kind": "middle" },
    { "duration": 5, "search_query": "...", "text_overlay": "...", "kind": "middle" }
  ],
  "cta_frame": {
    "headline": "Kurzer CTA-Titel",
    "subline": "Optional: Preis/Detail",
    "duration": 3
  },
  "caption": "3–5 Sätze, erste Person, authentisch, kein Marketing-Sprech",
  "hashtags": ["actioncam", "cam2rent", "gopro"]
}

Regeln:
- Text-Overlays: maximal 8 Wörter, gut lesbar
- Search-Queries IMMER auf Englisch (bessere Pexels-Treffer), konkret ("mountain biking pov", nicht "outdoor sport")
- Summe aller Szenen-Dauern + CTA-Dauer = duration
- Ton deutsch, aber ohne Anglizismen wie "Game-Changer" oder Ausrufezeichen-Flut
- Keine Versicherungs-Wording (cam2rent ist kein Versicherer — sag "Haftungsschutz" falls relevant)
- Niemals behaupten dass eine Kamera etwas kann was sie nicht kann
- Hashtags: 5–10, klein geschrieben, ohne #-Zeichen im JSON`;

export async function generateReelScript(
  promptTemplate: string,
  variables: Record<string, string | number | undefined> = {},
  opts: { postDate?: Date } = {}
): Promise<ReelScript> {
  const apiKey = await getAnthropicKey();
  const client = new Anthropic({ apiKey });

  const userPrompt = fillPlaceholders(promptTemplate, variables);
  const season = seasonPromptBlock(opts.postDate ?? new Date());

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system: `${SYSTEM_PROMPT}\n\n${season}`,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('Claude hat kein Text-Response geliefert');
  }
  const raw = textBlock.text.trim();

  // JSON aus Response extrahieren (robust gegen Markdown-Code-Fences)
  const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/) ?? [null, raw];
  const jsonText = (jsonMatch[1] ?? raw).trim();

  let parsed: ReelScript;
  try {
    parsed = JSON.parse(jsonText);
  } catch (err) {
    throw new Error(`Claude-Response ist kein valides JSON: ${err instanceof Error ? err.message : 'Parse-Error'}\n\nResponse:\n${raw.slice(0, 500)}`);
  }

  // Sanity-Checks
  if (!Array.isArray(parsed.scenes) || parsed.scenes.length === 0) {
    throw new Error('Skript enthält keine Szenen');
  }
  if (!parsed.cta_frame || typeof parsed.cta_frame.headline !== 'string') {
    throw new Error('Skript enthält kein CTA-Frame');
  }
  parsed.hashtags = Array.isArray(parsed.hashtags) ? parsed.hashtags : [];
  parsed.caption = typeof parsed.caption === 'string' ? parsed.caption : '';
  parsed.music_mood = parsed.music_mood ?? 'neutral';

  // Duration reparieren falls Summe nicht passt
  const computed = parsed.scenes.reduce((s, sc) => s + (sc.duration || 0), 0) + (parsed.cta_frame.duration || 0);
  parsed.duration = computed;

  return parsed;
}
