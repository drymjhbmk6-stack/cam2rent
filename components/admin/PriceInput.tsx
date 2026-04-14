'use client';

import { useState, useEffect, useRef } from 'react';

/**
 * Preis-Eingabefeld das Komma und leere Eingabe erlaubt.
 * Zeigt den Wert als Text (mit Komma), gibt onChange eine Zahl zurück.
 *
 * Vorteile gegenüber type="number":
 * - Komma als Dezimaltrennzeichen
 * - 0 kann gelöscht werden (leeres Feld)
 * - inputMode="decimal" zeigt Ziffern-Tastatur auf Mobile
 */
export default function PriceInput({
  value,
  onChange,
  placeholder,
  className,
  min,
  step,
}: {
  value: number;
  onChange: (v: number) => void;
  placeholder?: string;
  className?: string;
  min?: number;
  step?: string;
}) {
  const [text, setText] = useState(() => value ? String(value).replace('.', ',') : '');
  const isInternal = useRef(false);

  // Sync von außen (z.B. wenn Daten geladen werden)
  useEffect(() => {
    if (isInternal.current) {
      isInternal.current = false;
      return;
    }
    setText(value ? String(value).replace('.', ',') : '');
  }, [value]);

  function handleChange(raw: string) {
    // Nur Ziffern, Komma und Punkt erlauben
    const cleaned = raw.replace(/[^0-9.,]/g, '');
    setText(cleaned);
    isInternal.current = true;

    if (cleaned === '' || cleaned === ',' || cleaned === '.') {
      onChange(0);
      return;
    }
    // Komma → Punkt für parseFloat
    const num = parseFloat(cleaned.replace(',', '.'));
    if (!isNaN(num)) {
      const bounded = min !== undefined ? Math.max(min, num) : num;
      onChange(bounded);
    }
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      value={text}
      onChange={(e) => handleChange(e.target.value)}
      placeholder={placeholder}
      className={className}
      data-step={step}
    />
  );
}
