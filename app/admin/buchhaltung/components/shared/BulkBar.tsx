'use client';

import type { ReactNode } from 'react';

interface BulkBarProps {
  count: number;
  onClear: () => void;
  children: ReactNode;
}

/**
 * Sticky Bulk-Aktion-Bar — erscheint oben wenn mind. 1 Item ausgewaehlt ist.
 * Pattern wie in /admin/social/reels/page.tsx (sticky top-0 z-10).
 */
export default function BulkBar({ count, onClear, children }: BulkBarProps) {
  if (count === 0) return null;

  return (
    <div
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 20,
        background: 'rgba(15,23,42,0.95)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        border: '1px solid #06b6d4',
        borderRadius: 12,
        padding: '12px 16px',
        marginBottom: 16,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        flexWrap: 'wrap',
        boxShadow: '0 4px 12px rgba(6,182,212,0.15)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 200 }}>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: 28,
            height: 28,
            borderRadius: 999,
            background: '#06b6d4',
            color: '#0f172a',
            fontWeight: 700,
            fontSize: 13,
            padding: '0 8px',
          }}
        >
          {count}
        </span>
        <span style={{ color: '#e2e8f0', fontSize: 14, fontWeight: 600 }}>
          {count === 1 ? 'Eintrag' : 'Einträge'} ausgewählt
        </span>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{children}</div>

      <button
        onClick={onClear}
        style={{
          background: 'transparent',
          border: '1px solid #1e293b',
          color: '#94a3b8',
          borderRadius: 8,
          padding: '6px 12px',
          fontSize: 12,
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        Auswahl aufheben
      </button>
    </div>
  );
}

interface BulkBtnProps {
  onClick: () => void;
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
}

export function BulkBtn({ onClick, children, variant = 'primary', disabled }: BulkBtnProps) {
  const styles = {
    primary: { bg: '#06b6d4', color: '#0f172a', border: '#06b6d4' },
    secondary: { bg: '#1e293b', color: '#e2e8f0', border: '#334155' },
    danger: { bg: '#ef4444', color: '#fff', border: '#ef4444' },
  }[variant];

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: styles.bg,
        color: styles.color,
        border: `1px solid ${styles.border}`,
        borderRadius: 8,
        padding: '6px 14px',
        fontSize: 13,
        fontWeight: 700,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  );
}
