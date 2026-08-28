/**
 * Konfiguration der KI-Auto-Beantwortung von Kundenanfragen.
 * Gelesen aus `admin_settings.ai_reply_config`.
 *
 * Zwei Ausgaenge pro Anfrage (siehe supabase/supabase-ai-auto-reply.sql):
 *  - AUTOMATISCH: einfache Standardfrage + hohe Sicherheit → Antwort geht raus.
 *  - ENTWURF:     alles andere → Vorschlag wartet auf Admin-Freigabe.
 *
 * Ohne Setting greifen die Defaults unten. Zum Abschalten des automatischen
 * Versands genuegt `{ "mode": "draft_only" }` — die KI schreibt dann weiterhin
 * Entwuerfe, aber nichts geht ungeprueft raus. `{ "enabled": false }` schaltet
 * das ganze Feature ab.
 */

import type { createServiceClient } from '@/lib/supabase';

type SB = ReturnType<typeof createServiceClient>;

/** Grobe Einordnung der Kundenanfrage durch die KI. */
export type AnfrageKategorie =
  | 'preise_verfuegbarkeit'
  | 'produkt_technik'
  | 'versand_abholung'
  | 'buchung_status'
  | 'kontakt_allgemein'
  | 'stornierung_umbuchung'
  | 'zahlung_rechnung'
  | 'schaden_reklamation'
  | 'vertrag_recht'
  | 'datenschutz'
  | 'beschwerde'
  | 'sonstiges';

export const ALLE_KATEGORIEN: AnfrageKategorie[] = [
  'preise_verfuegbarkeit',
  'produkt_technik',
  'versand_abholung',
  'buchung_status',
  'kontakt_allgemein',
  'stornierung_umbuchung',
  'zahlung_rechnung',
  'schaden_reklamation',
  'vertrag_recht',
  'datenschutz',
  'beschwerde',
  'sonstiges',
];

export const KATEGORIE_LABEL: Record<AnfrageKategorie, string> = {
  preise_verfuegbarkeit: 'Preis & Verfügbarkeit',
  produkt_technik: 'Produkt & Technik',
  versand_abholung: 'Versand & Abholung',
  buchung_status: 'Status einer Buchung',
  kontakt_allgemein: 'Allgemeine Kontaktfrage',
  stornierung_umbuchung: 'Stornierung / Umbuchung',
  zahlung_rechnung: 'Zahlung & Rechnung',
  schaden_reklamation: 'Schaden & Reklamation',
  vertrag_recht: 'Vertrag & Recht',
  datenschutz: 'Datenschutz',
  beschwerde: 'Beschwerde',
  sonstiges: 'Sonstiges',
};

/**
 * Kategorien, die NIEMALS automatisch beantwortet werden duerfen — egal was
 * in der Config steht. Hier haengen Geld, Vertrag oder Eskalation dran; eine
 * falsche Auskunft waere bindend bzw. teuer.
 */
export const NIEMALS_AUTOMATISCH: AnfrageKategorie[] = [
  'stornierung_umbuchung',
  'zahlung_rechnung',
  'schaden_reklamation',
  'vertrag_recht',
  'datenschutz',
  'beschwerde',
];

export interface AiReplyConfig {
  /** Feature global an/aus. Aus = weder Entwurf noch Auto-Antwort. */
  enabled: boolean;
  /**
   * 'hybrid'     — einfache Fragen automatisch, Rest als Entwurf.
   * 'draft_only' — nie automatisch senden, immer nur Entwurf vorschlagen.
   */
  mode: 'hybrid' | 'draft_only';
  /** Kanaele, in denen die KI aktiv wird. */
  channels: { email: boolean; account: boolean };
  /** Ab welcher Selbsteinschaetzung (0..1) automatisch gesendet werden darf. */
  confidence_min: number;
  /** Kategorien, die automatisch beantwortet werden duerfen. */
  auto_categories: AnfrageKategorie[];
  /** Max. automatische Antworten pro Konversation (Schleifen-Schutz). */
  max_auto_replies_per_thread: number;
  /** Max. automatische Antworten pro Tag (Kosten-/Schadensdeckel). */
  max_auto_replies_per_day: number;
  /** Zusaetzlicher Kontext fuer die KI (Tonfall, Hinweise, Aktionen). */
  extra_context: string;
}

export const DEFAULT_AI_REPLY_CONFIG: AiReplyConfig = {
  enabled: true,
  mode: 'hybrid',
  channels: { email: true, account: true },
  confidence_min: 0.8,
  auto_categories: [
    'preise_verfuegbarkeit',
    'produkt_technik',
    'versand_abholung',
    'buchung_status',
    'kontakt_allgemein',
  ],
  max_auto_replies_per_thread: 2,
  max_auto_replies_per_day: 30,
  extra_context: '',
};

function clampNumber(raw: unknown, fallback: number, min: number, max: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** Rohwert aus admin_settings → geprüfte Config (pure, testbar). */
export function normalizeAiReplyConfig(raw: unknown): AiReplyConfig {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_AI_REPLY_CONFIG };
  const p = raw as Partial<AiReplyConfig> & { channels?: Partial<AiReplyConfig['channels']> };

  const auto = Array.isArray(p.auto_categories)
    ? p.auto_categories.filter(
        (c): c is AnfrageKategorie =>
          typeof c === 'string' &&
          (ALLE_KATEGORIEN as string[]).includes(c) &&
          !(NIEMALS_AUTOMATISCH as string[]).includes(c),
      )
    : DEFAULT_AI_REPLY_CONFIG.auto_categories;

  return {
    enabled: p.enabled !== false,
    mode: p.mode === 'draft_only' ? 'draft_only' : 'hybrid',
    channels: {
      email: p.channels?.email !== false,
      account: p.channels?.account !== false,
    },
    // Untergrenze 0.5: darunter waere "automatisch senden" grob fahrlaessig.
    confidence_min: clampNumber(p.confidence_min, DEFAULT_AI_REPLY_CONFIG.confidence_min, 0.5, 1),
    auto_categories: [...new Set(auto)],
    max_auto_replies_per_thread: Math.round(
      clampNumber(p.max_auto_replies_per_thread, DEFAULT_AI_REPLY_CONFIG.max_auto_replies_per_thread, 0, 10),
    ),
    max_auto_replies_per_day: Math.round(
      clampNumber(p.max_auto_replies_per_day, DEFAULT_AI_REPLY_CONFIG.max_auto_replies_per_day, 0, 500),
    ),
    extra_context: typeof p.extra_context === 'string' ? p.extra_context.slice(0, 4000) : '',
  };
}

export async function loadAiReplyConfig(supabase: SB): Promise<AiReplyConfig> {
  try {
    const { data } = await supabase
      .from('admin_settings')
      .select('value')
      .eq('key', 'ai_reply_config')
      .maybeSingle();
    if (!data?.value) return { ...DEFAULT_AI_REPLY_CONFIG };
    const parsed = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
    return normalizeAiReplyConfig(parsed);
  } catch {
    return { ...DEFAULT_AI_REPLY_CONFIG };
  }
}
