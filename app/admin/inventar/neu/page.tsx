'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import AdminBackLink from '@/components/admin/AdminBackLink';

interface Produkt {
  id: string;
  name: string;
  marke: string | null;
  modell: string | null;
  ist_vermietbar: boolean;
}

export default function NeuesInventarPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [bezeichnung, setBezeichnung] = useState('');
  const [typ, setTyp] = useState<'kamera' | 'zubehoer' | 'verbrauch'>(
    (searchParams.get('typ') as 'kamera' | 'zubehoer' | 'verbrauch') ?? 'zubehoer',
  );
  const [trackingMode, setTrackingMode] = useState<'individual' | 'bulk'>('individual');
  const [seriennummer, setSeriennummer] = useState('');
  const [inventarCode, setInventarCode] = useState('');
  const [bestand, setBestand] = useState(0);
  const [wbwEnabled, setWbwEnabled] = useState(false);
  const [wbw, setWbw] = useState<number>(0);
  const [notizen, setNotizen] = useState('');
  const [produkte, setProdukte] = useState<Produkt[]>([]);
  const [produktId, setProduktId] = useState<string>(searchParams.get('produkt_id') ?? '');

  useEffect(() => {
    fetch('/api/admin/produkte')
      .then((r) => (r.ok ? r.json() : { produkte: [] }))
      .then((data) => setProdukte(data.produkte ?? []))
      .catch(() => setProdukte([]));
  }, []);

  async function handleSave() {
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        bezeichnung,
        typ,
        tracking_mode: trackingMode,
        produkt_id: produktId || null,
        seriennummer: trackingMode === 'individual' ? (seriennummer || null) : null,
        inventar_code: inventarCode,
        bestand: trackingMode === 'bulk' ? bestand : null,
        notizen: notizen || null,
      };
      if (wbwEnabled && wbw > 0) body.wiederbeschaffungswert = wbw;

      const res = await fetch('/api/admin/inventar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Fehler');
      const { unit } = await res.json();
      router.push(`/admin/inventar/${unit.id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0f1e] text-slate-50 px-4 sm:px-6 py-6">
      <AdminBackLink href="/admin/inventar" />
      <div className="max-w-2xl mx-auto mt-4 space-y-4">
        <h1 className="text-2xl font-heading">Inventar manuell anlegen</h1>

        <div className="p-3 bg-amber-500/10 border border-amber-500/30 text-amber-300 rounded text-sm">
          ⚠ Bis ein Beleg verknüpft ist, ist kein Wiederbeschaffungswert hinterlegt.
          Falls du das Stück sofort vermieten musst, kannst du den WBW manuell setzen —
          er wird beim Verknüpfen mit einem Beleg NICHT automatisch überschrieben.
        </div>

        {error && <div className="p-3 bg-rose-500/10 border border-rose-500/30 text-rose-300 rounded text-sm">{error}</div>}

        <div className="space-y-3">
          <Label>Bezeichnung *</Label>
          <input value={bezeichnung} onChange={(e) => setBezeichnung(e.target.value)} placeholder="z.B. CAM-GOP-13-01 oder Akku #1" className="w-full bg-[#111827] border border-slate-700 rounded px-3 py-2 text-base" />

          <Label>Produkt zuordnen (Stammdaten)</Label>
          <select value={produktId} onChange={(e) => setProduktId(e.target.value)} className="w-full bg-[#111827] border border-slate-700 rounded px-3 py-2 text-base">
            <option value="">— Kein Produkt zugeordnet —</option>
            {produkte.map((p) => (
              <option key={p.id} value={p.id}>
                {p.marke ? `${p.marke} ` : ''}{p.name}{p.modell && p.modell !== p.name ? ` (${p.modell})` : ''}
              </option>
            ))}
          </select>
          <p className="text-xs text-slate-500">
            Verknuepft das Inventar-Stueck mit den Produkt-Stammdaten — Voraussetzung fuer Verfuegbarkeit, Mietvertrag-Wiederbeschaffungswert und Auslastungs-Auswertung.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Typ</Label>
              <select value={typ} onChange={(e) => setTyp(e.target.value as 'kamera' | 'zubehoer' | 'verbrauch')} className="w-full bg-[#111827] border border-slate-700 rounded px-3 py-2 text-base">
                <option value="kamera">Kamera</option>
                <option value="zubehoer">Zubehör</option>
                <option value="verbrauch">Verbrauchsmaterial</option>
              </select>
            </div>
            <div>
              <Label>Tracking</Label>
              <select value={trackingMode} onChange={(e) => setTrackingMode(e.target.value as 'individual' | 'bulk')} className="w-full bg-[#111827] border border-slate-700 rounded px-3 py-2 text-base">
                <option value="individual">Einzeln (mit Code/SN)</option>
                <option value="bulk">Bulk (mit Bestand)</option>
              </select>
            </div>
          </div>

          {trackingMode === 'individual' && (
            <>
              <Label>Inventar-Code *</Label>
              <input value={inventarCode} onChange={(e) => setInventarCode(e.target.value)} placeholder="z.B. CAM-GOP-13-01" className="w-full bg-[#111827] border border-slate-700 rounded px-3 py-2 text-base font-mono text-sm" />
              <Label>Seriennummer</Label>
              <input value={seriennummer} onChange={(e) => setSeriennummer(e.target.value)} className="w-full bg-[#111827] border border-slate-700 rounded px-3 py-2 text-base font-mono text-sm" />
            </>
          )}

          {trackingMode === 'bulk' && (
            <>
              <Label>Inventar-Code *</Label>
              <input value={inventarCode} onChange={(e) => setInventarCode(e.target.value)} placeholder="z.B. STO-SAN-512" className="w-full bg-[#111827] border border-slate-700 rounded px-3 py-2 text-base font-mono text-sm" />
              <Label>Anfangsbestand</Label>
              <input type="number" min="0" value={bestand} onChange={(e) => setBestand(parseInt(e.target.value || '0', 10))} className="w-full bg-[#111827] border border-slate-700 rounded px-3 py-2 text-base" />
            </>
          )}

          <div className="pt-2 border-t border-slate-800">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={wbwEnabled} onChange={(e) => setWbwEnabled(e.target.checked)} />
              Wiederbeschaffungswert manuell setzen (optional)
            </label>
            {wbwEnabled && (
              <input type="number" step="0.01" min="0" value={wbw} onChange={(e) => setWbw(parseFloat(e.target.value || '0'))} className="w-full bg-[#111827] border border-slate-700 rounded px-3 py-2 text-base mt-2" placeholder="EUR" />
            )}
          </div>

          <Label>Notizen</Label>
          <textarea value={notizen} onChange={(e) => setNotizen(e.target.value)} rows={3} className="w-full bg-[#111827] border border-slate-700 rounded px-3 py-2 text-sm" />

          <button onClick={handleSave} disabled={busy || !bezeichnung || !inventarCode} className="px-4 py-2 bg-cyan-500 disabled:bg-slate-700 hover:bg-cyan-400 disabled:text-slate-500 text-slate-900 rounded font-semibold">
            {busy ? 'Speichert…' : 'Anlegen'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="block text-sm text-slate-400">{children}</label>;
}
