'use client';

import { useEffect, useState } from 'react';
import AdminBackLink from '@/components/admin/AdminBackLink';
import PriceInput from '@/components/admin/PriceInput';
import { DEFAULT_HAFTUNG, DEFAULT_KAUTION_TIERS, type HaftungConfig, type KautionTiers } from '@/lib/price-config';

function Field({ label, sub, value, onChange }: {
  label: string; sub?: string; value: number; onChange: (v: number) => void;
}) {
  return (
    <div>
      <label className="block text-sm font-heading font-semibold text-brand-black mb-1">{label}</label>
      {sub && <p className="text-xs font-body text-brand-muted mb-2">{sub}</p>}
      <div className="relative">
        <PriceInput value={value} onChange={onChange} min={0}
          className="w-full pr-8 pl-3 py-2.5 border border-brand-border rounded-[10px] text-sm font-body focus:outline-none focus:ring-2 focus:ring-accent-blue" />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-brand-muted pointer-events-none">€</span>
      </div>
    </div>
  );
}

function SaveBtn({ onClick, saving, saved }: { onClick: () => void; saving: boolean; saved: boolean }) {
  return (
    <button onClick={onClick} disabled={saving}
      className={`px-5 py-2.5 text-sm font-heading font-semibold rounded-btn transition-colors disabled:opacity-40 ${saved ? 'bg-green-600 text-white' : 'bg-brand-black text-white hover:bg-brand-dark'}`}>
      {saving ? 'Speichern…' : saved ? '✓ Gespeichert' : 'Speichern'}
    </button>
  );
}

export default function HaftungContent() {
  const [haftung, setHaftung] = useState<HaftungConfig>(DEFAULT_HAFTUNG);
  const [kaution, setKaution] = useState<KautionTiers>(DEFAULT_KAUTION_TIERS);
  const [hSaving, setHSaving] = useState(false);
  const [hSaved, setHSaved] = useState(false);
  const [kSaving, setKSaving] = useState(false);
  const [kSaved, setKSaved] = useState(false);

  useEffect(() => {
    fetch('/api/prices')
      .then((r) => r.json())
      .then((d) => {
        if (d.haftung) {
          const merged = { ...DEFAULT_HAFTUNG, ...d.haftung };
          // Sicherstellen dass eigenbeteiligungByCategory-Werte Zahlen sind
          if (merged.eigenbeteiligungByCategory) {
            const fixed: Record<string, number> = {};
            for (const [k, v] of Object.entries(merged.eigenbeteiligungByCategory)) {
              fixed[k] = typeof v === 'number' ? v : (parseFloat(String(v)) || 0);
            }
            merged.eigenbeteiligungByCategory = fixed;
          }
          setHaftung(merged);
        }
        if (d.kautionTiers) setKaution(d.kautionTiers);
      })
      .catch(() => {});
  }, []);

  async function save(key: string, value: unknown, setSaving: (v: boolean) => void, setSaved: (v: boolean) => void) {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value }),
      });
      if (!res.ok) throw new Error();
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      alert('Fehler beim Speichern.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-brand-bg">
      <div className="max-w-2xl mx-auto px-6 py-8">
        <AdminBackLink href="/admin/preise" label="Zurück zu Preise" />
        <div className="flex items-center gap-2 mb-8">
          <h1 className="font-heading font-bold text-xl text-brand-black">Haftung & Kaution</h1>
        </div>

        <div className="space-y-6">

          {/* Haftungsoptionen */}
          <div className="bg-white rounded-2xl border border-brand-border p-6">
            <h2 className="font-heading font-bold text-base text-brand-black mb-1">Haftungsoptionen</h2>
            <p className="text-xs font-body text-brand-muted mb-5">
              Pauschalpreis pro Buchung — nur für Kameras mit aktivierter Haftungsoption
            </p>

            <div className="space-y-5">
              <div className="bg-brand-bg rounded-xl border border-brand-border p-4 space-y-4">
                <p className="font-heading font-semibold text-sm text-brand-black">Standard-Haftungsschutz</p>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Basispreis (1-7 Tage)" value={haftung.standard} onChange={(v) => setHaftung((h) => ({ ...h, standard: v }))} />
                  <Field label="Aufschlag pro Woche" value={haftung.standardIncrement} onChange={(v) => setHaftung((h) => ({ ...h, standardIncrement: v }))} />
                </div>
                <Field label="Fallback-Eigenbeteiligung" sub="Wird verwendet wenn keine Kategorie passt" value={haftung.standardEigenbeteiligung} onChange={(v) => setHaftung((h) => ({ ...h, standardEigenbeteiligung: v }))} />

                {/* Eigenbeteiligung pro Kategorie */}
                <div className="mt-3 pt-3 border-t border-brand-border">
                  <p className="text-xs font-heading font-semibold text-brand-muted mb-3">Eigenbeteiligung pro Kategorie</p>
                  <div className="space-y-3">
                    {Object.entries(haftung.eigenbeteiligungByCategory ?? { 'action-cam': 200, '360-cam': 300 }).map(([cat, val]) => {
                      const numVal = typeof val === 'number' ? val : (parseFloat(String(val)) || 0);
                      return (
                      <div key={cat} className="flex items-center gap-3">
                        <input
                          type="text"
                          value={cat}
                          onChange={(e) => {
                            const old = haftung.eigenbeteiligungByCategory ?? {};
                            const updated = { ...old };
                            delete updated[cat];
                            updated[e.target.value] = numVal;
                            setHaftung((h) => ({ ...h, eigenbeteiligungByCategory: updated }));
                          }}
                          className="flex-1 px-3 py-2 border border-brand-border rounded-[10px] text-sm font-body focus:outline-none focus:ring-2 focus:ring-accent-blue"
                          placeholder="Kategorie-Slug"
                        />
                        <div className="relative w-28">
                          <PriceInput
                            value={numVal}
                            onChange={(v) => {
                              const updated = { ...(haftung.eigenbeteiligungByCategory ?? {}) };
                              updated[cat] = v;
                              setHaftung((h) => ({ ...h, eigenbeteiligungByCategory: updated }));
                            }}
                            min={0}
                            className="w-full pr-8 pl-3 py-2 border border-brand-border rounded-[10px] text-sm font-body focus:outline-none focus:ring-2 focus:ring-accent-blue"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-brand-muted pointer-events-none">€</span>
                        </div>
                        <button
                          onClick={() => {
                            const updated = { ...(haftung.eigenbeteiligungByCategory ?? {}) };
                            delete updated[cat];
                            setHaftung((h) => ({ ...h, eigenbeteiligungByCategory: updated }));
                          }}
                          className="text-red-500 hover:text-red-700 text-sm font-bold px-2"
                          title="Entfernen"
                        >
                          ×
                        </button>
                      </div>
                      );
                    })}
                    <button
                      onClick={() => {
                        const updated = { ...(haftung.eigenbeteiligungByCategory ?? {}) };
                        updated[`kategorie-${Object.keys(updated).length + 1}`] = 200;
                        setHaftung((h) => ({ ...h, eigenbeteiligungByCategory: updated }));
                      }}
                      className="text-xs font-heading font-semibold text-accent-blue hover:underline"
                    >
                      + Kategorie hinzufügen
                    </button>
                  </div>
                </div>
              </div>

              <div className="bg-brand-bg rounded-xl border border-brand-border p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <p className="font-heading font-semibold text-sm text-brand-black">Premium-Haftungsschutz</p>
                  <span className="text-xs font-body text-brand-muted bg-white border border-brand-border px-2 py-0.5 rounded-full">Keine Eigenbeteiligung</span>
                </div>
                <Field label="Preis" value={haftung.premium} onChange={(v) => setHaftung((h) => ({ ...h, premium: v }))} />
              </div>
            </div>

            <div className="mt-5 flex justify-end">
              <SaveBtn onClick={() => save('haftung', haftung, setHSaving, setHSaved)} saving={hSaving} saved={hSaved} />
            </div>
          </div>

          {/* Kaution Tiers */}
          <div className="bg-white rounded-2xl border border-brand-border p-6">
            <h2 className="font-heading font-bold text-base text-brand-black mb-1">Kaution-Stufen</h2>
            <p className="text-xs font-body text-brand-muted mb-5">
              3 Stufen — jede Kamera kann einer Stufe zugeordnet werden (statt Haftungsoption)
            </p>

            <div className="space-y-4">
              {([1, 2, 3] as const).map((tier) => (
                <div key={tier} className="bg-brand-bg rounded-xl border border-brand-border p-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-heading font-semibold text-brand-muted mb-1.5">Name</label>
                      <input
                        type="text"
                        value={kaution[tier].name}
                        onChange={(e) => setKaution((k) => ({ ...k, [tier]: { ...k[tier], name: e.target.value } }))}
                        className="w-full px-3 py-2.5 border border-brand-border rounded-[10px] text-sm font-body focus:outline-none focus:ring-2 focus:ring-accent-blue"
                      />
                    </div>
                    <Field
                      label="Betrag"
                      value={kaution[tier].amount}
                      onChange={(v) => setKaution((k) => ({ ...k, [tier]: { ...k[tier], amount: v } }))}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-5 flex justify-end">
              <SaveBtn onClick={() => save('kaution_tiers', kaution, setKSaving, setKSaved)} saving={kSaving} saved={kSaved} />
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
