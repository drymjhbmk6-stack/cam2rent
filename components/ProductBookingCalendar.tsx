'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import AvailabilityCalendar, { type DeliveryMode, type CalendarRange } from './AvailabilityCalendar';
import { useCart } from './CartProvider';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ProductBookingCalendar({
  productId,
  productSlug,
  available: productAvailable,
}: {
  productId: string;
  productSlug: string;
  available: boolean;
}) {
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>('versand');
  const [rangeFrom, setRangeFrom] = useState<string | null>(null);
  const [rangeTo, setRangeTo] = useState<string | null>(null);
  const [rentalDays, setRentalDays] = useState(0);

  // Cart-Items fuer dieses Produkt als zusaetzliche Hold-Ranges. Der Calendar
  // expandiert sie intern mit Admin-Puffertagen, damit nicht nur die reinen
  // Mietzeitraeume sondern auch Versand-/Abholungs-Puffer um die Cart-
  // Buchung herum als belegt angezeigt werden (server-konsistent).
  const { items: cartItems } = useCart();
  const extraHoldRanges = useMemo(
    () =>
      cartItems
        .filter((it) => it.productId === productId)
        .map((it) => ({ from: it.rentalFrom, to: it.rentalTo })),
    [cartItems, productId],
  );

  const handleRangeChange = (range: CalendarRange, days: number) => {
    setRangeFrom(range.from);
    setRangeTo(range.to);
    setRentalDays(days);
  };

  return (
    <div className="space-y-3">
      <AvailabilityCalendar
        productId={productId}
        deliveryMode={deliveryMode}
        onRangeChange={handleRangeChange}
        extraHoldRanges={extraHoldRanges}
      />

      {/* Delivery mode selection */}
      <div className="flex rounded-[10px] overflow-hidden border border-brand-border dark:border-gray-700">
        <button
          type="button"
          onClick={() => setDeliveryMode('versand')}
          className={`flex-1 py-2.5 text-xs font-heading font-semibold transition-colors ${
            deliveryMode === 'versand'
              ? 'bg-brand-black dark:bg-accent-blue text-white'
              : 'bg-white dark:bg-gray-800 text-brand-steel dark:text-gray-400 hover:bg-brand-bg dark:hover:bg-gray-700'
          }`}
        >
          <span className="flex items-center justify-center gap-1.5">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
            Versand
          </span>
        </button>
        <button
          type="button"
          onClick={() => setDeliveryMode('abholung')}
          className={`flex-1 py-2.5 text-xs font-heading font-semibold transition-colors ${
            deliveryMode === 'abholung'
              ? 'bg-brand-black dark:bg-accent-blue text-white'
              : 'bg-white dark:bg-gray-800 text-brand-steel dark:text-gray-400 hover:bg-brand-bg dark:hover:bg-gray-700'
          }`}
        >
          <span className="flex items-center justify-center gap-1.5">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Abholung
          </span>
        </button>
      </div>

      {/* Selected range info + CTA */}
      {rangeFrom && rangeTo && (
        <div className="bg-accent-blue-soft dark:bg-accent-blue/10 border border-accent-blue/20 rounded-[10px] p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-body text-accent-blue/70 dark:text-blue-300/70">Mietdauer</span>
            <span className="text-xs font-heading font-bold text-accent-blue dark:text-blue-300">
              {rentalDays} {rentalDays === 1 ? 'Tag' : 'Tage'}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs font-body text-accent-blue/70 dark:text-blue-300/70 mb-3">
            <span>{parseDate(rangeFrom).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}</span>
            <span>→</span>
            <span>{parseDate(rangeTo).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}</span>
          </div>
          <Link
            href={`/kameras/${productSlug}/buchen?from=${rangeFrom}&to=${rangeTo}&delivery=${deliveryMode}`}
            className="block w-full text-center px-4 py-2.5 bg-brand-black dark:bg-accent-blue text-white font-heading font-bold text-sm rounded-[10px] hover:bg-brand-dark dark:hover:bg-blue-600 transition-colors"
          >
            Jetzt mieten
          </Link>
        </div>
      )}

      {/* Hint when no range selected */}
      {!rangeFrom && !rangeTo && productAvailable && (
        <p className="text-[10px] font-body text-brand-muted dark:text-gray-500 text-center">
          Wähle Start- und Enddatum im Kalender
        </p>
      )}
    </div>
  );
}
