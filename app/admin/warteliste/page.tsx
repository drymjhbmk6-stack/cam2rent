'use client';

import { useEffect, useState } from 'react';
import AdminBackLink from '@/components/admin/AdminBackLink';
import { fmtDateTime } from '@/lib/format-utils';
import { getCached, setCached } from '@/lib/use-cached-fetch';
import { PageHeader, Card, Button, EmptyState, TableSkeleton, DataTable, type DataTableColumn } from '@/components/admin/ui';
import { useToast, useConfirm } from '@/components/admin/ui/FeedbackProvider';

const WAITLIST_CACHE_KEY = 'admin:waitlist';

interface WaitlistEntry {
  id: string;
  product_id: string;
  product_name: string;
  email: string;
  source: string | null;
  use_case: string | null;
  created_at: string;
  notified_at: string | null;
}

const SOURCE_LABELS: Record<string, string> = {
  card: 'Produktkarte',
  detail: 'Detailseite',
};

function sourceLabel(source: string | null): string {
  if (!source) return '—';
  return SOURCE_LABELS[source] ?? source;
}

export default function Warteliste() {
  const { success, error: toastError } = useToast();
  const confirm = useConfirm();
  const [entries, setEntries] = useState<WaitlistEntry[]>(() => getCached<WaitlistEntry[]>(WAITLIST_CACHE_KEY) ?? []);
  const [loading, setLoading] = useState(() => getCached<WaitlistEntry[]>(WAITLIST_CACHE_KEY) === undefined);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    // Spinner nur beim ersten Laden (kein Cache) — Wiederbesuch zeigt sofort.
    if (getCached<WaitlistEntry[]>(WAITLIST_CACHE_KEY) === undefined) setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/waitlist');
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Fehler beim Laden.');
      setEntries(data.entries ?? []);
      setCached(WAITLIST_CACHE_KEY, data.entries ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unbekannter Fehler.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleDelete(id: string) {
    const ok = await confirm({
      title: 'Eintrag löschen',
      message: 'Eintrag wirklich löschen?',
      confirmLabel: 'Löschen',
      danger: true,
    });
    if (!ok) return;
    const res = await fetch(`/api/admin/waitlist?id=${id}`, { method: 'DELETE' });
    if (res.ok) {
      setEntries((prev) => prev.filter((e) => e.id !== id));
      success('Eintrag gelöscht.');
    } else {
      toastError('Löschen fehlgeschlagen.');
    }
  }

  // Gruppierung nach Produkt (für schnelle Übersicht)
  const grouped = entries.reduce<Record<string, WaitlistEntry[]>>((acc, entry) => {
    const key = entry.product_name;
    if (!acc[key]) acc[key] = [];
    acc[key].push(entry);
    return acc;
  }, {});

  const productGroups = Object.entries(grouped).sort((a, b) => b[1].length - a[1].length);

  const columns: DataTableColumn<WaitlistEntry>[] = [
    {
      key: 'email',
      header: 'E-Mail',
      sortValue: (e) => e.email,
      render: (e) => (
        <a href={`mailto:${e.email}`} style={{ color: 'var(--admin-accent)', wordBreak: 'break-all' }}>
          {e.email}
        </a>
      ),
    },
    {
      key: 'use_case',
      header: 'Nutzung',
      render: (e) =>
        e.use_case ? (
          <span style={{ display: 'inline-block', padding: '2px 9px', borderRadius: 999, background: 'var(--admin-hover)', color: 'var(--admin-text-2)', fontSize: 12 }}>
            {e.use_case}
          </span>
        ) : (
          <span style={{ color: 'var(--admin-muted-2)' }}>—</span>
        ),
    },
    { key: 'source', header: 'Quelle', hideBelow: 'md', render: (e) => <span style={{ color: 'var(--admin-muted)' }}>{sourceLabel(e.source)}</span> },
    {
      key: 'created_at',
      header: 'Eingetragen',
      hideBelow: 'md',
      sortValue: (e) => e.created_at,
      render: (e) => <span style={{ color: 'var(--admin-text-2)' }}>{fmtDateTime(e.created_at)}</span>,
    },
    {
      key: 'notified_at',
      header: 'Benachrichtigt',
      hideBelow: 'lg',
      render: (e) => <span style={{ color: 'var(--admin-muted)' }}>{e.notified_at ? fmtDateTime(e.notified_at) : '—'}</span>,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (e) => (
        <Button variant="ghost" size="sm" onClick={() => handleDelete(e.id)} style={{ color: 'var(--admin-danger)' }}>
          Löschen
        </Button>
      ),
    },
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <AdminBackLink />

      <PageHeader
        title="Warteliste"
        subtitle="Interessenten für Kameras, die noch keine Seriennummer im Bestand haben."
        actions={
          <Button variant="secondary" size="sm" onClick={load}>
            Aktualisieren
          </Button>
        }
      />

      {loading && <TableSkeleton rows={6} />}
      {error && <p style={{ color: 'var(--admin-danger)' }}>{error}</p>}

      {!loading && !error && entries.length === 0 && (
        <Card>
          <EmptyState
            title="Noch keine Einträge"
            description="Sobald eine Kamera ohne Seriennummer angelegt ist und sich Interessenten eintragen, erscheinen sie hier."
          />
        </Card>
      )}

      {!loading && !error && entries.length > 0 && (
        <div className="space-y-6">
          {/* Summary */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
              { label: 'Einträge gesamt', value: entries.length },
              { label: 'Produkte', value: productGroups.length },
              { label: 'Noch nicht benachrichtigt', value: entries.filter((e) => !e.notified_at).length },
            ].map((s) => (
              <Card key={s.label}>
                <p style={{ margin: 0, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--admin-muted-2)' }}>
                  {s.label}
                </p>
                <p style={{ margin: '4px 0 0', fontSize: 26, fontWeight: 700, color: 'var(--admin-heading)' }}>{s.value}</p>
              </Card>
            ))}
          </div>

          {/* Gruppiert nach Produkt */}
          {productGroups.map(([productName, list]) => (
            <div key={productName} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <h2 className="font-heading" style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--admin-heading)' }}>
                  {productName}
                </h2>
                <span style={{ fontSize: 12, padding: '2px 9px', borderRadius: 999, background: 'var(--admin-accent-soft)', color: 'var(--admin-accent)' }}>
                  {list.length} {list.length === 1 ? 'Interessent' : 'Interessenten'}
                </span>
              </div>
              <DataTable columns={columns} rows={list} rowKey={(e) => e.id} minWidth={720} defaultSort={{ key: 'created_at', dir: 'desc' }} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
