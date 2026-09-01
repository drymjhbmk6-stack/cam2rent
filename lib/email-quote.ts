/**
 * Eingehende E-Mails schleppen den kompletten Verlauf mit: zitierte Zeilen mit
 * ">"-Praefix, "Am ... schrieb ...:"-Einleitungen (je nach Mailprogramm auch
 * englisch/italienisch) und Outlook-Kopfbloecke ("Von: ... Gesendet: ...").
 * `messages.body` enthaelt das 1:1 — im Admin-Tool war die eigentliche neue
 * Nachricht dadurch in einer Textwand aus Zitaten kaum zu finden.
 *
 * Dieses Modul trennt rein lesend "neue Nachricht" von "zitierter Verlauf".
 * Es veraendert nichts an den gespeicherten Daten — die Anzeige blendet den
 * Verlauf nur ein, wenn der Admin ihn aufklappt.
 *
 * Bewusst konservativ: erkennt der Splitter nichts Eindeutiges oder waere der
 * neue Teil danach leer, wird der komplette Text als "neu" zurueckgegeben.
 * Lieber zu viel anzeigen als eine Kundenfrage verstecken.
 */

export interface SplitEmailBody {
  /** Der neu geschriebene Teil (das, was der Kunde diesmal gesagt hat). */
  reply: string;
  /** Der zitierte aeltere Verlauf ohne die ">"-Praefixe. Leer = keiner erkannt. */
  quoted: string;
}

/** "-----Original Message-----", Outlook-Trennlinien, Weiterleitungs-Marker. */
const SEPARATOR_RE =
  /^\s*(-{2,}\s*(original message|urspr[üu]ngliche nachricht|forwarded message|weitergeleitete nachricht|original-nachricht)\s*-{2,}|_{10,}|-{10,})\s*$/i;

/**
 * Einleitungszeile eines Zitats. Deckt die gaengigen Mailprogramme ab:
 * de "Am 26.08.2026 um 15:57 schrieb X:", en "On ... wrote:",
 * it "Il giorno ... ha scritto:", fr "Le ... a écrit :", es "El ... escribió:".
 */
const ATTRIBUTION_RE =
  /^\s*(am|on|le|el|il giorno|op)\b(?=.*\d).{0,250}?\b(schrieb|wrote|a\s+écrit|a\s+ecrit|ha\s+scritto|escribi[oó]|schreef)\b\s*(.{0,150}:\s*)?$/i;

/** Outlook-Kopfblock: "Von: …" / "Gesendet: …" / "An: …" / "Betreff: …". */
const HEADER_RE =
  /^\s*(von|from|gesendet|sent|an|to|cc|betreff|subject|datum|date|da|oggetto|a)\s*:\s?\S/i;

/** Eine zitierte Zeile ("> …", ">> …", auch ohne Leerzeichen). */
function isQuoteLine(line: string): boolean {
  return /^\s{0,3}>/.test(line);
}

function isBlank(line: string): boolean {
  return line.trim() === '';
}

/**
 * Sucht den Index der Zeile, ab der der zitierte Verlauf beginnt.
 * Liefert -1, wenn nichts Eindeutiges gefunden wurde.
 */
function findQuoteStart(lines: string[]): number {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 1) Explizite Trennlinie ("-----Ursprüngliche Nachricht-----").
    if (SEPARATOR_RE.test(line)) return i;

    // 2) Einleitungszeile. Manche Programme brechen sie um
    //    ("Am 26.08.2026 um 15:57 schrieb\ncam2rent <…>:") — deshalb wird
    //    zusaetzlich die Kombination aus dieser und der naechsten Zeile geprueft.
    if (!isBlank(line)) {
      if (ATTRIBUTION_RE.test(line)) return i;
      const joined = `${line.trim()} ${(lines[i + 1] ?? '').trim()}`;
      if (lines[i + 1] !== undefined && ATTRIBUTION_RE.test(joined)) return i;
    }

    // 3) Outlook-Kopfblock: mindestens zwei Header-Zeilen direkt hintereinander.
    if (HEADER_RE.test(line)) {
      const following = lines.slice(i + 1, i + 5).filter((l) => !isBlank(l));
      if (following.length > 0 && HEADER_RE.test(following[0])) return i;
    }

    // 4) Reiner Zitatblock: ab hier ist der Rest ueberwiegend zitiert.
    if (isQuoteLine(line)) {
      const rest = lines.slice(i).filter((l) => !isBlank(l));
      const quoted = rest.filter((l) => isQuoteLine(l) || HEADER_RE.test(l)).length;
      if (rest.length > 0 && quoted / rest.length >= 0.6) return i;
    }
  }
  return -1;
}

/** Entfernt die ">"-Praefixe (auch mehrfach verschachtelt) fuer die Anzeige. */
export function stripQuoteMarkers(text: string): string {
  return text
    .split('\n')
    .map((line) => line.replace(/^\s{0,3}(>\s?)+/, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Trennt eine E-Mail in "neu geschrieben" und "zitierter Verlauf".
 * Ohne erkennbares Zitat kommt der komplette Text als `reply` zurueck.
 */
export function splitQuotedReply(body: string): SplitEmailBody {
  const text = (body ?? '').replace(/\r\n?/g, '\n');
  if (!text.trim()) return { reply: text, quoted: '' };

  const lines = text.split('\n');
  const cut = findQuoteStart(lines);
  if (cut < 0) return { reply: text.trim(), quoted: '' };

  const reply = lines.slice(0, cut).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  const quoted = stripQuoteMarkers(lines.slice(cut).join('\n'));

  // Waere der neue Teil leer (reine Weiterleitung / nur Zitat), lieber alles
  // als Nachricht zeigen, statt dem Admin eine leere Blase zu praesentieren.
  if (!reply) return { reply: text.trim(), quoted: '' };

  return { reply, quoted };
}

/**
 * Kurzvorschau fuer Listen: nur der neu geschriebene Teil, einzeilig.
 * `maxLen` schneidet hart ab (Ellipse setzt der Aufrufer per CSS).
 */
export function previewFromBody(body: string, maxLen = 140): string {
  const { reply } = splitQuotedReply(body ?? '');
  const flat = reply.replace(/\s+/g, ' ').trim();
  return flat.slice(0, maxLen);
}
