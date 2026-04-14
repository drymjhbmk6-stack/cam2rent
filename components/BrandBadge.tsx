'use client';

import { getBrandStyle } from '@/lib/brand-colors';
import { useBrandColors } from '@/hooks/useBrandColors';

/**
 * Einheitliches Brand-Badge für Kameras, Sets, Zubehör etc.
 * Farben werden dynamisch aus admin_settings geladen.
 */
export default function BrandBadge({
  brand,
  className = '',
}: {
  brand: string;
  className?: string;
}) {
  const brandColors = useBrandColors();
  const style = getBrandStyle(brand, brandColors);

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-heading font-semibold shrink-0 border ${className}`}
      style={{
        color: style.color,
        backgroundColor: style.bg,
        borderColor: style.border,
      }}
    >
      {brand}
    </span>
  );
}
