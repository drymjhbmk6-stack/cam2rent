'use client';

import { useEffect, useRef, useState } from 'react';

interface DynamicSelectProps {
  value: string;
  onChange: (val: string) => void;
  settingsKey: string;
  defaults: string[];
  addLabel?: string;
  placeholder?: string;
}

export default function DynamicSelect({ value, onChange, settingsKey, defaults, addLabel = '+ Neu...', placeholder = 'Name' }: DynamicSelectProps) {
  const [options, setOptions] = useState<string[]>(defaults);
  const [showInput, setShowInput] = useState(false);
  const [newVal, setNewVal] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch(`/api/admin/settings?key=${settingsKey}`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.value && Array.isArray(data.value)) {
          setOptions(data.value);
        }
      })
      .catch(() => {});
  }, [settingsKey]);

  useEffect(() => {
    if (showInput) inputRef.current?.focus();
  }, [showInput]);

  async function addOption() {
    const trimmed = newVal.trim();
    if (!trimmed || options.includes(trimmed)) {
      setShowInput(false);
      setNewVal('');
      return;
    }
    const last = options[options.length - 1];
    const isSonstige = last?.toLowerCase().startsWith('sonstig');
    const updated = isSonstige
      ? [...options.slice(0, -1), trimmed, last].sort((a, b) => {
          if (a === last) return 1;
          if (b === last) return -1;
          return a.localeCompare(b);
        })
      : [...options, trimmed].sort((a, b) => a.localeCompare(b));

    setOptions(updated);
    onChange(trimmed);
    setShowInput(false);
    setNewVal('');

    await fetch('/api/admin/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: settingsKey, value: updated }),
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
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
        <option value="__add_new__">{addLabel}</option>
      </select>
      {showInput && (
        <div className="flex gap-1">
          <input
            ref={inputRef}
            type="text"
            value={newVal}
            onChange={(e) => setNewVal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addOption();
              if (e.key === 'Escape') { setShowInput(false); setNewVal(''); }
            }}
            placeholder={placeholder}
            className="w-32 px-3 py-2.5 border border-brand-border rounded-[10px] text-sm font-body focus:outline-none focus:ring-2 focus:ring-accent-blue"
          />
          <button
            type="button"
            onClick={addOption}
            className="px-3 py-2.5 bg-brand-black text-white text-sm font-heading font-semibold rounded-[10px] hover:bg-brand-dark transition-colors"
          >
            +
          </button>
        </div>
      )}
    </div>
  );
}
