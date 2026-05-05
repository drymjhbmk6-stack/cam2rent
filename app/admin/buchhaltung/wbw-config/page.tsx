'use client';

import { useEffect, useState } from 'react';
import AdminBackLink from '@/components/admin/AdminBackLink';

interface WbwConfig {
  floor_percent: number;
  useful_life_months: number;
}

export default function WbwConfigPage() {
  const [cfg, setCfg] = useState<WbwConfig>({ floor_percent: 40, useful_life_months: 36 });
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/settings/wbw-config').then((r) => r.json()).then((d) => {
      if (d.config) setCfg(d.config);
      setLoaded(true);
    });
  }, []);

  async function save() {
    setBusy(true);
    setError(null);
    const res = await fetch('/api/admin/settings/wbw-config', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cfg),
    });
    if (!res.ok) {
      setError((await res.json()).error ?? 'Fehler');
    } else {
      setSavedAt(Date.now());
    }
    setBusy(false);
  }

  // Live-Vorschau
  function previewWbw(kaufpreis: number, monthsAlt: number): number {
    const floor = (cfg.floor_percent / 100) * kaufpreis;
    if (monthsAlt >= cfg.useful_life_months) return floor;
    return kaufpreis - (kaufpreis - floor) * (monthsAlt / cfg.useful_life_months);
  }

  return (
    <div className="min-h-screen bg-[#0a0f1e] text-slate-50 px-4 sm:px-6 py-6">
      <AdminBackLink href="/admin/buchhaltung" />
      <div className="max-w-3xl mx-auto mt-4 space-y-6">
        <h1 className="text-2xl font-heading">Wiederbeschaffungswert-Berechnung</h1>

        <div className="bg-[#111827] border border-slate-800 rounded p-4 space-y-3">
          <p className="text-sm text-slate-400">
            Bestimmt, wie der Wiederbeschaffungswert für nicht manuell gesetzte Inventar-Stücke
            berechnet wird. Linearer Verfall vom Kaufpreis bis zum Restwert-Floor über die
            definierte Nutzungsdauer, danach konstant.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm mb-1">Restwert-Floor (%)</label>
              <input
                type="number" min={0} max={100}
                value={cfg.floor_percent}
                onChange={(e) => setCfg((c) => ({ ...c, floor_percent: parseFloat(e.target.value || '0') }))}
                className="w-full bg-[#0a0f1e] border border-slate-700 rounded px-3 py-2 text-base"
              />
              <p className="text-xs text-slate-500 mt-1">
                Auf welchen Prozentsatz vom Kaufpreis sinkt der Wert minimal? (z.B. 40 = WBW endet bei 40% vom Kaufpreis)
              </p>
            </div>
            <div>
              <label className="block text-sm mb-1">Nutzungsdauer (Monate)</label>
              <input
                type="number" min={1}
                value={cfg.useful_life_months}
                onChange={(e) => setCfg((c) => ({ ...c, useful_life_months: parseInt(e.target.value || '1', 10) }))}
                className="w-full bg-[#0a0f1e] border border-slate-700 rounded px-3 py-2 text-base"
              />
              <p className="text-xs text-slate-500 mt-1">
                Über wie viele Monate erfolgt die lineare Wertminderung?
              </p>
            </div>
          </div>

          {error && <div className="p-3 bg-rose-500/10 border border-rose-500/30 text-rose-300 rounded text-sm">{error}</div>}

          <div className="flex items-center gap-3">
            <button onClick={save} disabled={busy} className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 disabled:bg-slate-700 text-slate-900 rounded font-semibold">
              {busy ? 'Speichert…' : 'Speichern'}
            </button>
            {savedAt && Date.now() - savedAt < 5000 && (
              <span className="text-emerald-400 text-sm">✓ Gespeichert</span>
            )}
          </div>
        </div>

        {loaded && (
          <div className="bg-[#111827] border border-slate-800 rounded p-4">
            <h2 className="font-semibold mb-3">Live-Vorschau</h2>
            <div className="space-y-2 text-sm">
              <Preview kaufpreis={449} months={6} compute={previewWbw} />
              <Preview kaufpreis={449} months={18} compute={previewWbw} />
              <Preview kaufpreis={449} months={cfg.useful_life_months + 6} compute={previewWbw} />
              <Preview kaufpreis={1299} months={12} compute={previewWbw} />
              <Preview kaufpreis={89} months={24} compute={previewWbw} />
            </div>
          </div>
        )}

        <div className="p-3 bg-amber-500/10 border border-amber-500/30 text-amber-300 rounded text-sm">
          ⚠ Änderungen wirken sich nur auf Inventar-Stücke ohne manuellen Override aus.
          Bestehende manuell gesetzte Werte bleiben unverändert.
        </div>
      </div>
    </div>
  );
}

function Preview({ kaufpreis, months, compute }: { kaufpreis: number; months: number; compute: (k: number, m: number) => number }) {
  const wbw = compute(kaufpreis, months);
  return (
    <div className="flex justify-between items-center">
      <span className="text-slate-400">Kaufpreis {kaufpreis} €, {months} Monate alt</span>
      <span className="font-mono">→ {new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(wbw)}</span>
    </div>
  );
}
