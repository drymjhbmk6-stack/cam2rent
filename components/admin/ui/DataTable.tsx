'use client';

import type { ReactNode } from 'react';

/* cam2rent Admin 2.0 — DataTable
   Dichte Tabelle: Uppercase-Header, Zebra, Hover, optional Zeilen-Klick. */

export type Column<T> = {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  align?: 'left' | 'right' | 'center';
  className?: string; // z.B. 'hidden sm:table-cell'
  width?: string;
};

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  empty = 'Keine Einträge.',
  className = '',
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T, i: number) => string;
  onRowClick?: (row: T) => void;
  empty?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`bg-white border border-slate-200 rounded-lg overflow-x-auto ${className}`}>
      <table className="w-full">
        <thead>
          <tr className="text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-200">
            {columns.map((c) => (
              <th
                key={c.key}
                style={c.width ? { width: c.width } : undefined}
                className={`font-medium py-2 px-3 ${
                  c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left'
                } ${c.className ?? ''}`}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="py-10 text-center text-slate-400 text-[13px]">
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr
                key={rowKey(row, i)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={`${onRowClick ? 'cursor-pointer' : ''} hover:bg-slate-50 ${
                  i % 2 ? 'bg-slate-50/40' : ''
                }`}
              >
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={`py-2.5 px-3 ${
                      c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left'
                    } ${c.className ?? ''}`}
                  >
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
