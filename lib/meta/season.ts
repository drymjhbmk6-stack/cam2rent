/**
 * Saison-Kontext fuer Social-Media-KI-Generierung.
 *
 * Claude bekommt sonst kein aktuelles Datum mit und erfindet dann z.B.
 * Skitour-Posts im April. Dieses Modul liefert Monat + Saison + konkrete
 * Verbotsliste, damit die Captions/Themen zur echten Jahreszeit passen.
 */

export type Season = 'winter' | 'fruehling' | 'sommer' | 'herbst';

export function getSeason(date: Date): Season {
  const m = date.getMonth(); // 0 = Jan
  if (m === 11 || m <= 1) return 'winter';
  if (m <= 4) return 'fruehling';
  if (m <= 7) return 'sommer';
  return 'herbst';
}

const MONTH_NAMES_DE = [
  'Januar', 'Februar', 'Maerz', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];

const SEASON_LABEL: Record<Season, string> = {
  winter: 'Winter',
  fruehling: 'Fruehling',
  sommer: 'Sommer',
  herbst: 'Herbst',
};

const PASSENDE_AKTIVITAETEN: Record<Season, string[]> = {
  winter: ['Skifahren', 'Snowboarden', 'Skitour', 'Rodeln', 'Eislaufen', 'Winterwandern', 'Apres-Ski', 'Silvester', 'Weihnachtsmaerkte'],
  fruehling: ['Wandern', 'Radtouren', 'Fruehlingsausfluege', 'Blueten', 'Oster-Trips', 'Klettern', 'MTB', 'Stadt-Tripps', 'Konzerte', 'Festivals-Start'],
  sommer: ['Baden', 'Surfen', 'SUP', 'Strand', 'Freibad', 'Festivals', 'Roadtrips', 'Bergseen', 'Camping', 'Grillen', 'Hochzeiten'],
  herbst: ['Wandern', 'Laubfarben', 'MTB', 'Oktoberfest', 'Pilze', 'Nebelstimmung', 'Stadtfotografie', 'Indoor-Sport', 'Klettersteige bis Oktober'],
};

const VERBOTENE_THEMEN: Record<Season, string[]> = {
  winter: ['Strand', 'Baden', 'Freibad', 'Sommer-Urlaub', 'Hitzewelle', 'Sonnencreme'],
  fruehling: ['Skifahren', 'Snowboarden', 'Skitour', 'Schnee', 'Schneeschuh', 'Apres-Ski', 'Weihnachten', 'Silvester', 'Hochsommer', 'Hitzewelle'],
  sommer: ['Schnee', 'Skifahren', 'Snowboard', 'Skitour', 'Weihnachten', 'Silvester', 'Herbstlaub', 'Nebel'],
  herbst: ['Skifahren', 'Snowboarden', 'Strand', 'Baden', 'Freibad', 'Hitzewelle', 'Sommerurlaub'],
};

export interface SeasonContext {
  season: Season;
  seasonLabel: string;
  monthLabel: string;
  dateIso: string; // YYYY-MM-DD
  passendeAktivitaeten: string[];
  verboteneThemen: string[];
}

export function getSeasonContext(date: Date = new Date()): SeasonContext {
  const season = getSeason(date);
  return {
    season,
    seasonLabel: SEASON_LABEL[season],
    monthLabel: MONTH_NAMES_DE[date.getMonth()],
    dateIso: date.toISOString().slice(0, 10),
    passendeAktivitaeten: PASSENDE_AKTIVITAETEN[season],
    verboteneThemen: VERBOTENE_THEMEN[season],
  };
}

/**
 * Fuer System-Prompts: harte, klare Saison-Regel als Text-Block.
 * Wird an Caption-Generator + Topic-Generator angehaengt.
 */
export function seasonPromptBlock(date: Date = new Date()): string {
  const ctx = getSeasonContext(date);
  return [
    `Heutiges Datum: ${ctx.dateIso} (${ctx.monthLabel}) — Saison: ${ctx.seasonLabel}.`,
    `Passende Aktivitaeten jetzt: ${ctx.passendeAktivitaeten.join(', ')}.`,
    `SAISON-VERBOT: Schreibe NIEMALS ueber ${ctx.verboteneThemen.join(', ')}. Kein Wintersport im Fruehling/Sommer/Herbst, kein Sommer-Content im Winter. Inhalte muessen zur aktuellen Jahreszeit passen.`,
  ].join(' ');
}

/**
 * Grobe Pruefung, ob ein Topic zur Saison passt — nutzbar vor dem Einplanen,
 * um offensichtlich saisonfremde Themen zu verwerfen.
 * Case-insensitive Teilstring-Match auf der Verbotsliste.
 */
export function isTopicOutOfSeason(topic: string, date: Date = new Date()): boolean {
  const ctx = getSeasonContext(date);
  const hay = topic.toLowerCase();
  return ctx.verboteneThemen.some((v) => hay.includes(v.toLowerCase()));
}
