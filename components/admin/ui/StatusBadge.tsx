'use client';

import React from 'react';
import { BOOKING_STATUS_CONFIG } from '@/lib/booking-status-labels';

/**
 * Generisches Status-Badge (Label + Farbe + Tint-Hintergrund). Status-Farben
 * sind bewusst semantisch/hex (theme-unabhängig, Tint mit niedriger Alpha
 * funktioniert auf Light & Dark).
 */
export function Badge({
  label,
  color,
  bg,
}: {
  label: React.ReactNode;
  color: string;
  bg?: string;
}) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '3px 10px',
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        color,
        background: bg ?? `${color}14`,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  );
}

/** Buchungs-Status-Badge — liest die zentrale Admin-Palette. */
export function BookingStatusBadge({ status }: { status: string }) {
  const cfg = BOOKING_STATUS_CONFIG[status] ?? { label: status, color: '#64748b', bg: '#64748b14' };
  return <Badge label={cfg.label} color={cfg.color} bg={cfg.bg} />;
}
