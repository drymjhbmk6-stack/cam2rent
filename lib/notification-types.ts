import type { PermissionKey } from '@/lib/admin-users';

/**
 * Zentrale Quelle der Wahrheit fuer alle Admin-Benachrichtigungs-Typen.
 *
 * Genutzt von:
 *  - lib/admin-notifications.ts   → Permission-Mapping fuer den Push-Filter
 *  - lib/push.ts                  → welche Pushes ein Mitarbeiter bekommt
 *  - Mitarbeiter-Verwaltung + Einstellungen → UI (Labels, Gruppen, Toggles)
 *
 * Jede NEUE Benachrichtigungsart hier eintragen — dann taucht sie automatisch
 * im Permission-Filter UND in den Pro-Mitarbeiter-Einstellungen auf.
 */
export interface NotificationTypeDef {
  /** Interner Typ-Schluessel (== `admin_notifications.type` == Push-`tag`). */
  type: string;
  /** Kurzes deutsches Label fuer die UI. */
  label: string;
  /**
   * Benoetigte Permission. Mitarbeiter ohne diese Permission bekommen den
   * Push nie (Owner immer). `undefined` = geht an alle aktiven Admins.
   */
  permission?: PermissionKey;
  /** UI-Gruppe (nach Bereich), damit die Toggle-Liste geordnet ist. */
  group: string;
}

export const NOTIFICATION_TYPES: NotificationTypeDef[] = [
  // ── Tagesgeschäft ──────────────────────────────────────────
  { type: 'new_booking', label: 'Neue Buchung', permission: 'tagesgeschaeft', group: 'Tagesgeschäft' },
  { type: 'booking_cancelled', label: 'Stornierung (manuell)', permission: 'tagesgeschaeft', group: 'Tagesgeschäft' },
  { type: 'auto_cancelled', label: 'Auto-Storno (Frist verpasst)', permission: 'tagesgeschaeft', group: 'Tagesgeschäft' },
  { type: 'new_damage', label: 'Schadensmeldung', permission: 'tagesgeschaeft', group: 'Tagesgeschäft' },
  { type: 'overdue_return', label: 'Überfällige Rückgabe', permission: 'tagesgeschaeft', group: 'Tagesgeschäft' },
  { type: 'availability_alert', label: 'Verfügbarkeits-Warnung', permission: 'tagesgeschaeft', group: 'Tagesgeschäft' },
  { type: 'pickup_coordination', label: 'Abholtermin vereinbaren', permission: 'tagesgeschaeft', group: 'Tagesgeschäft' },
  { type: 'return_coordination', label: 'Rückgabetermin vereinbaren', permission: 'tagesgeschaeft', group: 'Tagesgeschäft' },
  { type: 'return_arrived', label: 'Retoure eingetroffen', permission: 'tagesgeschaeft', group: 'Tagesgeschäft' },

  // ── Kunden & Kommunikation ────────────────────────────────
  { type: 'verification_pending', label: 'Ausweis-Verifizierung offen', permission: 'kunden', group: 'Kunden & Kommunikation' },
  { type: 'new_message', label: 'Neue Nachricht', permission: 'kunden', group: 'Kunden & Kommunikation' },
  { type: 'new_customer', label: 'Neuer Kunde', permission: 'kunden', group: 'Kunden & Kommunikation' },
  { type: 'new_review', label: 'Neue Bewertung', permission: 'kunden', group: 'Kunden & Kommunikation' },
  { type: 'new_waitlist', label: 'Warteliste-Eintrag', permission: 'kunden', group: 'Kunden & Kommunikation' },
  { type: 'new_ugc', label: 'Neues Kundenmaterial', permission: 'kunden', group: 'Kunden & Kommunikation' },

  // ── Finanzen ──────────────────────────────────────────────
  { type: 'payment_failed', label: 'Zahlungsproblem', permission: 'finanzen', group: 'Finanzen' },
  { type: 'adjustment_paid', label: 'Nachzahlung eingegangen', permission: 'finanzen', group: 'Finanzen' },
  { type: 'dunning_due', label: 'Mahnung fällig', permission: 'finanzen', group: 'Finanzen' },
  { type: 'coupon_race', label: 'Gutschein-Konflikt', permission: 'finanzen', group: 'Finanzen' },
  { type: 'beleg_ready', label: 'Beleg zum Prüfen', permission: 'finanzen', group: 'Finanzen' },
  { type: 'beleg_failed', label: 'Beleg-Analyse fehlgeschlagen', permission: 'finanzen', group: 'Finanzen' },
  { type: 'beleg_duplicate', label: 'Beleg-Duplikat-Verdacht', permission: 'finanzen', group: 'Finanzen' },

  // ── Content ───────────────────────────────────────────────
  { type: 'blog_ready', label: 'Blog-Artikel bereit', permission: 'content', group: 'Content' },
  { type: 'social_ready', label: 'Social-Post bereit', permission: 'content', group: 'Content' },
  { type: 'reel_ready', label: 'Reel bereit', permission: 'content', group: 'Content' },

  // ── Katalog ───────────────────────────────────────────────
  { type: 'firmware_update_available', label: 'Firmware-Update verfügbar', permission: 'katalog', group: 'Katalog' },

  // ── Berichte ──────────────────────────────────────────────
  { type: 'new_feedback', label: 'Neues Feedback', permission: 'berichte', group: 'Berichte' },
];

/** Schnell-Lookup Typ → Permission (Push-Filter). */
export const TYPE_TO_PERMISSION: Record<string, PermissionKey> = Object.fromEntries(
  NOTIFICATION_TYPES.filter((t) => t.permission).map((t) => [t.type, t.permission as PermissionKey]),
);

/** Alle bekannten Typ-Schluessel (fuer Validierung). */
export const NOTIFICATION_TYPE_KEYS: string[] = NOTIFICATION_TYPES.map((t) => t.type);

/**
 * Welche Notification-Typen sind fuer diesen Mitarbeiter ueberhaupt relevant?
 * Owner sehen alle; Mitarbeiter nur die zu ihren Permissions (plus Typen ohne
 * Permission, die an alle gehen).
 */
export function notificationTypesForUser(user: {
  role: 'owner' | 'employee';
  permissions: string[];
}): NotificationTypeDef[] {
  if (user.role === 'owner') return NOTIFICATION_TYPES;
  return NOTIFICATION_TYPES.filter(
    (t) => !t.permission || user.permissions.includes(t.permission),
  );
}
