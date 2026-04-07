'use client';

import { useEffect, useRef, useState } from 'react';

const DEFAULT_BRANDS = ['GoPro', 'DJI', 'Insta360', 'Sonstige'];

interface BrandSelectProps {
  value: string;
  onChange: (brand: string) => void;
}

export default function BrandSelect({ value, onChange }: BrandSelectProps) {
  const [brands, setBrands] = useState<string[]>(DEFAULT_BRANDS);
  const [showInput, setShowInput] = useState(false);
  const [newBrand, setNewBrand] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/admin/settings?key=camera_brands')
      .then((r) => r.json())
      .then((data) => {
        if (data?.value && Array.isArray(data.value)) {
          setBrands(data.value);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (showInput) inputRef.current?.focus();
  }, [showInput]);

  async function addBrand() {
    const trimmed = newBrand.trim();
    if (!trimmed || brands.includes(trimmed)) {
      setShowInput(false);
      setNewBrand('');
      return;
    }
    const updated = [...brands, trimmed].sort((a, b) => {
      if (a === 'Sonstige') return 1;
      if (b === 'Sonstige') return -1;
      return a.localeCompare(b);
    });
    setBrands(updated);
    onChange(trimmed);
    setShowInput(false);
    setNewBrand('');

    // In DB speichern
    await fetch('/api/admin/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'camera_brands', value: updated }),
    }).catch(() => {});
  }

  return (
    <div className="flex gap-2">
      <select
        value={value}
        onChange={(e) => {
          if (e.target.value === '__add_new__') {
            setShowInput(true);
          } else {
            onChange(e.target.value);
          }
        }}
        className="flex-1 px-3 py-2.5 border border-brand-border rounded-[10px] text-sm font-body focus:outline-none focus:ring-2 focus:ring-accent-blue"
      >
        {brands.map((b) => (
          <option key={b} value={b}>{b}</option>
        ))}
        <option value="__add_new__">+ Neue Marke...</option>
      </select>
      {showInput && (
        <div className="flex gap-1">
          <input
            ref={inputRef}
            type="text"
            value={newBrand}
            onChange={(e) => setNewBrand(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addBrand();
              if (e.key === 'Escape') { setShowInput(false); setNewBrand(''); }
            }}
            placeholder="Markenname"
            className="w-32 px-3 py-2.5 border border-brand-border rounded-[10px] text-sm font-body focus:outline-none focus:ring-2 focus:ring-accent-blue"
          />
          <button
            type="button"
            onClick={addBrand}
            className="px-3 py-2.5 bg-brand-black text-white text-sm font-heading font-semibold rounded-[10px] hover:bg-brand-dark transition-colors"
          >
            +
          </button>
        </div>
      )}
    </div>
  );
}
