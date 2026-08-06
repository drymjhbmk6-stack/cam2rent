'use client';

import React from 'react';

/** Token-basierte Karte (Surface). Rein additiv. */
export function Card({
  children,
  padded = true,
  style,
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & { padded?: boolean }) {
  return (
    <div
      style={{
        background: 'var(--admin-surface)',
        border: '1px solid var(--admin-border)',
        borderRadius: 16,
        boxShadow: 'var(--admin-shadow)',
        padding: padded ? 16 : 0,
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}
