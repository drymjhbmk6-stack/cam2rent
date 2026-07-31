'use client';

import { useEffect, useState } from 'react';
import { BUSINESS } from '@/lib/business-config';

/**
 * Verwaltung der Übergabe-/Abhol-Adressen. Wird in der Übergabe/Abholung
 * (`/admin/buchungen/[id]/uebergabe`) als Auswahl (Haken) angeboten, damit
 * der Admin nicht jedes Mal die Adresse tippen muss.
 * Speicherung: admin_settings.handover_addresses = string[]
 */

const SETTINGS_KEY = 'handover_addresses';

/** Normalisiert den DB-Wert (Array, JSON-String oder null) auf ein String-Array. */
export function normalizeHandoverAddresses(value: unknown): string[] {
  let raw: unknown = value;
  if (typeof raw === 'string') {
    const str = raw;
    try {
      raw = JSON.parse(str);
    } catch {
      // Einzelner Adress-String
      return str.trim() ? [str.trim()] : [];
    }
  }
  if (!Array.isArray(raw)) return [];
  return raw
    .map((a) => (typeof a === 'string' ? a.trim() : ''))
    .filter((a) => a.length > 0);
}

export default function HandoverAddressesSection() {
  const [addresses, setAddresses] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/admin/settings?key=${SETTINGS_KEY}`)
      .then((r) => r.json())
      .then((d) => {
        const list = normalizeHandoverAddresses(d?.value);
        // Beim ersten Mal (noch nie gespeichert) die Firmen-Adresse vorschlagen.
        setAddresses(list.length > 0 ? list : [BUSINESS.fullAddress]);
      })
      .catch(() => setAddresses([BUSINESS.fullAddress]))
      .finally(() => setLoaded(true));
  }, []);

  function updateAddress(index: number, value: string) {
    setAddresses((prev) => prev.map((a, i) => (i === index ? value : a)));
  }

  function addAddress() {
    setAddresses((prev) => [...prev, '']);
  }

  function removeAddress(index: number) {
    setAddresses((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSave() {
    setSaving(true);
    setMsg(null);
    const cleaned = addresses.map((a) => a.trim()).filter((a) => a.length > 0);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: SETTINGS_KEY, value: cleaned }),
      });
      if (!res.ok) throw new Error('save failed');
      setAddresses(cleaned.length > 0 ? cleaned : ['']);
      setMsg('Gespeichert ✓');
    } catch {
      setMsg('Fehler beim Speichern');
    } finally {
      setSaving(false);
      setTimeout(() => setMsg(null), 3000);
    }
  }

  return (
    <div className="bg-slate-800/60 dark:bg-slate-800/60 rounded-2xl border border-slate-700 p-5">
      <h2 className="font-heading font-semibold text-base mb-1" style={{ color: '#e2e8f0' }}>
        Übergabe-Adressen (Abholung)
      </h2>
      <p className="text-sm font-body text-slate-400 mb-4">
        Diese Adressen erscheinen bei der Übergabe/Abholung als anhakbare Auswahl
        („Ort der Übergabe“). Du kannst mehrere Adressen hinterlegen — z.B. Laden,
        Lager oder Privatadresse.
      </p>

      {!loaded ? (
        <div className="text-sm text-slate-500">Lädt…</div>
      ) : (
        <div className="space-y-2.5">
          {addresses.map((addr, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="text"
                value={addr}
                onChange={(e) => updateAddress(i, e.target.value)}
                placeholder="z.B. Heimsbrunner Str. 12, 12349 Berlin"
                className="flex-1 px-3 py-2.5 rounded-lg bg-slate-950 border border-slate-700 text-base text-slate-100 focus:border-cyan-500 focus:outline-none"
              />
              <button
                onClick={() => removeAddress(i)}
                className="shrink-0 px-3 py-2.5 rounded-lg bg-slate-700 hover:bg-red-600/80 text-slate-200 text-sm transition-colors"
                aria-label="Adresse entfernen"
                title="Adresse entfernen"
              >
                ✕
              </button>
            </div>
          ))}

          <button
            onClick={addAddress}
            className="text-sm text-cyan-400 hover:text-cyan-300 font-heading font-semibold"
          >
            + Adresse hinzufügen
          </button>

          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-accent-blue hover:opacity-90 text-white text-sm font-heading font-semibold disabled:opacity-40"
            >
              {saving ? 'Speichert…' : 'Speichern'}
            </button>
            {msg && (
              <span
                className={`text-sm font-heading font-semibold ${
                  msg.startsWith('Fehler') ? 'text-red-400' : 'text-emerald-400'
                }`}
              >
                {msg}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
