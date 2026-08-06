'use client';

import React, { useMemo, useState } from 'react';
import { TableSkeleton } from './Skeleton';
import { EmptyState } from './EmptyState';

/**
 * Einheitliche Admin-Tabelle (Schritt 7). Spalten-Konfiguration, Sortierung mit
 * `aria-sort`, tastatur-bedienbare Zeilen, Sticky-Header, integrierter Lade-
 * (Skeleton) + Leer-Zustand. Token-basiert → identisches Aussehen mit UND ohne
 * den Legacy-`.admin-dark`-Override (der die gleichen Werte per !important setzt).
 *
 * Rein additiv (neue Datei). Die Migration der ~40 hand-gebauten Tabellen auf
 * diese Komponente läuft page-by-page in Schritt 8 (einzeln deploy-/testbar).
 * Keine Virtualisierung (Listen sind serverseitig auf ~500 Zeilen gedeckelt —
 * bei Bedarf später `@tanstack/react-virtual` ergänzen).
 */

export interface DataTableColumn<T> {
  key: string;
  header: React.ReactNode;
  render: (row: T) => React.ReactNode;
  /** Wenn sortierbar: liefert den Vergleichswert. Ohne `sortValue` nicht sortierbar. */
  sortValue?: (row: T) => string | number;
  align?: 'left' | 'right' | 'center';
  /** Spalte unter diesem Breakpoint ausblenden (`hidden md:table-cell` etc.). */
  hideBelow?: 'md' | 'lg';
  width?: number | string;
  headerTitle?: string;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  onRowClick?: (row: T) => void;
  /** Eigener Leer-Zustand; sonst Default-EmptyState mit `emptyTitle`. */
  empty?: React.ReactNode;
  emptyTitle?: React.ReactNode;
  emptyDescription?: React.ReactNode;
  defaultSort?: { key: string; dir: 'asc' | 'desc' };
  minWidth?: number;
  /** Aktiviert Sticky-Header + vertikales Scrollen. */
  maxHeight?: number | string;
  skeletonRows?: number;
}

function hideClass(hideBelow?: 'md' | 'lg'): string {
  if (hideBelow === 'md') return 'hidden md:table-cell';
  if (hideBelow === 'lg') return 'hidden lg:table-cell';
  return '';
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading = false,
  onRowClick,
  empty,
  emptyTitle = 'Keine Einträge',
  emptyDescription,
  defaultSort,
  minWidth = 600,
  maxHeight,
  skeletonRows = 8,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(defaultSort?.key ?? null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(defaultSort?.dir ?? 'asc');
  const [hoverKey, setHoverKey] = useState<string | null>(null);

  const sortedRows = useMemo(() => {
    if (!sortKey) return rows;
    const col = columns.find((c) => c.key === sortKey);
    if (!col?.sortValue) return rows;
    const getVal = col.sortValue;
    const factor = sortDir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = getVal(a);
      const vb = getVal(b);
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * factor;
      return String(va).localeCompare(String(vb), 'de') * factor;
    });
  }, [rows, columns, sortKey, sortDir]);

  function toggleSort(col: DataTableColumn<T>) {
    if (!col.sortValue) return;
    if (sortKey === col.key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(col.key);
      setSortDir('asc');
    }
  }

  const containerStyle: React.CSSProperties = {
    background: 'var(--admin-surface)',
    border: '1px solid var(--admin-border)',
    borderRadius: 16,
    boxShadow: 'var(--admin-shadow)',
    overflow: 'hidden',
  };

  if (loading) {
    return (
      <div style={containerStyle}>
        <TableSkeleton rows={skeletonRows} bare />
      </div>
    );
  }

  if (rows.length === 0) {
    return <div style={containerStyle}>{empty ?? <EmptyState title={emptyTitle} description={emptyDescription} />}</div>;
  }

  const thBase: React.CSSProperties = {
    background: 'var(--admin-thead-bg)',
    color: 'var(--admin-accent)',
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    padding: '13px 12px',
    borderBottom: '1px solid var(--admin-border)',
    whiteSpace: 'nowrap',
    ...(maxHeight ? { position: 'sticky', top: 0, zIndex: 1 } : {}),
  };

  return (
    <div style={containerStyle}>
      <div style={{ overflowX: 'auto', ...(maxHeight ? { maxHeight, overflowY: 'auto' } : {}) }}>
        <table style={{ width: '100%', minWidth, borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {columns.map((col) => {
                const active = sortKey === col.key;
                const ariaSort: React.AriaAttributes['aria-sort'] = col.sortValue
                  ? active
                    ? sortDir === 'asc'
                      ? 'ascending'
                      : 'descending'
                    : 'none'
                  : undefined;
                return (
                  <th
                    key={col.key}
                    className={hideClass(col.hideBelow)}
                    aria-sort={ariaSort}
                    title={col.headerTitle}
                    style={{ ...thBase, textAlign: col.align ?? 'left', width: col.width }}
                  >
                    {col.sortValue ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(col)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          background: 'transparent',
                          border: 'none',
                          color: 'inherit',
                          font: 'inherit',
                          letterSpacing: 'inherit',
                          textTransform: 'inherit',
                          cursor: 'pointer',
                          padding: 0,
                        }}
                      >
                        {col.header}
                        <span aria-hidden="true" style={{ opacity: active ? 1 : 0.4 }}>
                          {active ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}
                        </span>
                      </button>
                    ) : (
                      col.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row, idx) => {
              const key = rowKey(row);
              const clickable = !!onRowClick;
              const hovered = hoverKey === key;
              return (
                <tr
                  key={key}
                  tabIndex={clickable ? 0 : undefined}
                  onClick={clickable ? () => onRowClick!(row) : undefined}
                  onKeyDown={
                    clickable
                      ? (e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            onRowClick!(row);
                          }
                        }
                      : undefined
                  }
                  onMouseEnter={clickable ? () => setHoverKey(key) : undefined}
                  onMouseLeave={clickable ? () => setHoverKey(null) : undefined}
                  style={{
                    cursor: clickable ? 'pointer' : undefined,
                    background: hovered ? 'var(--admin-hover)' : idx % 2 === 1 ? 'var(--admin-zebra)' : 'transparent',
                  }}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={hideClass(col.hideBelow)}
                      style={{
                        padding: '11px 12px',
                        borderTop: '1px solid var(--admin-border)',
                        color: 'var(--admin-text)',
                        fontSize: 14,
                        textAlign: col.align ?? 'left',
                      }}
                    >
                      {col.render(row)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
