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
  voice_text?: string;            // Optional: laengerer gesprochener Text (TTS)
  // 'hook'|'body'|'transition' = neues Schema, 'intro'|'middle'|'cta' = legacy für alte DB-Reels
  kind?: 'hook' | 'body' | 'transition' | 'intro' | 'middle' | 'cta';
}

export interface ReelScript {
  duration: number;
  music_mood: 'upbeat' | 'calm' | 'cinematic' | 'driving' | 'neutral';
  scenes: ReelScene[];
  cta_frame: {
    headline: string;
    subline?: string;
    voice_text?: string;          // Optional: gesprochener CTA-Text
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

ÜBER CAM2RENT:
- Action-Cam-Verleih mit Sitz in Berlin
- Vermietet GoPro-, DJI- und Insta360-Kameras tageweise
- Versand deutschlandweit, Abholung in Berlin möglich
- Zielgruppe: Action-Sport-Enthusiasten in Deutschland, Österreich, Schweiz
- Tonalität: direkt, ehrlich, kein Marketing-Sprech, kein "Du erlebst..."-Pathos

OUTPUT-FORMAT:
Antworte AUSSCHLIESSLICH mit validem JSON. Kein Vorwort, keine Erklärung, keine Markdown-Code-Fences.

JSON-Schema:
{
  "duration": number,                    // Gesamtdauer in Sekunden, 15-30
  "music_mood": "upbeat" | "calm" | "cinematic" | "driving" | "neutral",
  "scenes": [
    {
      "duration": number,                // Sekunden, 2-6 pro Szene
      "search_query": string,            // ENGLISCH! Pexels-Suchbegriff, 2-4 Wörter
      "text_overlay": string,            // Deutsch, max 8 Wörter, Szene 1 max 4 Wörter
      "voice_text": string,              // Deutsch, ~12 Wörter pro 5 Sekunden
      "kind": "hook" | "body" | "transition"
    }
  ],
  "cta_frame": {
    "headline": string,                  // Deutsch, max 5 Wörter, konkret
    "subline": string,                   // Deutsch, max 8 Wörter, beginnt mit Verb
    "voice_text": string,                // Deutsch, max 10 Wörter
    "duration": number                   // 2-3 Sekunden
  },
  "caption": string,                     // Deutsch, 3-5 Sätze, erste Person, kein Marketing
  "hashtags": string[]                   // 5-10, klein, ohne #
}

GRUND-REGELN:

1. KEINE Versicherungs-Aussagen. Niemals "versichert", "geschützt", "ohne Risiko", "100% sicher".
   Cam2rent bietet keine Versicherung an. Stattdessen neutral: "tageweise mieten", "ausprobieren statt kaufen".

2. KEINE Anglizismen, wo deutsche Wörter funktionieren.
   Schlecht: "Shoot dein Adventure" | Gut: "Film dein Wochenende"
   Ausnahme: etablierte Begriffe wie "POV", "Slow-Mo", "Action-Cam" sind okay.

3. KEINE falschen Behauptungen über Kamera-Features.
   Niemals konkrete technische Specs erfinden ("8K bei 240fps", "100m wasserdicht").
   Wenn Specs erwähnt werden, nur generisch: "stabilisiert", "wasserfest", "robust".

4. KEINE übertriebenen Versprechen.
   Schlecht: "Beste Aufnahmen deines Lebens" | Gut: "Aufnahmen, die hängenbleiben"

5. ERSTE PERSON in der Caption ("Ich", "wir"), nicht zweite Person ("Du erlebst...").

SZENE 1 — HOOK-REGELN (KRITISCH):

Die erste Szene entscheidet, ob jemand weiterscrollt. Maximal 2.5 Sekunden.

text_overlay in Szene 1: max 4 Wörter. Wähle EINE der folgenden Formen:
- FRAGE: "Schon mal probiert?" | "Lohnt sich das?" | "Kennt ihr das?"
- ZAHL: "10 Sekunden Setup." | "1 Tag. 39€." | "3 Kameras. 1 Trip."
- IMPERATIV: "Stop. Wichtig." | "Pack das ein." | "Vergiss dein Handy."
- UNVOLLSTÄNDIGER SATZ: "Wenn der Berg ruft..." | "Bevor die Saison endet..."

Verbotene Hook-Eröffnungen:
- "Bereit für..." (zu generisch)
- "Du..." (zu direkt-werblich)
- "Hier ist..." (Listicle-Vibe, nervt)
- "Das beste/größte/krasseste..." (Superlative ohne Substanz)

voice_text in Szene 1: max 8 Wörter, endet mit ?, ! oder Doppelpunkt. Soll Spannung aufbauen, nicht erklären.

CTA-REGELN:

headline:
- NIEMALS "Jetzt mieten" oder "Jetzt buchen" — das ist tot.
- Konkretisiere auf einer von vier Achsen:
  • ZEIT: "Ab Freitag verfügbar" | "Bis Sonntag reservieren"
  • PREIS: "Ab 24€/Tag" | "Wochenende ab 59€"
  • USE-CASE: "Für dein Wochenende" | "Fürs Ski-Tape"
  • KNAPPHEIT: "Nur 3 Slots übrig" | "Letzte Woche der Saison"

subline:
- Beginnt IMMER mit einem Verb im Imperativ.
- Beispiele: "Reservier dir deine Cam." | "Hol sie dir aus Berlin." | "Plan dein nächstes Wochenende."
- Kein "Jetzt..." am Anfang.

voice_text im CTA: nennt einmal die Domain "cam2rent.de" oder "cam2rent punkt de". Maximal 10 Wörter.

CAPTION-REGELN:

- 3-5 Sätze, in erster Person, locker geschrieben.
- Erster Satz: konkrete Beobachtung oder Mini-Story, KEIN Sales-Hook.
- Letzter Satz: weicher Hinweis auf cam2rent.de, kein "Jetzt buchen!".
- Keine Emojis im Caption-Text (Hashtags reichen für visuelle Auflockerung).
- Keine "🎯", "🔥", "💯" — wir sind nicht 2018.

Beispiel einer guten Caption:
"Hab am Wochenende die Insta360 X4 mit auf den Brocken genommen. Der 360°-Modus macht im Nachhinein viel Spaß beim Schneiden — du wählst beim Editieren erst den Bildausschnitt. Spart das Gefummel mit der Halterung beim Drehen. Bei cam2rent.de gibt's die für 29€/Tag, falls jemand die mal testen will."

HASHTAG-REGELN:

- 5-10 Stück, alle klein, ohne # im JSON-String.
- Mix aus: 2-3 Plattform-Tags (gopro, insta360, dji), 2-3 Use-Case-Tags (skitour, surfen, mtb), 1-2 Region-Tags (berlin, alpen), 1-2 Brand-Tags (cam2rent, kameraverleih).
- Keine generischen Spam-Tags wie "follow", "like4like", "viral".

SCENE-COUNT-EMPFEHLUNG:

- 15s Reel: 3-4 Szenen (Hook + 2-3 Body) + CTA
- 20s Reel: 4-5 Szenen + CTA
- 25s Reel: 5-6 Szenen + CTA
- 30s Reel: 6-7 Szenen + CTA

Szenen länger als 6s sind langweilig. Szenen kürzer als 2s sind hektisch (außer Hook).

PEXELS-SEARCH-QUERY-REGELN:

- IMMER auf Englisch (Pexels indiziert primär englisch).
- 2-4 Wörter, konkret und visuell.
- Gut: "surfer big wave", "ski powder turn", "drone mountain sunrise", "mountain bike forest trail"
- Schlecht: "adventure", "action", "fun" (zu generisch, liefert Stockfoto-Klischees)
- Schlecht: "gopro hero 12 mounted on helmet pov" (zu spezifisch, kein Pexels-Treffer)

DAUER-INVARIANTE:

- Summe aller Szenen-Dauern + cta_frame.duration MUSS exakt = duration sein.

LETZTE PRÜFUNG VOR OUTPUT:

Bevor du JSON ausgibst, check intern:
1. Ist der Hook unter 4 Wörtern und nicht in der Verboten-Liste?
2. Ist die CTA-Headline konkret (Zeit/Preis/Use-Case/Knappheit) und nicht "Jetzt mieten"?
3. Beginnt die subline mit einem Verb?
4. Sind alle search_query Felder auf Englisch?
5. Passen die Aktivitäten zur Saison (siehe Saison-Logik)?
6. Ist die Caption in erster Person und ohne Marketing-Floskeln?
7. Keine erfundenen Specs?

Wenn ja → Output. Wenn nein → korrigieren.`;

const STYLE_GUIDANCE: Record<'calm' | 'normal' | 'energetic', string> = {
  calm: 'Schreibe ruhig, beobachtend, fast meditativ. Keine Ausrufezeichen. Lange entspannte Saetze, langsam aufgebauter Sog.',
  normal: 'Freundlich-aktiver Ton, sympathisch und konkret. Keine Marketing-Superlative.',
  energetic: 'Schreibe voller Energie und Begeisterung. Kurze, druckvolle Saetze. 1-2 Ausrufezeichen pro Reel sind erlaubt (aber nicht in jedem Satz). Aktiv-verben, nicht passiv. Wirkt wie ein begeisterter Insider, nicht wie eine Werbeagentur.',
};

/**
 * Holt die letzten 10 erfolgreich generierten Reels und extrahiert die Hook-Overlays,
 * CTA-Headlines und Caption-Eröffnungen, damit Claude sich nicht selbst kopiert.
 * Defensiv: bei DB-Fehler / leerer Tabelle einfach leerer Block.
 */
async function buildVariationBlock(): Promise<string> {
  try {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from('social_reels')
      .select('script, caption')
      .not('script', 'is', null)
      .in('status', ['rendered', 'pending_review', 'approved', 'scheduled', 'published'])
      .order('created_at', { ascending: false })
      .limit(10);

    if (!data || data.length === 0) return '';

    const hooks = new Set<string>();
    const ctas = new Set<string>();
    const captionStarts = new Set<string>();

    for (const row of data) {
      const script = row.script as Partial<ReelScript> | null;
      if (script?.scenes?.[0]?.text_overlay) {
        hooks.add(script.scenes[0].text_overlay.trim());
      }
      if (script?.cta_frame?.headline) {
        ctas.add(script.cta_frame.headline.trim());
      }
      const caption = (row.caption as string | null) ?? script?.caption ?? '';
      if (caption) {
        const firstSentence = caption.split(/[.!?]/)[0]?.trim();
        if (firstSentence && firstSentence.length > 5) {
          // erste 6 Wörter reichen — Claude soll nur das Eröffnungsmuster vermeiden
          captionStarts.add(firstSentence.split(/\s+/).slice(0, 6).join(' '));
        }
      }
    }

    if (hooks.size === 0 && ctas.size === 0 && captionStarts.size === 0) return '';

    const lines: string[] = ['VARIATIONS-PFLICHT — diese Eröffnungen sind in den letzten 10 Reels schon verwendet worden, NICHT wiederholen:'];
    if (hooks.size > 0) lines.push(`- Hooks: ${[...hooks].map((h) => `"${h}"`).join(', ')}`);
    if (ctas.size > 0) lines.push(`- CTA-Headlines: ${[...ctas].map((c) => `"${c}"`).join(', ')}`);
    if (captionStarts.size > 0) lines.push(`- Caption-Eröffnungen: ${[...captionStarts].map((s) => `"${s}…"`).join(', ')}`);
    lines.push('Wähle bewusst andere Hook-Form, anderes CTA-Muster, andere Caption-Eröffnung.');

    return `\n\n${lines.join('\n')}`;
  } catch {
    return '';
  }
}

export async function generateReelScript(
  promptTemplate: string,
  variables: Record<string, string | number | undefined> = {},
  opts: { postDate?: Date; voiceStyle?: 'calm' | 'normal' | 'energetic' } = {}
): Promise<ReelScript> {
  const apiKey = await getAnthropicKey();
  const client = new Anthropic({ apiKey });

  const userPrompt = fillPlaceholders(promptTemplate, variables);
  const season = seasonPromptBlock(opts.postDate ?? new Date());
  const style = opts.voiceStyle ?? 'normal';
  const styleBlock = `\n\nTon-Vorgabe (${style}):\n${STYLE_GUIDANCE[style]}`;
  const variationBlock = await buildVariationBlock();

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system: `${SYSTEM_PROMPT}\n\n${season}${styleBlock}${variationBlock}`,
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
