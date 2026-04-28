'use client';

import { useState, useEffect, useCallback } from 'react';
import AdminBackLink from '@/components/admin/AdminBackLink';
import { fmtDateTime } from '@/lib/format-utils';

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
  'booking.update': 'Buchung aktualisiert',
  'booking.delete': 'Buchung endgültig gelöscht',
  'booking.email_updated': 'Kunden-E-Mail geändert',
  'booking.verification_gate': 'Verifizierungs-Gate',
  'booking.resend_payment_link': 'Zahlungs-Link erneut gesendet',
  // Kunden
  'customer.block': 'Kunde gesperrt',
  'customer.unblock': 'Kunde entsperrt',
  'customer.anonymize': 'Kunde anonymisiert',
  'customer.verify': 'Kunde verifiziert',
  'customer.reject_verification': 'Verifizierung abgelehnt',
  // Rechnungen/Buchhaltung
  'invoice.mark_paid': 'Rechnung als bezahlt markiert',
  'invoice.send': 'Rechnung versendet',
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
  // Einstellungen
  'settings.update': 'Einstellungen geändert',
  'env_mode.change': 'Test-/Live-Modus gewechselt',
  'email_template.update': 'E-Mail-Vorlage angepasst',
  'email_template.reset': 'E-Mail-Vorlage zurückgesetzt',
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
  const [filterAction, setFilterAction] = useState('');
  const [filterEntityType, setFilterEntityType] = useState('');
  const [filterAdmin, setFilterAdmin] = useState('');
  const [filterSearch, setFilterSearch] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  // Bekannte Admin-User fuer das Mitarbeiter-Filter-Dropdown
  const [availableAdmins, setAvailableAdmins] = useState<{ id: string; name: string }[]>([]);

  // Expanded row
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchEntries = useCallback(async () => {
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
      if (res.ok) {
        const data = await res.json();
        setEntries(data.entries);
        setTotal(data.total);
        setTotalPages(data.totalPages);
        if (Array.isArray(data.availableAdmins)) setAvailableAdmins(data.availableAdmins);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
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
    background: '#0f172a',
    border: '1px solid #1e293b',
    borderRadius: 12,
  };

  const inputStyle: React.CSSProperties = {
    background: '#1e293b',
    border: '1px solid #334155',
    borderRadius: 8,
    color: '#e2e8f0',
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
    background: '#06b6d4',
    color: '#0f172a',
    border: 'none',
    borderRadius: 8,
    padding: '8px 20px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  };

  const btnSecondary: React.CSSProperties = {
    background: 'transparent',
    color: '#94a3b8',
    border: '1px solid #334155',
    borderRadius: 8,
    padding: '8px 16px',
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
  };

  return (
    <div style={{ padding: '32px 24px', maxWidth: 1200, margin: '0 auto' }}>
      <AdminBackLink label="Zurück" />
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: '#f1f5f9', margin: 0 }}>
          Aktivitätsprotokoll
        </h1>
        <p style={{ color: '#64748b', fontSize: 14, marginTop: 4 }}>
          Alle administrativen Aktionen im Überblick ({total} Einträge gesamt)
        </p>
      </div>

      {/* Filters */}
      <div style={{ ...cardStyle, padding: 20, marginBottom: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginBottom: 12 }}>
          <div>
            <label style={{ display: 'block', fontSize: 11, color: '#64748b', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
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
            <label style={{ display: 'block', fontSize: 11, color: '#64748b', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
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
            <label style={{ display: 'block', fontSize: 11, color: '#64748b', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
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
            <label style={{ display: 'block', fontSize: 11, color: '#64748b', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
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
            <label style={{ display: 'block', fontSize: 11, color: '#64748b', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
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
            <label style={{ display: 'block', fontSize: 11, color: '#64748b', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
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
              <tr style={{ borderBottom: '1px solid #1e293b' }}>
                {['Zeitstempel', 'Admin', 'Aktion', 'Objekt', 'Details'].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: '12px 16px',
                      textAlign: 'left',
                      fontSize: 11,
                      fontWeight: 700,
                      color: '#64748b',
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
                  <td colSpan={5} style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>
                    Lade Einträge...
                  </td>
                </tr>
              ) : entries.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>
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
                        borderBottom: '1px solid #1e293b',
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
                      <td style={{ padding: '10px 16px', color: '#94a3b8', whiteSpace: 'nowrap' }}>
                        {fmtDateTime(entry.created_at)}
                      </td>
                      <td style={{ padding: '10px 16px', color: '#cbd5e1' }}>
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
                            background: 'rgba(6,182,212,0.15)',
                            color: '#06b6d4',
                          }}
                        >
                          {humanizeAction(entry.action)}
                        </span>
                      </td>
                      <td style={{ padding: '10px 16px', color: '#cbd5e1' }}>
                        <span style={{ color: '#64748b', fontSize: 11, marginRight: 4 }}>
                          {ENTITY_LABELS[entry.entity_type] || entry.entity_type}
                        </span>
                        {entry.entity_label || entry.entity_id || ''}
                      </td>
                      <td style={{ padding: '10px 16px', color: '#64748b', maxWidth: 200 }}>
                        {detailsStr ? truncate(detailsStr, 60) : '–'}
                        {isExpanded && entry.details && (
                          <div
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              marginTop: 8,
                              padding: 12,
                              background: '#0a0f1e',
                              border: '1px solid #1e293b',
                              borderRadius: 8,
                              fontSize: 12,
                              fontFamily: 'monospace',
                              color: '#94a3b8',
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
              borderTop: '1px solid #1e293b',
            }}
          >
            <span style={{ fontSize: 12, color: '#64748b' }}>
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
