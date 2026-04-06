// ─── Deutsche Feiertage (Berlin) ─────────────────────────────────────────────
//
// Berechnet alle gesetzlichen Feiertage für Berlin für ein gegebenes Jahr.
// Enthält auch bewegliche Feiertage (Ostern, Himmelfahrt, Pfingsten).
//
// ─────────────────────────────────────────────────────────────────────────────

/** Berechnet das Osterdatum nach der Gauss'schen Osterformel */
function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/** Gibt alle gesetzlichen Feiertage für Berlin als Set von "YYYY-MM-DD" zurück */
export function getGermanHolidays(year: number): Set<string> {
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const easter = easterSunday(year);

  const holidays = [
    new Date(year, 0, 1),     // Neujahr
    new Date(year, 2, 8),     // Internationaler Frauentag (Berlin)
    addDays(easter, -2),      // Karfreitag
    addDays(easter, 1),       // Ostermontag
    new Date(year, 4, 1),     // Tag der Arbeit
    addDays(easter, 39),      // Christi Himmelfahrt
    addDays(easter, 50),      // Pfingstmontag
    new Date(year, 9, 3),     // Tag der Deutschen Einheit
    new Date(year, 9, 31),    // Reformationstag (Berlin seit 2019)
    new Date(year, 11, 25),   // 1. Weihnachtstag
    new Date(year, 11, 26),   // 2. Weihnachtstag
  ];

  return new Set(holidays.map(fmt));
}

/** Prüft ob ein Datum ein Sonntag ist */
export function isSunday(date: Date): boolean {
  return date.getDay() === 0;
}

/** Prüft ob ein Datum ein Sonn- oder Feiertag ist */
export function isSundayOrHoliday(date: Date): boolean {
  if (isSunday(date)) return true;
  const fmt = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return getGermanHolidays(date.getFullYear()).has(fmt);
}

/**
 * Prüft ob ein Datum als Mietbeginn oder Mietende im Versandmodus gesperrt ist.
 *
 * Gesperrt wenn: Das Datum ein Sonntag oder Feiertag ist.
 * Grund: Der Kunde kann die Kamera nicht am Sonntag/Feiertag zum Versandshop bringen.
 */
export function isBlockedForShipping(date: Date): boolean {
  return isSundayOrHoliday(date);
}

/**
 * Gibt ein Set aller gesperrten Daten (als "YYYY-MM-DD") für einen Monat zurück.
 * Nützlich für den Kalender um gesperrte Tage visuell zu markieren.
 */
export function getBlockedShippingDates(year: number, month: number): Set<string> {
  const blocked = new Set<string>();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day);
    if (isBlockedForShipping(date)) {
      const fmt = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      blocked.add(fmt);
    }
  }

  return blocked;
}
