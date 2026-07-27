import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getConsentDecision,
  trackingAllowed,
  setConsentDecision,
  revokeConsent,
  resetConsent,
  getConsentTimestamp,
  CONSENT_KEY,
  CONSENT_VERSION_KEY,
  CONSENT_VERSION,
  CONSENT_EVENT,
} from '@/lib/consent';

/**
 * Consent-Gate (§ 25 Abs. 1 TDDDG / Art. 7 DSGVO). Testet die Kern-Logik, die
 * PageTracker + VisitTracker gaten. Minimaler Storage-/Window-Stub, da die
 * vitest-Umgebung `node` ist (kein jsdom).
 */

class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string) {
    return this.m.has(k) ? this.m.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, String(v));
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
  clear() {
    this.m.clear();
  }
  keys() {
    return [...this.m.keys()];
  }
}

let events: string[];

beforeEach(() => {
  const listeners: Record<string, Array<(e: unknown) => void>> = {};
  events = [];
  (globalThis as unknown as { localStorage: MemStorage }).localStorage = new MemStorage();
  (globalThis as unknown as { sessionStorage: MemStorage }).sessionStorage = new MemStorage();
  (globalThis as unknown as { window: unknown }).window = {
    addEventListener: (t: string, cb: (e: unknown) => void) => {
      (listeners[t] ??= []).push(cb);
    },
    removeEventListener: (t: string, cb: (e: unknown) => void) => {
      listeners[t] = (listeners[t] ?? []).filter((f) => f !== cb);
    },
    dispatchEvent: (e: { type: string }) => {
      events.push(e.type);
      (listeners[e.type] ?? []).forEach((f) => f(e));
      return true;
    },
  };
  (globalThis as unknown as { CustomEvent: unknown }).CustomEvent = class {
    type: string;
    constructor(t: string) {
      this.type = t;
    }
  };
});

afterEach(() => {
  const g = globalThis as Record<string, unknown>;
  delete g.localStorage;
  delete g.sessionStorage;
  delete g.window;
  delete g.CustomEvent;
});

function ls() {
  return (globalThis as unknown as { localStorage: MemStorage }).localStorage;
}
function ss() {
  return (globalThis as unknown as { sessionStorage: MemStorage }).sessionStorage;
}

describe('Consent-Gate — Standardzustand (keine Entscheidung)', () => {
  it('ohne Entscheidung: kein Tracking erlaubt, Banner sichtbar (Decision null)', () => {
    expect(getConsentDecision()).toBeNull();
    expect(trackingAllowed()).toBe(false);
  });

  it('ohne Entscheidung liegt außer evtl. Consent-Keys NICHTS im Storage — keine Tracking-IDs', () => {
    // Frischer Zustand: gar keine Keys.
    expect(ls().keys()).toEqual([]);
    expect(ss().keys()).toEqual([]);
  });
});

describe('Consent-Gate — Zustimmen', () => {
  it('nach "Zustimmen" ist Tracking aktiv, mit Zeitstempel + Version', () => {
    setConsentDecision('all');
    expect(getConsentDecision()).toBe('all');
    expect(trackingAllowed()).toBe(true);
    expect(ls().getItem(CONSENT_KEY)).toBe('all');
    expect(ls().getItem(CONSENT_VERSION_KEY)).toBe(CONSENT_VERSION);
    expect(getConsentTimestamp()).toBeTruthy();
    expect(events).toContain(CONSENT_EVENT);
  });
});

describe('Consent-Gate — Ablehnen', () => {
  it('nach "Ablehnen": kein Tracking, Banner erscheint NICHT erneut (Decision !== null)', () => {
    setConsentDecision('necessary');
    expect(getConsentDecision()).toBe('necessary'); // != null → Banner bleibt aus
    expect(trackingAllowed()).toBe(false);
  });

  it('"Ablehnen" löscht evtl. vorhandene Tracking-IDs', () => {
    ls().setItem('cam2rent_vid', 'abc');
    ss().setItem('cam2rent_sid', 'def');
    ss().setItem('cam2rent_visit_counted', '1');
    setConsentDecision('necessary');
    expect(ls().getItem('cam2rent_vid')).toBeNull();
    expect(ss().getItem('cam2rent_sid')).toBeNull();
    expect(ss().getItem('cam2rent_visit_counted')).toBeNull();
  });
});

describe('Consent-Gate — Widerruf (Art. 7 Abs. 3 DSGVO)', () => {
  it('Widerruf nach Zustimmung: Tracking gestoppt + IDs gelöscht + Event', () => {
    setConsentDecision('all');
    ls().setItem('cam2rent_vid', 'abc');
    ss().setItem('cam2rent_sid', 'def');
    events.length = 0;

    revokeConsent();

    expect(getConsentDecision()).toBe('necessary');
    expect(trackingAllowed()).toBe(false);
    expect(ls().getItem('cam2rent_vid')).toBeNull();
    expect(ss().getItem('cam2rent_sid')).toBeNull();
    expect(events).toContain(CONSENT_EVENT);
  });
});

describe('Consent-Gate — Reset + Versionierung', () => {
  it('resetConsent macht die Entscheidung wieder offen (Banner erscheint erneut)', () => {
    setConsentDecision('all');
    resetConsent();
    expect(getConsentDecision()).toBeNull();
    expect(ls().getItem(CONSENT_KEY)).toBeNull();
  });

  it('Alt-Einwilligung ohne aktuelle Version gilt als "nicht entschieden"', () => {
    // Simuliert eine vor der Versionierung gesetzte Einwilligung.
    ls().setItem(CONSENT_KEY, 'all');
    // kein CONSENT_VERSION_KEY gesetzt
    expect(getConsentDecision()).toBeNull();
    expect(trackingAllowed()).toBe(false);
  });

  it('falsche/veraltete Version → erneute Abfrage', () => {
    ls().setItem(CONSENT_KEY, 'all');
    ls().setItem(CONSENT_VERSION_KEY, '2020-01');
    expect(getConsentDecision()).toBeNull();
  });
});
