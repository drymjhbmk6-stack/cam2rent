'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  unitId: string;
  initialCode: string;
}

export default function EditableExemplarCode({ unitId, initialCode }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initialCode);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  function startEdit() {
    setValue(initialCode);
    setError(null);
    setEditing(true);
  }

  function cancel() {
    setEditing(false);
    setValue(initialCode);
    setError(null);
  }

  async function save() {
    const trimmed = value.trim();
    if (!trimmed) {
      setError('Code darf nicht leer sein.');
      return;
    }
    if (trimmed === initialCode) {
      setEditing(false);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/accessory-units', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: unitId, exemplar_code: trimmed }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json?.error ?? 'Speichern fehlgeschlagen.');
        setSaving(false);
        return;
      }
      setEditing(false);
      setSaving(false);
      router.refresh();
    } catch {
      setError('Netzwerkfehler.');
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div className="mt-2">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save();
              else if (e.key === 'Escape') cancel();
            }}
            disabled={saving}
            className="flex-1 min-w-0 px-2 py-1 text-base font-mono rounded border"
            style={{
              borderColor: '#06b6d4',
              background: '#ffffff',
              color: '#0f172a',
            }}
          />
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="px-2 py-1 text-xs font-semibold rounded text-white"
            style={{ background: '#06b6d4', opacity: saving ? 0.6 : 1 }}
          >
            {saving ? '…' : 'OK'}
          </button>
          <button
            type="button"
            onClick={cancel}
            disabled={saving}
            className="px-2 py-1 text-xs font-semibold rounded"
            style={{ background: '#f3f4f6', color: '#374151' }}
          >
            Abbrechen
          </button>
        </div>
        {error && (
          <p className="text-xs mt-1" style={{ color: '#b91c1c' }}>{error}</p>
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={startEdit}
      className="mt-2 inline-flex items-center gap-2 text-base font-mono break-all text-left rounded px-1 -mx-1 transition-colors hover:bg-gray-100 active:bg-gray-200"
      style={{ color: '#0f172a' }}
      title="Code bearbeiten"
      aria-label="Code bearbeiten"
    >
      <span className="break-all">{initialCode}</span>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ color: '#6b7280', flexShrink: 0 }}
        aria-hidden="true"
      >
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
      </svg>
    </button>
  );
}
