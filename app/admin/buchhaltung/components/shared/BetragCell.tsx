'use client';

import { formatCurrency } from '@/lib/format-utils';

interface BetragCellProps {
  amount: number;
  showSign?: boolean;
  muted?: boolean;
}

export default function BetragCell({ amount, showSign = false, muted = false }: BetragCellProps) {
  const isNegative = amount < 0;
  const color = muted ? '#64748b' : isNegative ? '#ef4444' : '#e2e8f0';
  const prefix = showSign && amount > 0 ? '+' : '';

  return (
    <span style={{ color, fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
      {prefix}{formatCurrency(amount)}
    </span>
  );
}
