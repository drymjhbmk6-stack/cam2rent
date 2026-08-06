'use client';

import React from 'react';

/** Einheitlicher Leer-Zustand (keine Treffer / noch nichts angelegt). */
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--admin-muted)' }} role="status">
      {icon && <div style={{ marginBottom: 12, opacity: 0.7, display: 'flex', justifyContent: 'center' }}>{icon}</div>}
      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--admin-text)' }}>{title}</div>
      {description && <p style={{ margin: '6px auto 0', maxWidth: 420, fontSize: 14 }}>{description}</p>}
      {action && <div style={{ marginTop: 16 }}>{action}</div>}
    </div>
  );
}
