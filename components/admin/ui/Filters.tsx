'use client';

import React from 'react';

/** Flex-Leiste für Filter/Suche über einer Liste. */
export function Toolbar({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14, ...style }}>
      {children}
    </div>
  );
}

/** Einzelne Filter-Pille (rund), optional mit Zähler. */
export function Pill({
  active,
  count,
  children,
  onClick,
}: {
  active?: boolean;
  count?: number;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 13px',
        borderRadius: 999,
        fontSize: 13,
        fontWeight: 600,
        cursor: 'pointer',
        background: active ? 'var(--admin-accent-soft)' : 'transparent',
        color: active ? 'var(--admin-accent)' : 'var(--admin-muted)',
        border: `1px solid ${active ? 'var(--admin-accent)' : 'var(--admin-border)'}`,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
      {typeof count === 'number' && (
        <span style={{ fontSize: 11, opacity: 0.85 }}>{count}</span>
      )}
    </button>
  );
}

/** Segmentierte Umschaltung (genau eine Option aktiv). */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: React.ReactNode }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div
      role="tablist"
      style={{
        display: 'inline-flex',
        padding: 3,
        gap: 2,
        borderRadius: 10,
        background: 'var(--admin-hover)',
        border: '1px solid var(--admin-border)',
      }}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            style={{
              padding: '5px 12px',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              border: 'none',
              background: active ? 'var(--admin-surface)' : 'transparent',
              color: active ? 'var(--admin-text)' : 'var(--admin-muted)',
              boxShadow: active ? 'var(--admin-shadow)' : 'none',
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
