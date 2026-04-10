/**
 * Saisonale Bilder — Themen-Konfiguration
 * Definiert Zonen (Seitenbereiche) und monatliche Themen fuer Action-Cam Verleih.
 */

export const SEASONAL_ZONES = [
  { id: 'hero', label: 'Startseite Hero' },
  { id: 'blog', label: 'Blog Header' },
  { id: 'so-funktionierts', label: 'So funktioniert\'s Header' },
] as const;

export type SeasonalZone = (typeof SEASONAL_ZONES)[number]['id'];

export interface SeasonalImage {
  url: string;
  alt: string;
  source: 'unsplash' | 'ai' | 'custom';
  photographer?: string;
  photographerUrl?: string;
  customPrompt?: string;
}

export interface SeasonalImagesData {
  [zone: string]: {
    [yearMonth: string]: SeasonalImage;
  };
}

export const MONTH_NAMES: Record<number, string> = {
  1: 'Januar',
  2: 'Februar',
  3: 'Maerz',
  4: 'April',
  5: 'Mai',
  6: 'Juni',
  7: 'Juli',
  8: 'August',
  9: 'September',
  10: 'Oktober',
  11: 'November',
  12: 'Dezember',
};

export interface MonthTheme {
  name: string;
  unsplashQuery: string;
  aiPrompt: string;
}

export const MONTH_THEMES: Record<number, MonthTheme> = {
  1: {
    name: 'Januar',
    unsplashQuery: 'action camera skiing snow winter sport',
    aiPrompt:
      'Dynamische Winterlandschaft mit Skifahrer im Tiefschnee, Action-Cam-Perspektive, verschneite Berge im Hintergrund, lebendige Farben, professionelles Sportfoto',
  },
  2: {
    name: 'Februar',
    unsplashQuery: 'snowboarding action camera winter adventure',
    aiPrompt:
      'Snowboarder springt ueber eine Kante mit Blick auf verschneite Berglandschaft, Action-Cam befestigt am Helm, dynamische Bewegung, klarer Himmel',
  },
  3: {
    name: 'Maerz',
    unsplashQuery: 'spring outdoor adventure hiking action camera',
    aiPrompt:
      'Fruehlingswanderung durch blühende Landschaft, Person mit Action-Cam am Rucksack, erste Sonnenstrahlen, gruene Wiesen und Berge im Hintergrund',
  },
  4: {
    name: 'April',
    unsplashQuery: 'mountain biking spring trail action camera',
    aiPrompt:
      'Mountainbiker auf einem Fruehlingsweg durch den Wald, Action-Cam am Lenker befestigt, Kirschblueten am Wegesrand, dynamische Sportaufnahme',
  },
  5: {
    name: 'Mai',
    unsplashQuery: 'outdoor cycling adventure action camera spring',
    aiPrompt:
      'Radfahrer auf einer kurvigen Strasse durch bluehende Fruehsommerlandschaft, Action-Cam-Aufnahme, warmes Sonnenlicht, weitlaeufige gruene Huegel',
  },
  6: {
    name: 'Juni',
    unsplashQuery: 'surfing summer water sport action camera',
    aiPrompt:
      'Surfer reitet eine Welle bei Sonnenuntergang, Action-Cam-Perspektive, tuerkisblaues Wasser, Sommeratmosphaere, professionelle Sportfotografie',
  },
  7: {
    name: 'Juli',
    unsplashQuery: 'diving underwater action camera summer ocean',
    aiPrompt:
      'Taucher erkundet buntes Korallenriff mit Action-Cam, kristallklares Wasser, tropische Fische, Sommersonne scheint durch die Wasseroberflaeche',
  },
  8: {
    name: 'August',
    unsplashQuery: 'summer adventure travel action camera beach',
    aiPrompt:
      'Abenteuerurlaub am Strand, Person springt von einer Klippe ins tuerkisblaue Meer, Action-Cam-Aufnahme, Hochsommer, Palmen im Hintergrund',
  },
  9: {
    name: 'September',
    unsplashQuery: 'autumn hiking adventure action camera nature',
    aiPrompt:
      'Wanderer auf einem Berggipfel im fruehen Herbst, Action-Cam befestigt, goldene Herbstfarben im Tal, Nebelschwaden, warmes Licht',
  },
  10: {
    name: 'Oktober',
    unsplashQuery: 'autumn mountain biking trail fall colors',
    aiPrompt:
      'Mountainbiker auf einem Waldweg mit buntem Herbstlaub, Action-Cam am Helm, orangefarbene und rote Blaetter, atmosphaerische Herbststimmung',
  },
  11: {
    name: 'November',
    unsplashQuery: 'indoor sport climbing action camera adventure',
    aiPrompt:
      'Kletterer an einer beeindruckenden Felswand, Nebel und Herbststimmung, Action-Cam-Perspektive, dramatische Beleuchtung, Abenteuer-Atmosphaere',
  },
  12: {
    name: 'Dezember',
    unsplashQuery: 'winter snow action camera christmas adventure',
    aiPrompt:
      'Winterwunderland mit verschneiten Tannen, Person beim Schneeschuhwandern mit Action-Cam, weihnachtliche Atmosphaere, warmes Abendlicht auf Schnee',
  },
};

/** Gibt zurueck ob im aktuellen Monat das Bild links (true) oder rechts (false) angezeigt wird */
export function isImageLeftMonth(month: number): boolean {
  return month % 2 === 1; // Ungerade Monate: Bild links
}

/** Formatiert Jahr-Monat als Key: "2026-04" */
export function yearMonthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

/** Gibt aktuellen und naechsten Monat zurueck */
export function getCurrentAndNextMonth(): {
  current: { year: number; month: number; key: string };
  next: { year: number; month: number; key: string };
} {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1;
  const nextYear = currentMonth === 12 ? currentYear + 1 : currentYear;

  return {
    current: { year: currentYear, month: currentMonth, key: yearMonthKey(currentYear, currentMonth) },
    next: { year: nextYear, month: nextMonth, key: yearMonthKey(nextYear, nextMonth) },
  };
}
