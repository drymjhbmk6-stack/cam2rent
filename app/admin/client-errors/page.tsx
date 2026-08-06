'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import AdminBackLink from '@/components/admin/AdminBackLink';
import { fmtDateTime } from '@/lib/format-utils';
import { usePersistentState } from '@/lib/use-persistent-state';
import { PageHeader } from '@/components/admin/ui';
import { useToast, useConfirm } from '@/components/admin/ui/FeedbackProvider';

interface ClientError {
  id: string;
  digest: string | null;
  message: string | null;
  stack: string | null;
  url: string | null;
  user_agent: string | null;
  user_id: string | null;
  is_admin: boolean;
  ip_address: string | null;
  context: Record<string, unknown> | null;
  is_test: boolean;
  created_at: string;
}

const cardStyle: React.CSSProperties = {
  background: 'var(--admin-surface)',
  border: '1px solid var(--admin-border)',
  borderRadius: 12,
};

const inputStyle: React.CSSProperties = {
  background: 'var(--admin-input-bg)',
  border: '1px solid var(--admin-input-border)',
  borderRadius: 8,
  color: 'var(--admin-text)',
  padding: '8px 12px',
  fontSize: 13,
  outline: 'none',
  width: '100%',
};

const btnPrimary: React.CSSProperties = {
  background: 'var(--admin-accent)',
  color: '#fff',
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
  border: '1px solid var(--admin-border)',
  borderRadius: 8,
  padding: '8px 16px',
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
};

const btnDanger: React.CSSProperties = {
  ...btnSecondary,
  color: 'var(--admin-danger)',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  color: 'var(--admin-text-dim)',
  marginBottom: 4,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
};

function shortenUrl(url: string | null): string {
  if (!url) return '—';
  try {
    const u = new URL(url);
    return u.pathname + u.search;
  } catch {
    return url;
  }
}

export default function ClientErrorsPage() {
  const { success, error: toastError } = useToast();
  const confirm = useConfirm();
  const [entries, setEntries] = useState<ClientError[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [migrationPending, setMigrationPending] = useState(false);

  const [search, setSearch] = usePersistentState('admin:client-errors:search', '');
  const [searchInput, setSearchInput] = usePersistentState('admin:client-errors:searchInput', '');
  const [dateFrom, setDateFrom] = usePersistentState('admin:client-errors:dateFrom', '');
  const [dateTo, setDateTo] = usePersistentState('admin:client-errors:dateTo', '');
  const [onlyAdmin, setOnlyAdmin] = usePersistentState('admin:client-errors:onlyAdmin', false);

  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Stale-Response-Guard: nur die jeweils letzte Anfrage darf State setzen.
  const reqIdRef = useRef(0);

  const fetchEntries = useCallback(async () => {
    const myId = ++reqIdRef.current;
    setLoading(true);
    const params = new URLSearchParams();
    params.set('page', String(page));
    if (search) params.set('search', search);
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);
    if (onlyAdmin) params.set('onlyAdmin', '1');

    try {
      const res = await fetch(`/api/admin/client-errors?${params.toString()}`);
      if (myId !== reqIdRef.current) return;
      if (res.ok) {
        const data = await res.json();
        if (myId !== reqIdRef.current) return;
        setEntries(data.entries ?? []);
        setTotal(data.total ?? 0);
        setTotalPages(data.totalPages ?? 1);
        setMigrationPending(!!data.migrationPending);
      }
    } catch {
      // silent
    } finally {
      if (myId === reqIdRef.current) setLoading(false);
    }
  }, [page, search, dateFrom, dateTo, onlyAdmin]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  function handleApplySearch() {
    setSearch(searchInput);
    setPage(1);
  }

  function handleReset() {
    setSearch('');
    setSearchInput('');
    setDateFrom('');
    setDateTo('');
    setOnlyAdmin(false);
    setPage(1);
  }

  async function handleDelete(id: string) {
    const ok = await confirm({ title: 'Eintrag löschen', message: 'Diesen Eintrag löschen?', confirmLabel: 'Löschen', danger: true });
    if (!ok) return;
    const res = await fetch(`/api/admin/client-errors?id=${id}`, { method: 'DELETE' });
    if (res.ok) {
      fetchEntries();
      success('Eintrag gelöscht.');
    } else {
      toastError('Löschen fehlgeschlagen.');
    }
  }

  async function handleDeleteOld() {
    const days = prompt('Einträge älter als wie viele Tage löschen?', '30');
    if (!days) return;
    const n = parseInt(days, 10);
    if (!n || n < 1) return;
    const ok = await confirm({ title: 'Alte Einträge löschen', message: `Alle Einträge älter als ${n} Tage endgültig löschen?`, confirmLabel: 'Löschen', danger: true });
    if (!ok) return;
    const res = await fetch(`/api/admin/client-errors?olderThanDays=${n}`, { method: 'DELETE' });
    if (res.ok) {
      const data = await res.json();
      success(`${data.deleted} Einträge gelöscht.`);
      fetchEntries();
    }
  }

  return (
    <div style={{ padding: '32px 24px', maxWidth: 1200, margin: '0 auto' }}>
      <AdminBackLink label="Zurück" />
      <PageHeader
        title="Frontend-Fehlerprotokoll"
        subtitle={`JavaScript-Fehler aus dem Browser des Kunden (${total} Einträge gesamt)`}
      />

      {migrationPending && (
        <div style={{ ...cardStyle, padding: 16, marginBottom: 20, borderColor: 'rgba(245,158,11,0.35)', background: 'rgba(245,158,11,0.12)' }}>
          <div style={{ color: '#f59e0b', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
            Migration ausstehend
          </div>
          <div style={{ color: 'var(--admin-text-2)', fontSize: 12 }}>
            Die Tabelle <code style={{ fontFamily: 'monospace' }}>client_errors</code> existiert noch nicht.
            Bitte SQL-Migration <code style={{ fontFamily: 'monospace' }}>supabase/supabase-client-errors.sql</code> ausführen.
          </div>
        </div>
      )}

      <div style={{ ...cardStyle, padding: 20, marginBottom: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginBottom: 12 }}>
          <div>
            <label style={labelStyle}>Suche</label>
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleApplySearch(); }}
              placeholder="Nachricht, URL, Digest"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Von</label>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Bis</label>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={inputStyle} />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--admin-text-2)', fontSize: 13, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={onlyAdmin}
                onChange={(e) => setOnlyAdmin(e.target.checked)}
              />
              Nur Admin-Bereich
            </label>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={handleApplySearch} style={btnPrimary}>Filtern</button>
          <button onClick={handleReset} style={btnSecondary}>Zurücksetzen</button>
          <div style={{ flex: 1 }} />
          <button onClick={handleDeleteOld} style={btnDanger}>Alte Einträge löschen…</button>
        </div>
      </div>

      <div style={{ ...cardStyle, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--admin-muted)' }}>Laden…</div>
        ) : entries.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--admin-muted)' }}>
            {migrationPending ? 'Tabelle existiert noch nicht.' : 'Keine Einträge gefunden.'}
          </div>
        ) : (
          <div>
            {entries.map((e) => {
              const expanded = expandedId === e.id;
              return (
                <div key={e.id} style={{ borderBottom: '1px solid var(--admin-border)' }}>
                  <div
                    onClick={() => setExpandedId(expanded ? null : e.id)}
                    style={{
                      padding: '14px 20px',
                      cursor: 'pointer',
                      display: 'grid',
                      gridTemplateColumns: '160px 1fr auto',
                      gap: 16,
                      alignItems: 'center',
                    }}
                  >
                    <div style={{ fontSize: 12, color: 'var(--admin-muted)', fontFamily: 'monospace' }}>
                      {fmtDateTime(e.created_at)}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: 'var(--admin-text)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {e.message || '(ohne Nachricht)'}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--admin-text-dim)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {shortenUrl(e.url)}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      {e.is_admin && (
                        <span style={{ fontSize: 10, padding: '2px 6px', background: 'rgba(59,130,246,0.15)', color: '#60a5fa', borderRadius: 4, fontWeight: 600 }}>
                          ADMIN
                        </span>
                      )}
                      {e.is_test && (
                        <span style={{ fontSize: 10, padding: '2px 6px', background: 'rgba(236,72,153,0.15)', color: '#ec4899', borderRadius: 4, fontWeight: 600 }}>
                          TEST
                        </span>
                      )}
                      <span style={{ fontSize: 14, color: 'var(--admin-text-dim)' }}>{expanded ? '▾' : '▸'}</span>
                    </div>
                  </div>

                  {expanded && (
                    <div style={{ padding: '0 20px 20px', display: 'grid', gap: 12 }}>
                      <DetailRow label="Fehler-ID (Digest)" value={e.digest} mono />
                      <DetailRow label="Vollständige URL" value={e.url} mono />
                      <DetailRow label="Nachricht" value={e.message} mono />
                      {e.stack && (
                        <div>
                          <div style={{ fontSize: 11, color: 'var(--admin-text-dim)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>
                            Stack-Trace
                          </div>
                          <pre style={{
                            margin: 0,
                            padding: 12,
                            background: 'var(--admin-input-bg)',
                            border: '1px solid var(--admin-border)',
                            borderRadius: 6,
                            fontSize: 11,
                            color: 'var(--admin-text-2)',
                            fontFamily: 'monospace',
                            overflow: 'auto',
                            maxHeight: 320,
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                          }}>
                            {e.stack}
                          </pre>
                        </div>
                      )}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                        <DetailRow label="User-Agent" value={e.user_agent} mono />
                        <DetailRow label="IP-Adresse" value={e.ip_address} mono />
                        <DetailRow label="User-ID" value={e.user_id} mono />
                        <DetailRow label="Kontext" value={e.context ? JSON.stringify(e.context) : null} mono />
                      </div>
                      <div>
                        <button onClick={() => handleDelete(e.id)} style={btnDanger}>Eintrag löschen</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 20, alignItems: 'center' }}>
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} style={btnSecondary}>
            ← Zurück
          </button>
          <span style={{ color: 'var(--admin-muted)', fontSize: 13 }}>
            Seite {page} von {totalPages}
          </span>
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} style={btnSecondary}>
            Weiter →
          </button>
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string | null; mono?: boolean }) {
  if (!value) return null;
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--admin-text-dim)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>
        {label}
      </div>
      <div style={{
        fontSize: 12,
        color: 'var(--admin-text-2)',
        fontFamily: mono ? 'monospace' : undefined,
        wordBreak: 'break-all',
      }}>
        {value}
      </div>
    </div>
  );
}
