'use client';

import React from 'react';

/**
 * Token-basierter Admin-Button (Schritt 6). Varianten primary/secondary/danger/
 * ghost, Größen sm/md, optionaler Lade-Spinner + Icon. Rein additiv — bestehende
 * Buttons bleiben unverändert, bis Seiten in Schritt 8 migriert werden.
 */

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
type Size = 'sm' | 'md';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: React.ReactNode;
}

const BG: Record<Variant, string> = {
  primary: 'var(--admin-accent)',
  secondary: 'var(--admin-secondary-bg)',
  danger: 'var(--admin-danger)',
  ghost: 'transparent',
};

function color(variant: Variant): string {
  if (variant === 'primary' || variant === 'danger') return '#fff';
  if (variant === 'secondary') return 'var(--admin-text)';
  return 'var(--admin-accent)';
}

const Spinner = () => (
  <svg width={15} height={15} viewBox="0 0 24 24" fill="none" className="animate-spin" aria-hidden="true">
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
    <path d="M21 12a9 9 0 00-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
  </svg>
);

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  children,
  disabled,
  style,
  ...rest
}: ButtonProps) {
  const off = disabled || loading;
  return (
    <button
      disabled={off}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: size === 'sm' ? '6px 12px' : '9px 16px',
        borderRadius: 10,
        fontWeight: 600,
        fontSize: size === 'sm' ? 13 : 14,
        lineHeight: 1.2,
        background: BG[variant],
        color: color(variant),
        border: variant === 'secondary' ? '1px solid var(--admin-border)' : '1px solid transparent',
        cursor: off ? 'not-allowed' : 'pointer',
        opacity: off ? 0.6 : 1,
        whiteSpace: 'nowrap',
        ...style,
      }}
      {...rest}
    >
      {loading ? <Spinner /> : icon}
      {children}
    </button>
  );
}
