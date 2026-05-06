'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import AdminBackLink from '@/components/admin/AdminBackLink';

interface Produkt {
  id: string;
  name: string;
  marke: string | null;
  modell: string | null;
  ist_vermietbar: boolean;
  compatible_camera_names?: string[];
}

interface CodeSegment {
  id: string;
  typ: 'kategorie' | 'hersteller';
  code: string;
  label: string;
}

interface Seg3Suggestion {
  name: string;
  count: number;
}

function produktLabel(p: Produkt): string {
  const base = `${p.marke ? p.marke + ' ' : ''}${p.name}${p.modell && p.modell !== p.name ? ` (${p.modell})` : ''}`.trim();
  const compat = p.compatible_camera_names ?? [];
  if (compat.length === 0) return base;
  if (compat.length === 1 && compat[0] === 'Alle Kameras') return `${base} — Alle Kameras`;
  return `${base} — fuer ${compat.join(', ')}`;
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
  const [bestand, setBestand] = useState(0);
  const [wbwEnabled, setWbwEnabled] = useState(false);
  const [wbw, setWbw] = useState<number>(0);
  const [notizen, setNotizen] = useState('');
  const [produkte, setProdukte] = useState<Produkt[]>([]);
  const [produktId, setProduktId] = useState<string>(searchParams.get('produkt_id') ?? '');

  // Code-Builder: 4 Segmente
  const [seg1, setSeg1] = useState(''); // Kategorie-Code (CAM, STO, ...)
  const [seg2, setSeg2] = useState(''); // Hersteller-Code (GPR, SAN, ...)
  const [seg3, setSeg3] = useState(''); // Name (frei oder aus Suggestion)
  const [seg4, setSeg4] = useState('01'); // Auto-Nummer
  const [seg4Loading, setSeg4Loading] = useState(false);
  const [codeSegmente, setCodeSegmente] = useState<CodeSegment[]>([]);
  const [seg3Suggestions, setSeg3Suggestions] = useState<Seg3Suggestion[]>([]);

  // Berechneter Code
  const inventarCode = seg1 && seg2 && seg3
    ? `${seg1}-${seg2}-${seg3.toUpperCase().replace(/[^A-Z0-9]/g, '')}-${seg4}`
    : '';

  // Produkte laden
  useEffect(() => {
    fetch('/api/admin/produkte')
      .then((r) => (r.ok ? r.json() : { produkte: [] }))
      .then((data) => setProdukte(data.produkte ?? []))
      .catch(() => setProdukte([]));
  }, []);

  // Code-Segmente (Kategorie + Hersteller) laden
  useEffect(() => {
    fetch('/api/admin/inventar/code-segmente')
      .then((r) => (r.ok ? r.json() : { segmente: [] }))
      .then((data) => setCodeSegmente(data.segmente ?? []))
      .catch(() => setCodeSegmente([]));
  }, []);

  // Bei Seg1+Seg2-Wechsel: Seg3-Vorschlaege laden
  useEffect(() => {
    if (!seg1 || !seg2) {
      setSeg3Suggestions([]);
      return;
    }
    const sp = new URLSearchParams({ seg1, seg2 });
    fetch(`/api/admin/inventar/seg3-suggestions?${sp.toString()}`)
      .then((r) => (r.ok ? r.json() : { suggestions: [] }))
      .then((data) => setSeg3Suggestions(data.suggestions ?? []))
      .catch(() => setSeg3Suggestions([]));
  }, [seg1, seg2]);

  // Bei vollstaendiger Seg1-3 Kombi: naechste Nummer berechnen
  useEffect(() => {
    if (!seg1 || !seg2 || !seg3) {
      setSeg4('01');
      return;
    }
    const cleanedSeg3 = seg3.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!cleanedSeg3) return;
    setSeg4Loading(true);
    const sp = new URLSearchParams({ seg1, seg2, seg3: cleanedSeg3 });
    fetch(`/api/admin/inventar/next-code-number?${sp.toString()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.seg4) setSeg4(data.seg4);
      })
      .catch(() => { /* default bleibt 01 */ })
      .finally(() => setSeg4Loading(false));
  }, [seg1, seg2, seg3]);

  // Bezeichnung aus Produkt-Auswahl vorbelegen (nur wenn noch leer)
  useEffect(() => {
    if (!produktId || bezeichnung.trim()) return;
    const p = produkte.find((x) => x.id === produktId);
    if (p) {
      setBezeichnung(`${p.marke ? p.marke + ' ' : ''}${p.name}`.trim());
    }
    // bewusst NUR auf produktId reagieren, damit User die bezeichnung danach
    // frei bearbeiten kann ohne dass sie wieder ueberschrieben wird.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [produktId]);

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
              <option key={p.id} value={p.id}>{produktLabel(p)}</option>
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

          <CodeBuilder
            seg1={seg1} setSeg1={setSeg1}
            seg2={seg2} setSeg2={setSeg2}
            seg3={seg3} setSeg3={setSeg3}
            seg4={seg4} seg4Loading={seg4Loading}
            inventarCode={inventarCode}
            codeSegmente={codeSegmente}
            seg3Suggestions={seg3Suggestions}
          />

          {trackingMode === 'individual' && (
            <>
              <Label>Seriennummer (vom Hersteller)</Label>
              <input value={seriennummer} onChange={(e) => setSeriennummer(e.target.value)} placeholder="optional" className="w-full bg-[#111827] border border-slate-700 rounded px-3 py-2 text-base font-mono text-sm" />
            </>
          )}

          {trackingMode === 'bulk' && (
            <>
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

interface CodeBuilderProps {
  seg1: string; setSeg1: (v: string) => void;
  seg2: string; setSeg2: (v: string) => void;
  seg3: string; setSeg3: (v: string) => void;
  seg4: string; seg4Loading: boolean;
  inventarCode: string;
  codeSegmente: CodeSegment[];
  seg3Suggestions: Seg3Suggestion[];
}

function CodeBuilder({ seg1, setSeg1, seg2, setSeg2, seg3, setSeg3, seg4, seg4Loading, inventarCode, codeSegmente, seg3Suggestions }: CodeBuilderProps) {
  const kategorien = codeSegmente.filter((s) => s.typ === 'kategorie');
  const hersteller = codeSegmente.filter((s) => s.typ === 'hersteller');
  const noStammdaten = codeSegmente.length === 0;

  return (
    <div className="border border-slate-800 bg-slate-900/40 rounded p-3 space-y-3">
      <div className="flex items-baseline justify-between">
        <Label>Inventar-Code *</Label>
        <Link href="/admin/inventar/code-segmente" className="text-xs text-cyan-400 hover:text-cyan-300">
          Stammdaten pflegen ↗
        </Link>
      </div>

      {noStammdaten && (
        <div className="px-3 py-2 bg-amber-500/10 border border-amber-500/30 text-amber-300 rounded text-xs">
          ⚠ Noch keine Code-Segmente angelegt. Bitte zuerst <Link href="/admin/inventar/code-segmente" className="underline">Stammdaten</Link> pflegen.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
        {/* Seg 1 — Kategorie */}
        <div>
          <label className="block text-[11px] text-slate-500 mb-1">Kategorie</label>
          <select value={seg1} onChange={(e) => setSeg1(e.target.value)} className="w-full bg-[#0a0f1e] border border-slate-700 rounded px-2 py-1.5 text-sm font-mono">
            <option value="">—</option>
            {kategorien.map((k) => (
              <option key={k.id} value={k.code}>{k.code} · {k.label}</option>
            ))}
          </select>
        </div>

        {/* Seg 2 — Hersteller */}
        <div>
          <label className="block text-[11px] text-slate-500 mb-1">Hersteller</label>
          <select value={seg2} onChange={(e) => setSeg2(e.target.value)} className="w-full bg-[#0a0f1e] border border-slate-700 rounded px-2 py-1.5 text-sm font-mono">
            <option value="">—</option>
            {hersteller.map((h) => (
              <option key={h.id} value={h.code}>{h.code} · {h.label}</option>
            ))}
          </select>
        </div>

        {/* Seg 3 — Name (Combobox: Datalist) */}
        <div>
          <label className="block text-[11px] text-slate-500 mb-1">
            Name {seg3Suggestions.length > 0 && <span className="text-slate-600">({seg3Suggestions.length} bekannt)</span>}
          </label>
          <input
            list="seg3-list"
            value={seg3}
            onChange={(e) => setSeg3(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            placeholder="z.B. 128"
            disabled={!seg1 || !seg2}
            className="w-full bg-[#0a0f1e] border border-slate-700 disabled:bg-slate-800 disabled:text-slate-500 rounded px-2 py-1.5 text-sm font-mono"
          />
          <datalist id="seg3-list">
            {seg3Suggestions.map((s) => (
              <option key={s.name} value={s.name}>{s.count}× vorhanden</option>
            ))}
          </datalist>
        </div>

        {/* Seg 4 — Laufende Nr (read-only) */}
        <div>
          <label className="block text-[11px] text-slate-500 mb-1">
            Laufende Nr {seg4Loading && <span className="text-slate-600">(berechne…)</span>}
          </label>
          <input
            value={seg4}
            readOnly
            className="w-full bg-slate-800 border border-slate-700 text-slate-300 rounded px-2 py-1.5 text-sm font-mono cursor-not-allowed"
          />
        </div>
      </div>

      {/* Live-Preview */}
      <div className="pt-2 border-t border-slate-800">
        <div className="text-[11px] text-slate-500 mb-1">Code wird:</div>
        <div className="font-mono text-base text-cyan-300">
          {inventarCode || <span className="text-slate-600 italic">— Bitte alle 4 Segmente fuellen —</span>}
        </div>
      </div>
    </div>
  );
}
