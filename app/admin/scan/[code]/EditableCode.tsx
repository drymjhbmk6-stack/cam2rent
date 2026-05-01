'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';

type Kind = 'camera' | 'accessory';

interface Props {
  kind: Kind;
  unitId: string;
  initialCode: string;
}

const ENDPOINTS: Record<Kind, { url: string; field: string; label: string; placeholder: string; codeIsUrl: boolean }> = {
  camera: {
    url: '/api/admin/product-units',
    field: 'label',
    label: 'Bezeichnung bearbeiten',
    placeholder: '+ Bezeichnung hinzufügen',
    // Bei Kameras steht die Seriennummer in der URL — Label-Aenderung
    // veraendert die URL nicht, deshalb reicht ein Refresh.
    codeIsUrl: false,
  },
  accessory: {
    url: '/api/admin/accessory-units',
    field: 'exemplar_code',
    label: 'Code bearbeiten',
    placeholder: '+ Code hinzufügen',
    // Bei Zubehoer ist der exemplar_code Teil der URL (/admin/scan/<code>).
    // Nach dem Umbenennen muss zur neuen URL navigiert werden, sonst lauft
    // der Refresh auf die alte URL und zeigt "Code unbekannt".
    codeIsUrl: true,
  },
};

export default function EditableCode({ kind, unitId, initialCode }: Props) {
  const router = useRouter();
  const cfg = ENDPOINTS[kind];
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
    if (trimmed === initialCode) {
      setEditing(false);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      // Bei Kameras ist das Feld "label" optional → leer = null setzen erlaubt.
      // Bei Zubehoer ist exemplar_code Pflicht → leer abfangen.
      if (kind === 'accessory' && !trimmed) {
        setError('Code darf nicht leer sein.');
        setSaving(false);
        return;
      }
      const res = await fetch(cfg.url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: unitId, [cfg.field]: trimmed }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json?.error ?? 'Speichern fehlgeschlagen.');
        setSaving(false);
        return;
      }
      setEditing(false);
      setSaving(false);
      // Wenn der gespeicherte Code Teil der URL ist (Zubehoer), zur neuen
      // URL navigieren — sonst zeigt der Refresh "Code unbekannt".
      if (cfg.codeIsUrl) {
        router.replace(`/admin/scan/${encodeURIComponent(trimmed)}`);
      } else {
        router.refresh();
      }
    } catch {
      setError('Netzwerkfehler.');
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div className="mt-2">
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save();
            else if (e.key === 'Escape') cancel();
          }}
          disabled={saving}
          placeholder={cfg.placeholder.replace('+ ', '')}
          className="w-full px-3 py-2 text-base font-mono rounded border"
          style={{
            borderColor: '#06b6d4',
            background: '#ffffff',
            color: '#0f172a',
          }}
        />
        <div className="flex items-center gap-2 mt-2">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="px-4 py-2 text-sm font-semibold rounded text-white"
            style={{ background: '#06b6d4', opacity: saving ? 0.6 : 1 }}
          >
            {saving ? 'Speichert…' : 'OK'}
          </button>
          <button
            type="button"
            onClick={cancel}
            disabled={saving}
            className="px-4 py-2 text-sm font-semibold rounded"
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

  const isEmpty = !initialCode;

  return (
    <button
      type="button"
      onClick={startEdit}
      className={`mt-2 inline-flex items-center gap-2 text-base ${isEmpty ? 'italic' : 'font-mono'} break-all text-left rounded px-1 -mx-1 transition-colors hover:bg-gray-100 active:bg-gray-200`}
      style={{ color: isEmpty ? '#06b6d4' : '#0f172a' }}
      title={cfg.label}
      aria-label={cfg.label}
    >
      <span className="break-all">{isEmpty ? cfg.placeholder : initialCode}</span>
      {!isEmpty && (
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
      )}
    </button>
  );
}
