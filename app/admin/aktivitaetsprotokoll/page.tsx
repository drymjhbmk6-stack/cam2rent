'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { PageHeader } from '@/components/admin/ui';
import { fmtDateTime } from '@/lib/format-utils';
import { usePersistentState } from '@/lib/use-persistent-state';

interface AuditEntry {
  id: string;
  admin_user_id: string | null;
  admin_user_name: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  entity_label: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

const ACTION_LABELS: Record<string, string> = {
  // Buchungen
  'booking.cancel': 'Buchung storniert',
  'booking.resend_cancellation': 'Storno-Doku erneut gesendet',
  'booking.update': 'Buchung aktualisiert',
  'booking.accessory_edit': 'Zubehör der Buchung bearbeitet',
  'booking.edit': 'Bestellung bearbeitet (Zeitraum/Kamera/Zubehör/Haftung)',
  'booking.postpone': 'Buchung verlegt',
  'booking.delete': 'Buchung endgültig gelöscht',
  'booking.email_updated': 'Kunden-E-Mail geändert',
  'booking.tracking_update': 'Tracking-Daten geändert',
  'booking.link_shipment': 'Mit Bestellung für gemeinsamen Versand verknüpft',
  'booking.unlink_shipment': 'Versand-Verknüpfung gelöst',
  'booking.coordination_done': 'Abhol-/Rückgabetermin vereinbart',
  'return_open_item.resolve': 'Offene Rückgabe-Position erledigt',
  'booking.reset_contract': 'Mietvertrag zurückgesetzt (Neu-Unterschrift)',
  'booking.lock_contract': 'Mietvertrag freigegeben („Alles okay", endgültig)',
  'booking.verification_gate': 'Verifizierungs-Gate',
  'booking.resend_payment_link': 'Zahlungs-Link erneut gesendet',
  'booking.mark_paid': 'Als bezahlt markiert',
  'booking.mark_unpaid': 'Als unbezahlt markiert',
  'booking.wbw_finalize': 'Wiederbeschaffungswerte finalisiert',
  'booking.wbw_resend': 'WBW-E-Mail erneut gesendet',
  'booking.invoice_version': 'Rechnungsfassung archiviert',
  'booking.invoice_send': 'Angepasste Rechnung an Kunden gesendet',
  'booking.billing_address': 'Abweichende Rechnungsadresse geändert',
  // Schäden
  'damage.create': 'Schadensmeldung erfasst',
  'damage.confirm': 'Schaden bestätigt',
  'damage.resolve': 'Schaden gelöst',
  'damage.update': 'Schadensmeldung aktualisiert',
  // Kunden
  'customer.block': 'Kunde gesperrt',
  'customer.unblock': 'Kunde entsperrt',
  'customer.anonymize': 'Kunde anonymisiert',
  'customer.delete': 'Kunde gelöscht (DSGVO)',
  'customer.verify': 'Kunde verifiziert',
  'customer.reject_verification': 'Verifizierung abgelehnt',
  'customer.verification_reminder': 'Verifizierungs-Erinnerung gesendet',
  'customer.set_tester': 'Als Tester-Konto markiert',
  'customer.unset_tester': 'Tester-Status entfernt',
  'customer.reset_tester': 'Tester-Konto zurückgesetzt',
  'customer.auto_delete_unverified': 'Konto auto-gelöscht (unverifiziert)',
  'customer.auto_deactivate': 'Konto auto-deaktiviert (inaktiv)',
  'customer.reactivate': 'Konto reaktiviert',
  'customer.set_special_discount': 'Sonderkondition gesetzt',
  'customer.unset_special_discount': 'Sonderkondition entfernt',
  'customer.update': 'Kundendaten bearbeitet',
  // Rechnungen/Buchhaltung
  'invoice.mark_paid': 'Rechnung als bezahlt markiert',
  'invoice.send': 'Rechnung versendet',
  'invoice.backfill': 'Rechnungen nachgetragen (Backfill)',
  'invoice.sync_status': 'Rechnungs-Status mit Buchungs-Status synchronisiert',
  'credit_note.create_draft': 'Gutschrift-Entwurf erstellt',
  'credit_note.approve': 'Gutschrift freigegeben',
  'credit_note.reject': 'Gutschrift abgelehnt',
  'dunning.create_draft': 'Mahn-Entwurf erstellt',
  'dunning.send': 'Mahnung versendet',
  // Ausgaben
  'expense.create': 'Ausgabe erfasst',
  'expense.update': 'Ausgabe aktualisiert',
  'expense.delete': 'Ausgabe gelöscht',
  // Stripe
  'stripe.sync_run': 'Stripe-Sync ausgeführt',
  'stripe.manual_match': 'Stripe manuell verknüpft',
  'stripe.import_fees': 'Stripe-Gebühren importiert',
  'stripe.refund': 'Stripe-Erstattung erfasst',
  'stripe.mark_duplicate': 'Stripe-Doppelzahlung markiert',
  // Reels
  'reel.generate': 'Reel generiert',
  'reel.update': 'Reel aktualisiert',
  'reel.approve': 'Reel freigegeben',
  'reel.publish': 'Reel veröffentlicht',
  'reel.rerender': 'Reel neu gerendert',
  'reel.delete': 'Reel gelöscht',
  // Kundenmaterial (UGC)
  'ugc.approve': 'Kundenmaterial freigegeben',
  'ugc.reject': 'Kundenmaterial abgelehnt',
  'ugc.feature': 'Kundenmaterial veröffentlicht',
  'ugc.update': 'Kundenmaterial aktualisiert',
  'ugc.delete': 'Kundenmaterial gelöscht',
  // Newsletter
  'newsletter.send_campaign': 'Newsletter-Kampagne versendet',
  'newsletter.update_subscriber': 'Newsletter-Abonnent geändert',
  'newsletter.delete_subscriber': 'Newsletter-Abonnent gelöscht',
  'customer_push.send': 'Push an Kunden gesendet',
  // Nachrichten / Konversationen
  'nachricht.start': 'Nachricht an Kunden initiiert',
  'nachricht.reply': 'Auf Kundennachricht geantwortet',
  'nachricht.email_reply': 'Per E-Mail auf Kundenanfrage geantwortet',
  'inbound_email.received': 'Kunden-E-Mail empfangen',
  'nachricht.close': 'Konversation geschlossen',
  'nachricht.reopen': 'Konversation wieder geöffnet',
  'nachricht.delete': 'Konversation gelöscht',
  'nachricht.bulk_delete': 'Mehrere Konversationen gelöscht',
  // Einstellungen
  'settings.update': 'Einstellungen geändert',
  'env_mode.change': 'Test-/Live-Modus gewechselt',
  'email_template.update': 'E-Mail-Vorlage angepasst',
  'email_template.reset': 'E-Mail-Vorlage zurückgesetzt',
  'availability_alert.resolve': 'Verfügbarkeits-Alert als erledigt markiert',
  'availability_alert.reopen': 'Verfügbarkeits-Alert wieder geöffnet',
  // Firmware-Check
  'firmware.check_run': 'Firmware-Check (alle Kameras) ausgeführt',
  'firmware.check_one': 'Firmware-Check (eine Kamera) ausgeführt',
  'firmware.mark_seen': 'Firmware-Version als gesehen markiert',
  // Verbrauchsmaterial
  'verbrauch.create': 'Verbrauchsartikel angelegt',
  'verbrauch.update': 'Verbrauchsartikel bearbeitet',
  'verbrauch.adjust': 'Verbrauchsbestand angepasst',
  'verbrauch.delete': 'Verbrauchsartikel gelöscht',
  // Legacy (Unterstrich-Namen, falls noch im Bestand)
  booking_cancelled: 'Buchung storniert',
  booking_confirmed: 'Buchung bestätigt',
  booking_updated: 'Buchung aktualisiert',
  customer_blocked: 'Kunde gesperrt',
  customer_unblocked: 'Kunde entsperrt',
  customer_anonymized: 'Kunde anonymisiert',
  price_changed: 'Preis geändert',
  product_created: 'Produkt erstellt',
  product_updated: 'Produkt aktualisiert',
  product_deleted: 'Produkt gelöscht',
  set_created: 'Set erstellt',
  set_updated: 'Set aktualisiert',
  set_deleted: 'Set gelöscht',
  coupon_created: 'Gutschein erstellt',
  coupon_updated: 'Gutschein aktualisiert',
  coupon_deleted: 'Gutschein gelöscht',
  discount_created: 'Rabatt erstellt',
  discount_updated: 'Rabatt aktualisiert',
  discount_deleted: 'Rabatt gelöscht',
  settings_changed: 'Einstellungen geändert',
  damage_reported: 'Schaden gemeldet',
  return_completed: 'Retoure abgeschlossen',
  label_created: 'Label erstellt',
  note_added: 'Notiz hinzugefügt',
  review_published: 'Bewertung veröffentlicht',
  review_hidden: 'Bewertung ausgeblendet',
  blog_published: 'Blogbeitrag veröffentlicht',
};

const ENTITY_LABELS: Record<string, string> = {
  booking: 'Buchung',
  customer: 'Kunde',
  product: 'Produkt',
  set: 'Set',
  coupon: 'Gutschein',
  discount: 'Rabatt',
  accessory: 'Zubehör',
  settings: 'Einstellungen',
  env_mode: 'Test-/Live-Modus',
  damage: 'Schaden',
  return: 'Retoure',
  label: 'Versandlabel',
  note: 'Notiz',
  review: 'Bewertung',
  blog: 'Blog',
  invoice: 'Rechnung',
  credit_note: 'Gutschrift',
  dunning: 'Mahnung',
  expense: 'Ausgabe',
  stripe: 'Stripe',
  reel: 'Reel',
  customer_ugc: 'Kundenmaterial',
  email_template: 'E-Mail-Vorlage',
  availability_alert: 'Verfügbarkeits-Alert',
  firmware_check: 'Firmware-Check',
  verbrauchsartikel: 'Verbrauchsmaterial',
  nachricht: 'Konversation',
};

function humanizeAction(action: string): string {
  if (ACTION_LABELS[action]) return ACTION_LABELS[action];
  // Fallback: dotted naming z.B. "foo.bar_baz" → "foo · bar baz"
  const [entity, verb] = action.includes('.') ? action.split('.') : [null, action];
  const pretty = (verb || action).replace(/_/g, ' ');
  return entity ? `${entity} · ${pretty}` : pretty;
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max) + '...' : str;
}

export default function AktivitaetsprotokollPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  // Filters
  const [filterAction, setFilterAction] = usePersistentState('admin:aktivitaetsprotokoll:action', '');
  const [filterEntityType, setFilterEntityType] = usePersistentState('admin:aktivitaetsprotokoll:entityType', '');
  const [filterAdmin, setFilterAdmin] = usePersistentState('admin:aktivitaetsprotokoll:admin', '');
  const [filterSearch, setFilterSearch] = usePersistentState('admin:aktivitaetsprotokoll:search', '');
  const [filterDateFrom, setFilterDateFrom] = usePersistentState('admin:aktivitaetsprotokoll:dateFrom', '');
  const [filterDateTo, setFilterDateTo] = usePersistentState('admin:aktivitaetsprotokoll:dateTo', '');

  // Bekannte Admin-User fuer das Mitarbeiter-Filter-Dropdown
  const [availableAdmins, setAvailableAdmins] = useState<{ id: string; name: string }[]>([]);

  // Expanded row
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Stale-Response-Guard: nur die jeweils letzte Anfrage darf State setzen.
  const reqIdRef = useRef(0);

  const fetchEntries = useCallback(async () => {
    const myId = ++reqIdRef.current;
    setLoading(true);
    const params = new URLSearchParams();
    params.set('page', String(page));
    if (filterAction) params.set('action', filterAction);
    if (filterEntityType) params.set('entityType', filterEntityType);
    if (filterAdmin) params.set('adminUserId', filterAdmin);
    if (filterSearch) params.set('search', filterSearch);
    if (filterDateFrom) params.set('dateFrom', filterDateFrom);
    if (filterDateTo) params.set('dateTo', filterDateTo);

    try {
      const res = await fetch(`/api/admin/audit-log?${params.toString()}`);
      if (myId !== reqIdRef.current) return;
      if (res.ok) {
        const data = await res.json();
        if (myId !== reqIdRef.current) return;
        setEntries(data.entries);
        setTotal(data.total);
        setTotalPages(data.totalPages);
        if (Array.isArray(data.availableAdmins)) setAvailableAdmins(data.availableAdmins);
      }
    } catch {
      // silent
    } finally {
      if (myId === reqIdRef.current) setLoading(false);
    }
  }, [page, filterAction, filterEntityType, filterAdmin, filterSearch, filterDateFrom, filterDateTo]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  function handleFilter() {
    setPage(1);
    fetchEntries();
  }

  function handleReset() {
    setFilterAction('');
    setFilterEntityType('');
    setFilterAdmin('');
    setFilterSearch('');
    setFilterDateFrom('');
    setFilterDateTo('');
    setPage(1);
  }

  // Collect unique actions and entity types for dropdowns
  const actionOptions = Object.keys(ACTION_LABELS);
  const entityOptions = Object.keys(ENTITY_LABELS);

  const cardStyle: React.CSSProperties = {
    background: 'var(--admin-surface)',
    border: '1px solid var(--admin-border)',
    borderRadius: 12,
  };

  const inputStyle: React.CSSProperties = {
    background: 'var(--admin-surface-2)',
    border: '1px solid var(--admin-input-border)',
    borderRadius: 8,
    color: 'var(--admin-text)',
    padding: '8px 12px',
    fontSize: 13,
    outline: 'none',
    width: '100%',
  };

  const selectStyle: React.CSSProperties = {
    ...inputStyle,
    cursor: 'pointer',
    appearance: 'none' as const,
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 10px center',
    paddingRight: 32,
  };

  const btnPrimary: React.CSSProperties = {
    background: 'var(--admin-accent)',
    color: 'var(--admin-primary-text)',
    border: 'none',
    borderRadius: 8,
    padding: '8px 20px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  };

  const btnSecondary: React.CSSProperties = {
    background: 'transparent',
    color: 'var(--admin-muted)',
    border: '1px solid var(--admin-faint)',
    borderRadius: 8,
    padding: '8px 16px',
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
  };

  return (
    <div style={{ padding: '32px 24px', maxWidth: 1200, margin: '0 auto', color: 'var(--admin-text)' }}>
      <PageHeader
        backLabel="Zurück"
        title="Aktivitätsprotokoll"
        subtitle={`Alle administrativen Aktionen im Überblick (${total} Einträge gesamt)`}
      />

      {/* Filters */}
      <div style={{ ...cardStyle, padding: 20, marginBottom: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginBottom: 12 }}>
          <div>
            <label style={{ display: 'block', fontSize: 11, color: 'var(--admin-text-dim)', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Aktionstyp
            </label>
            <select
              value={filterAction}
              onChange={(e) => setFilterAction(e.target.value)}
              style={selectStyle}
            >
              <option value="">Alle Aktionen</option>
              {actionOptions.map((a) => (
                <option key={a} value={a}>{ACTION_LABELS[a]}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, color: 'var(--admin-text-dim)', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Objekttyp
            </label>
            <select
              value={filterEntityType}
              onChange={(e) => setFilterEntityType(e.target.value)}
              style={selectStyle}
            >
              <option value="">Alle Typen</option>
              {entityOptions.map((e) => (
                <option key={e} value={e}>{ENTITY_LABELS[e]}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, color: 'var(--admin-text-dim)', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Mitarbeiter
            </label>
            <select
              value={filterAdmin}
              onChange={(e) => setFilterAdmin(e.target.value)}
              style={selectStyle}
            >
              <option value="">Alle Mitarbeiter</option>
              {availableAdmins.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}{a.id === 'legacy-env' ? ' (Master-Passwort)' : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, color: 'var(--admin-text-dim)', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Suche
            </label>
            <input
              type="text"
              placeholder="Name, Label, ID..."
              value={filterSearch}
              onChange={(e) => setFilterSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleFilter()}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, color: 'var(--admin-text-dim)', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Datum von
            </label>
            <input
              type="date"
              value={filterDateFrom}
              onChange={(e) => setFilterDateFrom(e.target.value)}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, color: 'var(--admin-text-dim)', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Datum bis
            </label>
            <input
              type="date"
              value={filterDateTo}
              onChange={(e) => setFilterDateTo(e.target.value)}
              style={inputStyle}
            />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={handleFilter} style={btnPrimary}>Filtern</button>
          <button onClick={handleReset} style={btnSecondary}>Zurücksetzen</button>
        </div>
      </div>

      {/* Table */}
      <div style={{ ...cardStyle, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--admin-border)' }}>
                {['Zeitstempel', 'Admin', 'Aktion', 'Objekt', 'Details'].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: '12px 16px',
                      textAlign: 'left',
                      fontSize: 11,
                      fontWeight: 700,
                      color: 'var(--admin-text-dim)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} style={{ padding: 40, textAlign: 'center', color: 'var(--admin-text-dim)' }}>
                    Lade Einträge...
                  </td>
                </tr>
              ) : entries.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: 40, textAlign: 'center', color: 'var(--admin-text-dim)' }}>
                    Keine Einträge gefunden.
                  </td>
                </tr>
              ) : (
                entries.map((entry) => {
                  const isExpanded = expandedId === entry.id;
                  const detailsStr = entry.details ? JSON.stringify(entry.details) : '';
                  return (
                    <tr
                      key={entry.id}
                      onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                      style={{
                        borderBottom: '1px solid var(--admin-border)',
                        cursor: entry.details ? 'pointer' : 'default',
                        background: isExpanded ? 'rgba(6,182,212,0.05)' : 'transparent',
                        transition: 'background 0.15s',
                      }}
                      onMouseEnter={(e) => {
                        if (!isExpanded) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.02)';
                      }}
                      onMouseLeave={(e) => {
                        if (!isExpanded) (e.currentTarget as HTMLElement).style.background = 'transparent';
                      }}
                    >
                      <td style={{ padding: '10px 16px', color: 'var(--admin-muted)', whiteSpace: 'nowrap' }}>
                        {fmtDateTime(entry.created_at)}
                      </td>
                      <td style={{ padding: '10px 16px', color: 'var(--admin-text-2)' }}>
                        {entry.admin_user_name || '–'}
                      </td>
                      <td style={{ padding: '10px 16px' }}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '2px 8px',
                            borderRadius: 6,
                            fontSize: 12,
                            fontWeight: 600,
                            background: 'var(--admin-accent-soft)',
                            color: 'var(--admin-accent)',
                          }}
                        >
                          {humanizeAction(entry.action)}
                        </span>
                      </td>
                      <td style={{ padding: '10px 16px', color: 'var(--admin-text-2)' }}>
                        <span style={{ color: 'var(--admin-text-dim)', fontSize: 11, marginRight: 4 }}>
                          {ENTITY_LABELS[entry.entity_type] || entry.entity_type}
                        </span>
                        {entry.entity_label || entry.entity_id || ''}
                      </td>
                      <td style={{ padding: '10px 16px', color: 'var(--admin-text-dim)', maxWidth: 200 }}>
                        {detailsStr ? truncate(detailsStr, 60) : '–'}
                        {isExpanded && entry.details && (
                          <div
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              marginTop: 8,
                              padding: 12,
                              background: 'var(--admin-input-bg)',
                              border: '1px solid var(--admin-border)',
                              borderRadius: 8,
                              fontSize: 12,
                              fontFamily: 'monospace',
                              color: 'var(--admin-muted)',
                              whiteSpace: 'pre-wrap',
                              wordBreak: 'break-all',
                              maxHeight: 300,
                              overflowY: 'auto',
                            }}
                          >
                            {JSON.stringify(entry.details, null, 2)}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 16px',
              borderTop: '1px solid var(--admin-border)',
            }}
          >
            <span style={{ fontSize: 12, color: 'var(--admin-text-dim)' }}>
              Seite {page} von {totalPages} ({total} Einträge)
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                style={{
                  ...btnSecondary,
                  padding: '6px 14px',
                  opacity: page <= 1 ? 0.4 : 1,
                  cursor: page <= 1 ? 'not-allowed' : 'pointer',
                }}
              >
                Zurück
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                style={{
                  ...btnSecondary,
                  padding: '6px 14px',
                  opacity: page >= totalPages ? 0.4 : 1,
                  cursor: page >= totalPages ? 'not-allowed' : 'pointer',
                }}
              >
                Weiter
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
