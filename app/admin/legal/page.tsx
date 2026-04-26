'use client';

import LegalDocumentsContent from '@/components/admin/LegalDocumentsContent';

/**
 * Admin-Seite fuer die Rechtstext-Verwaltung (AGB, Datenschutz, Impressum,
 * Widerruf, Haftungsbedingungen). Frueher gab es hier zusaetzlich einen
 * Vertragsparagraphen-Tab — der ist jetzt nach /admin/einstellungen?tab=vertrag
 * umgezogen (Konsolidierung aller Settings).
 */
export default function AdminLegalPage() {
  return <LegalDocumentsContent />;
}
