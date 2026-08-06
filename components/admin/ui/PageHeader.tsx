'use client';

import React from 'react';
import AdminBackLink from '@/components/admin/AdminBackLink';

/**
 * Einheitlicher Seiten-Kopf (Titel + Untertitel + Aktions-Slot + optionaler
 * Zurück-Link). Ersetzt schrittweise die drei divergierenden Header-Muster.
 */
export function PageHeader({
  title,
  subtitle,
  actions,
  backHref,
  backLabel,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  /** Wenn gesetzt: `<AdminBackLink href=… label=…>` über dem Titel. */
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <div style={{ marginBottom: 20 }}>
      {(backHref || backLabel) && <AdminBackLink href={backHref} label={backLabel ?? 'Zurück'} />}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <h1 className="font-heading" style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--admin-heading)' }}>
            {title}
          </h1>
          {subtitle && <p style={{ margin: '4px 0 0', fontSize: 14, color: 'var(--admin-muted)' }}>{subtitle}</p>}
        </div>
        {actions && <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>{actions}</div>}
      </div>
    </div>
  );
}
