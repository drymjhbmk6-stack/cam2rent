'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';

interface ListItem {
  type: 'camera' | 'accessory';
  code: string;
  name: string;
  status: string;
  href: string;
  context?: string;
}

interface Props {
  items: ListItem[];
  statusLabels: Record<string, string>;
}

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  available: { bg: '#10b98120', fg: '#10b981' },
  rented: { bg: '#3b82f620', fg: '#3b82f6' },
  maintenance: { bg: '#f59e0b20', fg: '#f59e0b' },
  damaged: { bg: '#ef444420', fg: '#ef4444' },
  lost: { bg: '#ef444420', fg: '#ef4444' },
  retired: { bg: '#64748b20', fg: '#94a3b8' },
};

export default function InventarFilter({ items, statusLabels }: Props) {
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'camera' | 'accessory'>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => {
      if (typeFilter !== 'all' && i.type !== typeFilter) return false;
      if (statusFilter !== 'all' && i.status !== statusFilter) return false;
      if (!q) return true;
      return (
        i.code.toLowerCase().includes(q)
        || i.name.toLowerCase().includes(q)
        || (i.context?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [items, query, typeFilter, statusFilter]);

  const statusOptions = useMemo(() => {
    const seen = new Set<string>();
    for (const i of items) seen.add(i.status);
    return [...seen];
  }, [items]);

  return (
    <>
      {/* Filter-Leiste */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Code, Name oder Marke suchen..."
          style={{
            background: '#0a0f1e',
            border: '1px solid #1e293b',
            borderRadius: 10,
            padding: '12px 14px',
            color: '#e2e8f0',
            fontSize: 14,
            width: '100%',
          }}
        />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <FilterPill active={typeFilter === 'all'} onClick={() => setTypeFilter('all')}>Alle</FilterPill>
          <FilterPill active={typeFilter === 'camera'} onClick={() => setTypeFilter('camera')}>Kameras</FilterPill>
          <FilterPill active={typeFilter === 'accessory'} onClick={() => setTypeFilter('accessory')}>Zubehör</FilterPill>
          <span style={{ flex: 1 }} />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{
              background: '#0a0f1e',
              border: '1px solid #1e293b',
              borderRadius: 10,
              padding: '8px 12px',
              color: '#e2e8f0',
              fontSize: 13,
            }}
          >
            <option value="all">Alle Status</option>
            {statusOptions.map((s) => (
              <option key={s} value={s}>{statusLabels[s] ?? s}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Treffer-Anzahl */}
      <p style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>
        {filtered.length} {filtered.length === 1 ? 'Eintrag' : 'Einträge'}
      </p>

      {/* Liste */}
      {filtered.length === 0 ? (
        <div style={{ padding: 32, textAlign: 'center', color: '#64748b', background: '#111827', border: '1px solid #1e293b', borderRadius: 12 }}>
          Keine Treffer.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {filtered.map((item, i) => (
            <Link
              key={`${item.type}-${item.code}-${i}`}
              href={item.href}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                background: '#111827',
                border: '1px solid #1e293b',
                borderRadius: 10,
                padding: '12px 14px',
                textDecoration: 'none',
                color: '#e2e8f0',
                transition: 'border-color 0.15s, background 0.15s',
              }}
            >
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: 999,
                      background: item.type === 'camera' ? '#06b6d420' : '#a855f720',
                      color: item.type === 'camera' ? '#06b6d4' : '#a855f7',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                      flexShrink: 0,
                    }}
                  >
                    {item.type === 'camera' ? 'Kamera' : 'Zubehör'}
                  </span>
                  {item.context && (
                    <span style={{ fontSize: 11, color: '#64748b' }}>{item.context}</span>
                  )}
                </div>
                <p style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 700, color: '#e2e8f0', marginTop: 4, wordBreak: 'break-all' }}>
                  {item.code}
                </p>
                <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.name}
                </p>
              </div>
              <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    padding: '4px 10px',
                    borderRadius: 999,
                    background: STATUS_COLORS[item.status]?.bg ?? '#33415544',
                    color: STATUS_COLORS[item.status]?.fg ?? '#94a3b8',
                  }}
                >
                  {statusLabels[item.status] ?? item.status}
                </span>
                <svg width="18" height="18" fill="none" stroke="#64748b" strokeWidth={2} viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

function FilterPill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        fontSize: 12,
        fontWeight: 600,
        padding: '6px 14px',
        borderRadius: 999,
        cursor: 'pointer',
        background: active ? '#06b6d4' : 'transparent',
        color: active ? 'white' : '#94a3b8',
        border: `1px solid ${active ? '#06b6d4' : '#334155'}`,
      }}
    >
      {children}
    </button>
  );
}
