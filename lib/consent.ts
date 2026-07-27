'use client';

/**
 * Zentrale Consent-Verwaltung — § 25 Abs. 1 TDDDG / Art. 7 DSGVO.
 *
 * Reichweitenmessung (eigenes ID-basiertes Tracking + cookieloser
 * Besucherzähler) läuft AUSSCHLIESSLICH nach ausdrücklicher Einwilligung
 * („Zustimmen"). Ohne Einwilligung — oder nach „Ablehnen"/Widerruf — wird
 *   • KEINE Reichweitenmessung durchgeführt,
 *   • KEINE Besucher-ID / Session-ID / kein Zähl-Flag im Endgerät gespeichert,
 *   • kein `/api/track`- oder `/api/visit`-Request abgesetzt.
 * Das Tracking-Modul wird also gar nicht erst „scharf" geschaltet (nicht laden
 * und intern verwerfen). Warenkorb + Session-Handling sind technisch notwendig
 * (§ 25 Abs. 2 Nr. 2 TDDDG) und von dieser Einwilligung unberührt.
 *
 * Der Widerruf ist über die Datenschutz-Einstellungen (Footer) genauso einfach
 * wie die Erteilung (Art. 7 Abs. 3 DSGVO) und löscht die gesetzten IDs sofort.
 */

export type ConsentDecision = 'all' | 'necessary';

export const CONSENT_KEY = 'cam2rent_consent'; // 'all' = Zustimmen, 'necessary' = Ablehnen
export const CONSENT_AT_KEY = 'cam2rent_consent_at'; // ISO-Zeitstempel der Entscheidung
export const CONSENT_VERSION_KEY = 'cam2rent_consent_v';

/**
 * Version des eingeholten Einwilligungs-Umfangs. Bei einer Änderung des
 * Umfangs (welche Daten, welcher Zweck) erhöhen — dann wird die Einwilligung
 * neu abgefragt. Auf „2026-07" gesetzt, weil (a) die Reichweitenmessung jetzt
 * opt-in ist, (b) auch der cookielose Zähler einwilligungspflichtig wurde und
 * (c) der Banner auf gleichwertige „Zustimmen"/„Ablehnen"-Buttons umgestellt
 * wurde. Alt-Einwilligungen ohne Version gelten daher als „nicht entschieden".
 */
export const CONSENT_VERSION = '2026-07';

/** Custom-Event, damit Tracker ohne Reload auf Consent-Änderungen reagieren. */
export const CONSENT_EVENT = 'cam2rent-consent-changed';

/** Vom Consent gesetzte Kennungen — bei Ablehnung/Widerruf zu löschen. */
const TRACKING_KEYS_LOCAL = ['cam2rent_vid'];
const TRACKING_KEYS_SESSION = ['cam2rent_sid', 'cam2rent_visit_counted'];

/** Aktuelle Entscheidung — `null`, wenn noch keine (oder eine veraltete) getroffen wurde. */
export function getConsentDecision(): ConsentDecision | null {
  if (typeof window === 'undefined') return null;
  try {
    const v = localStorage.getItem(CONSENT_KEY);
    if (v !== 'all' && v !== 'necessary') return null;
    // Umfang geändert → als „nicht entschieden" behandeln (Banner fragt erneut).
    if (localStorage.getItem(CONSENT_VERSION_KEY) !== CONSENT_VERSION) return null;
    return v;
  } catch {
    return null;
  }
}

/** true, wenn Reichweitenmessung erlaubt ist. */
export function trackingAllowed(): boolean {
  return getConsentDecision() === 'all';
}

/** Zeitpunkt der letzten Entscheidung (ISO) — für die Einstellungen-Anzeige. */
export function getConsentTimestamp(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(CONSENT_AT_KEY);
  } catch {
    return null;
  }
}

function deleteTrackingIds() {
  try {
    for (const k of TRACKING_KEYS_LOCAL) localStorage.removeItem(k);
  } catch {
    /* localStorage evtl. gesperrt */
  }
  try {
    for (const k of TRACKING_KEYS_SESSION) sessionStorage.removeItem(k);
  } catch {
    /* sessionStorage evtl. gesperrt */
  }
}

function emitConsentChanged() {
  try {
    window.dispatchEvent(new CustomEvent(CONSENT_EVENT));
  } catch {
    /* noop */
  }
}

/**
 * Entscheidung speichern (mit Zeitstempel + Version). Bei „Ablehnen"
 * (`necessary`) werden alle Tracking-IDs sofort gelöscht. Anschließend werden
 * die Tracker per Event benachrichtigt (Start/Stopp ohne Reload).
 */
export function setConsentDecision(decision: ConsentDecision) {
  try {
    localStorage.setItem(CONSENT_KEY, decision);
    localStorage.setItem(CONSENT_AT_KEY, new Date().toISOString());
    localStorage.setItem(CONSENT_VERSION_KEY, CONSENT_VERSION);
    // Backward-Compat mit dem alten Opt-out-Marker.
    if (decision === 'all') localStorage.removeItem('cam2rent_tracking_optout');
    else localStorage.setItem('cam2rent_tracking_optout', 'true');
  } catch {
    /* noop */
  }
  if (decision !== 'all') deleteTrackingIds();
  emitConsentChanged();
}

/**
 * Widerruf (Art. 7 Abs. 3 DSGVO): auf „abgelehnt" setzen, alle IDs löschen,
 * Tracker sofort stoppen. So einfach wie die Erteilung.
 */
export function revokeConsent() {
  setConsentDecision('necessary');
}

/**
 * Entscheidung komplett zurücksetzen → der Banner erscheint erneut. Löscht
 * ebenfalls alle Tracking-IDs (kein Re-Consent an alte Sessions korreliert).
 */
export function resetConsent() {
  deleteTrackingIds();
  try {
    localStorage.removeItem(CONSENT_KEY);
    localStorage.removeItem(CONSENT_AT_KEY);
    localStorage.removeItem(CONSENT_VERSION_KEY);
    localStorage.removeItem('cam2rent_tracking_optout');
  } catch {
    /* noop */
  }
  emitConsentChanged();
}
