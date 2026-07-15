'use client';

import { useEffect, useState } from 'react';
import { COUNTRY_CATALOG, DEFAULT_COUNTRY, sanitizeCountryCodes } from '@/lib/allowed-countries';

/**
 * Admin-Karte „Lieferländer" (Einstellungen → Versand).
 *
 * Steuert, in welche Länder bestellt werden darf. Gespeichert in
 * `admin_config` unter dem Key `allowed_countries` (`{ codes: [...] }`).
 * Deutschland ist immer aktiv (Basis-Land, nicht abwählbar).
 */
export default function AllowedCountriesSection() {
  const [codes, setCodes] = useState<string[]>([DEFAULT_COUNTRY]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch('/api/admin/config?key=allowed_countries')
      .then((r) => r.json())
      .then((val) => {
        const raw = val && typeof val === 'object' && !Array.isArray(val) ? (val as { codes?: unknown }).codes : val;
        setCodes(sanitizeCountryCodes(raw));
      })
      .catch(() => setCodes([DEFAULT_COUNTRY]))
      .finally(() => setLoading(false));
  }, []);

  function toggle(code: string) {
    if (code === DEFAULT_COUNTRY) return; // Deutschland bleibt immer aktiv
    setCodes((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code],
    );
  }

  async function handleSave() {
    setSaving(true);
    try {
      const clean = sanitizeCountryCodes(codes);
      const res = await fetch('/api/admin/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'allowed_countries', value: { codes: clean } }),
      });
      if (!res.ok) throw new Error();
      setCodes(clean);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      alert('Fehler beim Speichern.');
    } finally {
      setSaving(false);
    }
  }

  const activeCount = codes.length;

  return (
    <div className="bg-white rounded-2xl border border-brand-border p-6 space-y-5">
      <div>
        <h2 className="font-heading font-bold text-lg text-brand-black">Lieferländer</h2>
        <p className="text-xs font-body text-brand-muted mt-1">
          In welche Länder darf bestellt werden? Nicht angehakte Länder werden bei Registrierung
          und Checkout abgelehnt. Deutschland ist immer aktiv.
        </p>
      </div>

      <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs font-body text-amber-800">
        ⚠️ Versandkosten gelten aktuell einheitlich (die oben eingestellten Preise) für <strong>alle</strong>{' '}
        aktivierten Länder. Länder-/Zonenpreise sind noch nicht umgesetzt — schalte Länder außerhalb
        Deutschlands nur frei, wenn dieselben Versandkosten passen.
      </div>

      {loading ? (
        <p className="text-sm font-body text-brand-muted">Lädt…</p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {COUNTRY_CATALOG.map((c) => {
            const active = codes.includes(c.code);
            const locked = c.code === DEFAULT_COUNTRY;
            return (
              <label
                key={c.code}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-[10px] border cursor-pointer transition-colors ${
                  active ? 'border-accent-blue bg-accent-blue/5' : 'border-brand-border bg-white'
                } ${locked ? 'opacity-70 cursor-not-allowed' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={active}
                  disabled={locked}
                  onChange={() => toggle(c.code)}
                  className="w-4 h-4 rounded border-brand-border text-accent-blue focus:ring-accent-blue"
                />
                <span className="text-sm font-body text-brand-black">{c.name}</span>
                <span className="text-[10px] font-mono text-brand-muted ml-auto">{c.code}</span>
              </label>
            );
          })}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving || loading}
          className={`flex-1 py-3 text-sm font-heading font-semibold rounded-btn transition-colors disabled:opacity-40 ${
            saved ? 'bg-green-600 text-white' : 'bg-brand-black text-white hover:bg-brand-dark'
          }`}
        >
          {saving ? 'Speichern…' : saved ? '✓ Gespeichert' : 'Speichern'}
        </button>
        <span className="text-xs font-body text-brand-muted whitespace-nowrap">
          {activeCount} {activeCount === 1 ? 'Land' : 'Länder'} aktiv
        </span>
      </div>
    </div>
  );
}
