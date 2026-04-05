'use client';

import { useState, useEffect, useCallback } from 'react';

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
  damage: 'Schaden',
  return: 'Retoure',
  label: 'Versandlabel',
  note: 'Notiz',
  review: 'Bewertung',
  blog: 'Blog',
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
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
  const [filterSearch, setFilterSearch] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  // Expanded row
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set('page', String(page));
    if (filterAction) params.set('action', filterAction);
    if (filterEntityType) params.set('entityType', filterEntityType);
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
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [page, filterAction, filterEntityType, filterSearch, filterDateFrom, filterDateTo]);

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
                        {formatDate(entry.created_at)}
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
                          {ACTION_LABELS[entry.action] || entry.action}
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
