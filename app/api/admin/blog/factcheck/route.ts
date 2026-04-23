import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import Anthropic from '@anthropic-ai/sdk';
import { sanitizePromptInput } from '@/lib/prompt-sanitize';

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
    role: 'Faktenprüfer',
    instruction: `Du bist ein investigativer Faktenprüfer. Prüfe den Artikel KRITISCH:

- Erfundene Kamera-Specs (Auflösungen, Akkulaufzeiten, Sensoren)? ENTFERNEN oder durch allgemeine Formulierungen ersetzen.
- Falsche Preisangaben? ENTFERNEN.
- Nicht existierende Features oder Technologien? ENTFERNEN.
- "Laut Tests", "Studien zeigen" ohne Quelle? ENTFERNEN.
- Veraltete Informationen? AKTUALISIEREN oder ENTFERNEN.

Gib den KOMPLETTEN korrigierten Artikel zurück. Nur den Artikeltext, keine Erklärungen.
Schreibe am ENDE nach einer Leerzeile "---CHANGES---" und dann eine kurze Liste der Änderungen.`,
  },
  {
    role: 'Qualitätsredakteur',
    instruction: `Du bist Qualitätsredakteur. Prüfe und korrigiere:

- Übertriebene Superlative ("die beste aller Zeiten", "revolutionär", "perfekt") → ehrliche Formulierungen
- Falsche Versprechen → entfernen
- Widersprüche im Text → auflösen
- KI-typische Floskeln ("tauchen wir ein", "am Ende des Tages") → natürliche Sprache
- "Versicherung" → "Haftungsschutz" (IMMER!)

Gib den KOMPLETTEN korrigierten Artikel zurück. Nur den Artikeltext, keine Erklärungen.
Schreibe am ENDE nach einer Leerzeile "---CHANGES---" und dann eine kurze Liste der Änderungen.`,
  },
  {
    role: 'Chefredakteur',
    instruction: `Du bist der Chefredakteur und gibst die finale Freigabe.

- Würdest du diesen Artikel mit deinem Namen veröffentlichen?
- Gibt es peinliche Stellen oder Vertrauenskiller?
- Sind Empfehlungen ehrlich und nachvollziehbar?
- Letzter Feinschliff an Formulierungen.

Gib den KOMPLETTEN finalen Artikel zurück. Nur den Artikeltext, keine Erklärungen.
Schreibe am ENDE nach einer Leerzeile "---CHANGES---" und dann:
FREIGABE: JA oder NEIN
QUALITÄT: 1-10
ÄNDERUNGEN: Kurze Liste`,
  },
];

export async function POST(req: NextRequest) {
  const body = await req.json();
  const rawContent = body?.content;
  const rawTitle = body?.title;

  if (!rawContent) return NextResponse.json({ error: 'Content ist erforderlich.' }, { status: 400 });

  // Defense-in-Depth: User-Input vor Einbau in Claude-Prompt entschaerfen.
  const content = sanitizePromptInput(rawContent, 50000);
  const title = sanitizePromptInput(rawTitle, 200);

  const apiKey = await getApiKey();
  if (!apiKey) return NextResponse.json({ error: 'Anthropic API Key nicht konfiguriert.' }, { status: 400 });

  const client = new Anthropic({ apiKey });
  const originalContent = content;
  let currentContent = content;
  const reviewLog: { pass: number; role: string; changes: string }[] = [];
  let finalQuality = 0;
  let finalApproved = true;

  for (let i = 0; i < REVIEW_PASSES.length; i++) {
    const pass = REVIEW_PASSES[i];

    try {
      const message = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8192,
        system: pass.instruction,
        messages: [{
          role: 'user',
          content: `Prüfe und korrigiere diesen Blog-Artikel für cam2rent.de:\n\nTITEL: ${title}\n\n${currentContent}`,
        }],
      });

      const text = message.content[0].type === 'text' ? message.content[0].text : '';

      // Text und Änderungen trennen
      const parts = text.split('---CHANGES---');
      const correctedText = parts[0].trim();
      const changesText = parts[1]?.trim() || 'Keine Details';

      if (correctedText.length > 100) {
        currentContent = correctedText;
      }

      // Qualität aus letztem Durchgang extrahieren
      if (i === REVIEW_PASSES.length - 1) {
        const qualityMatch = changesText.match(/QUALITÄT:\s*(\d+)/i);
        if (qualityMatch) finalQuality = parseInt(qualityMatch[1]);
        const approvedMatch = changesText.match(/FREIGABE:\s*(JA|NEIN)/i);
        if (approvedMatch) finalApproved = approvedMatch[1].toUpperCase() === 'JA';
      }

      reviewLog.push({ pass: i + 1, role: pass.role, changes: changesText.split('\n').filter((l) => l.trim()).slice(0, 5).join('. ') });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Unbekannter Fehler';
      reviewLog.push({ pass: i + 1, role: pass.role, changes: `Fehler: ${errMsg}` });
    }
  }

  // Änderungen finden (einfacher Vergleich)
  const originalLines = originalContent.split('\n').filter((l: string) => l.trim());
  const correctedLines = currentContent.split('\n').filter((l: string) => l.trim());
  const changes: { type: 'removed' | 'added'; text: string }[] = [];

  for (const line of originalLines) {
    if (!correctedLines.includes(line) && line.trim().length > 20) {
      changes.push({ type: 'removed', text: line.trim().slice(0, 120) });
    }
  }
  for (const line of correctedLines) {
    if (!originalLines.includes(line) && line.trim().length > 20) {
      changes.push({ type: 'added', text: line.trim().slice(0, 120) });
    }
  }

  return NextResponse.json({
    content: currentContent,
    originalContent,
    approved: finalApproved,
    quality: finalQuality,
    changes: changes.slice(0, 20),
    reviewLog,
  });
}
