'use client';

import React from 'react';

/** Sucheingabe mit Lupen-Icon (token-basiert). */
export function SearchInput({
  value,
  onChange,
  placeholder = 'Suchen…',
  style,
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement> & {
  onChange?: React.ChangeEventHandler<HTMLInputElement>;
}) {
  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
      <svg
        width={16}
        height={16}
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--admin-muted)"
        strokeWidth={2}
        aria-hidden="true"
        style={{ position: 'absolute', left: 11, pointerEvents: 'none' }}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
      </svg>
      <input
        type="search"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        aria-label={typeof placeholder === 'string' ? placeholder : 'Suchen'}
        style={{
          width: '100%',
          background: 'var(--admin-input-bg)',
          border: '1px solid var(--admin-input-border)',
          borderRadius: 10,
          color: 'var(--admin-text)',
          padding: '9px 12px 9px 34px',
          fontSize: 16,
          outline: 'none',
          ...style,
        }}
        {...rest}
      />
    </div>
  );
}
