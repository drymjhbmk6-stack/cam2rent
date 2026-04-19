import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';

/**
 * POST /api/admin/social/templates/seed
 * Fuegt die offiziellen Standard-Vorlagen ein, falls sie noch nicht existieren.
 * Idempotent: vorhandene Vorlagen mit gleichem Namen werden nicht ueberschrieben.
 *
 * So kannst du neue Standard-Vorlagen nachziehen, ohne die
 * supabase-social.sql erneut auszufuehren.
 */

const STANDARD_TEMPLATES = [
  {
    name: 'Community-Kampagne (UGC)',
    description: 'Follower zum Mitmachen animieren (Foto-/Video-Contest, Q&A)',
    trigger_type: 'manual',
    platforms: ['facebook', 'instagram'],
    media_type: 'image',
    caption_prompt: `Schreibe einen Community-Post fuer cam2rent, der Follower aktiv einbindet.
Thema: {topic} — Kernaussage: {angle}

Ziele:
- Frage oder Aufforderung an die Follower (z.B. "Teilt eure besten Aufnahmen", "Taggt euer Lieblingsbild")
- Klare Hashtag-Aufforderung (z.B. #cam2rentmoments)
- Optional Belohnung: 10% Gutschein fuer die besten Einsendungen, Feature auf unserem Account
- Tonalitaet: nahbar, neugierig, authentisch
- CTA am Ende: "Wir sind gespannt!" oder "Zeigt uns eure Geschichte"`,
    image_prompt: `Vibrant user-generated style photo related to: {topic}. Authentic, outdoor/action, feels like a real customer shot. Natural lighting. No text.`,
    default_hashtags: ['#cam2rentmoments', '#actioncam', '#community', '#cam2rent'],
  },
  {
    name: 'Website- / Feature-Ankuendigung',
    description: 'Neue Website, neue Features, Team-/Service-Updates',
    trigger_type: 'manual',
    platforms: ['facebook', 'instagram'],
    media_type: 'image',
    caption_prompt: `Schreibe einen Ankuendigungs-Post fuer cam2rent.
Thema: {topic} — Details: {angle}

Ziele:
- Neuigkeit klar und selbstbewusst kommunizieren
- 1-2 konkrete Vorteile fuer den Kunden nennen
- CTA zum Ausprobieren / Mehr erfahren
- Tonalitaet: freundlich professionell, leicht stolz
- Max 500 Zeichen`,
    image_prompt: `Clean, modern announcement-style image about: {topic}. Bold, professional, inviting. No text overlay.`,
    default_hashtags: ['#update', '#news', '#cam2rent'],
  },
  {
    name: 'Frage an die Community',
    description: 'Engagement-Post: Follower stellen Antworten / Meinungen',
    trigger_type: 'manual',
    platforms: ['facebook', 'instagram'],
    media_type: 'text',
    caption_prompt: `Schreibe einen kurzen Engagement-Post zum Thema: {topic}.
Stelle genau EINE klare Frage an die Community. Biete 2-3 Antwort-Optionen zur Auswahl in Emoji-Form
(z.B. "🎯 GoPro | 🚀 DJI | 📸 Insta360") oder offene Frage.
Am Ende Einladung zum Kommentieren.
Kurz und knackig (max 300 Zeichen).`,
    default_hashtags: ['#cam2rent', '#community', '#frage'],
  },
  {
    name: 'Erfolgsgeschichte / Testimonial',
    description: 'Kundenzitat oder Case-Study-Post',
    trigger_type: 'manual',
    platforms: ['facebook', 'instagram'],
    media_type: 'image',
    caption_prompt: `Schreibe einen Testimonial-/Success-Story-Post.
Kontext: {topic} — Details: {angle}

Struktur:
- Kurz Einleitung ("Tolle Nachricht von Kunde X...")
- Zitat oder Erfolg (1-2 Saetze)
- Abschluss: Ermutigung an andere ("Auch dein Projekt verdient die beste Kamera")
- CTA zum Mieten`,
    default_hashtags: ['#kundenstory', '#cam2rent', '#action'],
  },
];

export async function POST() {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();
  const { data: existing } = await supabase.from('social_templates').select('name');
  const existingNames = new Set((existing ?? []).map((t) => t.name));

  const toInsert = STANDARD_TEMPLATES.filter((t) => !existingNames.has(t.name));

  if (toInsert.length === 0) {
    return NextResponse.json({ imported: 0, skipped: STANDARD_TEMPLATES.length, message: 'Alle Standard-Vorlagen sind bereits vorhanden.' });
  }

  const { data, error } = await supabase.from('social_templates').insert(toInsert).select('id, name');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    imported: data?.length ?? 0,
    skipped: STANDARD_TEMPLATES.length - (data?.length ?? 0),
    templates: data,
  });
}
