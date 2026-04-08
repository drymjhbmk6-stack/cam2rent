import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import Anthropic from '@anthropic-ai/sdk';

async function getApiKey(): Promise<string | null> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('admin_settings').select('value').eq('key', 'blog_settings').single();
  if (!data?.value) return null;
  const settings = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
  return settings?.anthropic_api_key || null;
}

const REVIEW_PASSES = [
  {
    role: 'Faktenpruefer',
    instruction: `Du bist ein investigativer Faktenpruefer. Pruefe den Artikel KRITISCH auf:

1. ERFUNDENE FAKTEN: Gibt es konkrete Zahlen, Specs, Preise oder Aussagen die nicht stimmen koennten?
   - Erfundene Kamera-Specs (Aufloesungen, Akkulaufzeiten, Sensoren die es nicht gibt)
   - Falsche Preisangaben
   - Nicht existierende Features oder Technologien
   - Erfundene Vergleichsergebnisse oder Testergebnisse

2. UNBELEGBARE BEHAUPTUNGEN: Gibt es Aussagen wie "laut Tests", "Studien zeigen", "Experten sagen" ohne Quelle?

3. VERALTETE INFORMATIONEN: Werden Produkte oder Features erwaehnt die es nicht mehr gibt oder die veraltet sind?

Fuer JEDES Problem: Beschreibe es und schlage eine korrigierte Version vor.
Falls keine Probleme: Bestatige dass der Artikel faktisch korrekt ist.`,
  },
  {
    role: 'Qualitaetsredakteur',
    instruction: `Du bist ein erfahrener Qualitaetsredakteur. Pruefe den Artikel auf:

1. MARKETING-LUEGEN: Uebertriebene Superlative ("die beste Kamera aller Zeiten", "revolutionaer", "perfekt")
2. FALSCHE VERSPRECHEN: Werden Dinge versprochen die cam2rent nicht halten kann?
3. WIDERSPRUECHE: Widerspricht sich der Artikel an irgendeiner Stelle selbst?
4. TONE: Klingt der Text an einer Stelle zu werblich, zu KI-haft oder unnatuerlich?
5. HAFTUNG: Wird irgendwo "Versicherung" statt "Haftungsschutz" verwendet?

Korrigiere alle Probleme direkt im Text. Kuerze uebertriebene Aussagen auf ehrliche, nachvollziehbare Formulierungen.`,
  },
  {
    role: 'Chefredakteur',
    instruction: `Du bist der Chefredakteur und gibst die finale Freigabe. Letzter Check:

1. Wuerdest du diesen Artikel mit deinem Namen veroeffentlichen?
2. Gibt es IRGENDEINE Stelle die peinlich sein koennte oder Vertrauen zerstoert?
3. Sind alle Empfehlungen ehrlich und nachvollziehbar?
4. Stimmt die Struktur? Ist der Artikel rund?

Wenn alles passt, gib den finalen Text zurueck ohne Aenderungen.
Wenn nicht, korrigiere die letzten Details.

WICHTIG: Gib am Ende eine kurze Bewertung ab:
- FREIGABE: JA oder NEIN
- AENDERUNGEN: Kurze Liste was geaendert wurde (oder "Keine")
- QUALITAET: 1-10 (10 = perfekt)`,
  },
];

/**
 * POST /api/admin/blog/factcheck
 * Body: { content: string, title: string }
 * Fuehrt 3 Review-Durchgaenge durch und gibt den bereinigten Text zurueck
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { content, title } = body;

  if (!content) {
    return NextResponse.json({ error: 'Content ist erforderlich.' }, { status: 400 });
  }

  const apiKey = await getApiKey();
  if (!apiKey) {
    return NextResponse.json({ error: 'Anthropic API Key nicht konfiguriert.' }, { status: 400 });
  }

  const client = new Anthropic({ apiKey });
  let currentContent = content;
  const reviewLog: { pass: number; role: string; changes: string }[] = [];

  for (let i = 0; i < REVIEW_PASSES.length; i++) {
    const pass = REVIEW_PASSES[i];

    try {
      const message = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: `${pass.instruction}

WICHTIG: Antworte im JSON-Format:
{
  "correctedContent": "Der korrigierte Artikel in Markdown (oder der unveraenderte Text wenn keine Korrekturen noetig)",
  "changes": "Kurze Beschreibung was geaendert wurde (oder 'Keine Aenderungen noetig')",
  "issues": ["Problem 1", "Problem 2"] oder [],
  "approved": true/false,
  "quality": 8
}`,
        messages: [{
          role: 'user',
          content: `Pruefe diesen Blog-Artikel fuer cam2rent.de (Action-Cam Verleih):

TITEL: ${title}

INHALT:
${currentContent}`,
        }],
      });

      const text = message.content[0].type === 'text' ? message.content[0].text : '';
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        const match = text.match(/\{[\s\S]*\}/);
        if (match) parsed = JSON.parse(match[0]);
        else {
          reviewLog.push({ pass: i + 1, role: pass.role, changes: 'Antwort konnte nicht geparst werden' });
          continue;
        }
      }

      if (parsed.correctedContent) {
        currentContent = parsed.correctedContent;
      }

      reviewLog.push({
        pass: i + 1,
        role: pass.role,
        changes: parsed.changes || 'Keine Details',
      });

      // Bei letztem Durchgang: Qualitaetsbewertung zurueckgeben
      if (i === REVIEW_PASSES.length - 1) {
        return NextResponse.json({
          content: currentContent,
          approved: parsed.approved ?? true,
          quality: parsed.quality ?? 0,
          issues: parsed.issues ?? [],
          reviewLog,
        });
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Unbekannter Fehler';
      reviewLog.push({ pass: i + 1, role: pass.role, changes: `Fehler: ${errMsg}` });
    }
  }

  return NextResponse.json({
    content: currentContent,
    approved: true,
    quality: 0,
    issues: [],
    reviewLog,
  });
}
