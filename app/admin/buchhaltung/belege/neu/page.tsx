'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminBackLink from '@/components/admin/AdminBackLink';

type Klass = 'pending' | 'afa' | 'gwg' | 'ausgabe' | 'ignoriert';

interface Lieferant { id: string; name: string; }
interface Position {
  bezeichnung: string;
  menge: number;
  einzelpreis_netto: number;
  mwst_satz: number;
  klassifizierung?: Klass;
  ki_vorschlag?: { klassifizierung: string; begruendung: string; confidence: number } | null;
}

const KLASS_LABEL: Record<Klass, string> = {
  pending: 'Offen',
  afa: 'AfA',
  gwg: 'GWG',
  ausgabe: 'Ausgabe',
  ignoriert: 'Ignorieren',
};

function fmtEuro(n: number) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n);
}

export default function NeuerBelegWizard() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [quelle, setQuelle] = useState<'upload' | 'manuell' | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 2 Form-State
  const [lieferanten, setLieferanten] = useState<Lieferant[]>([]);
  const [lieferantId, setLieferantId] = useState<string>('');
  const [neuerLieferantName, setNeuerLieferantName] = useState('');
  const [belegDatum, setBelegDatum] = useState(new Date().toISOString().slice(0, 10));
  const [bezahlDatum, setBezahlDatum] = useState('');
  const [rechnungsnummer, setRechnungsnummer] = useState('');
  const [istEigenbeleg, setIstEigenbeleg] = useState(false);
  const [eigenbelegGrund, setEigenbelegGrund] = useState('');
  const [positionen, setPositionen] = useState<Position[]>([
    { bezeichnung: '', menge: 1, einzelpreis_netto: 0, mwst_satz: 19 },
  ]);

  // Step 3 erstellt + im Beleg verwaltet
  const [belegId, setBelegId] = useState<string | null>(null);
  const [step3Positionen, setStep3Positionen] = useState<Array<Position & { id: string; gesamt_netto: number; gesamt_brutto: number }>>([]);

  useEffect(() => {
    fetch('/api/admin/lieferanten').then((r) => r.json()).then((d) => setLieferanten(d.lieferanten ?? []));
  }, []);

  const summeNetto = positionen.reduce((s, p) => s + p.menge * p.einzelpreis_netto, 0);
  const summeBrutto = positionen.reduce((s, p) => s + p.menge * p.einzelpreis_netto * (1 + p.mwst_satz / 100), 0);

  async function handleNextFromStep1() {
    if (!quelle) return;
    if (quelle === 'upload' && !file) {
      setError('Datei auswählen');
      return;
    }
    setError(null);
    setStep(2);
  }

  async function handleSaveStep2() {
    setBusy(true);
    setError(null);
    try {
      // Optional: neuen Lieferanten anlegen
      let lid = lieferantId;
      if (!lid && neuerLieferantName.trim()) {
        const res = await fetch('/api/admin/lieferanten', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: neuerLieferantName.trim() }),
        });
        if (!res.ok) throw new Error((await res.json()).error ?? 'Lieferant konnte nicht angelegt werden');
        const data = await res.json();
        lid = data.lieferant.id;
      }

      // Beleg anlegen
      const sane = positionen.filter((p) => p.bezeichnung.trim().length > 0);
      if (sane.length === 0) throw new Error('Mindestens eine Position erforderlich');

      const res = await fetch('/api/admin/belege', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          beleg_datum: belegDatum,
          bezahl_datum: bezahlDatum || null,
          lieferant_id: lid || null,
          rechnungsnummer_lieferant: rechnungsnummer || null,
          quelle,
          ist_eigenbeleg: istEigenbeleg,
          eigenbeleg_grund: istEigenbeleg ? (eigenbelegGrund.trim() || 'Kein Beleg verfügbar') : null,
          positionen: sane.map((p, i) => ({
            reihenfolge: i,
            bezeichnung: p.bezeichnung,
            menge: p.menge,
            einzelpreis_netto: p.einzelpreis_netto,
            mwst_satz: p.mwst_satz,
            klassifizierung: 'pending',
          })),
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Fehler beim Speichern');
      const { beleg } = await res.json();
      setBelegId(beleg.id);

      // Anhang hochladen falls upload-Pfad
      if (quelle === 'upload' && file) {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('kind', 'rechnung');
        await fetch(`/api/admin/belege/${beleg.id}/anhaenge`, { method: 'POST', body: fd });
      }

      // Positionen vom Server holen (mit IDs)
      const detail = await fetch(`/api/admin/belege/${beleg.id}`).then((r) => r.json());
      setStep3Positionen(detail.positionen);
      setStep(3);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function setKlassifizierung(posId: string, klass: Klass) {
    const res = await fetch(`/api/admin/beleg-positionen/${posId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ klassifizierung: klass }),
    });
    if (res.ok) {
      setStep3Positionen((prev) => prev.map((p) => p.id === posId ? { ...p, klassifizierung: klass } : p));
    }
  }

  async function applyKi() {
    if (!belegId) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/belege/${belegId}/ki-klassifizierung`, { method: 'POST' });
      if (!res.ok) throw new Error((await res.json()).error);
      const detail = await fetch(`/api/admin/belege/${belegId}`).then((r) => r.json());
      setStep3Positionen(detail.positionen);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleFestschreiben() {
    if (!belegId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/belege/${belegId}/festschreiben`, { method: 'POST' });
      if (!res.ok) throw new Error((await res.json()).error);
      router.push(`/admin/buchhaltung/belege/${belegId}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  const allClassified = step3Positionen.length > 0 && step3Positionen.every((p) => p.klassifizierung !== 'pending');

  return (
    <div className="min-h-screen bg-[#0a0f1e] text-slate-50 px-4 sm:px-6 py-6">
      <AdminBackLink href="/admin/buchhaltung/belege" />
      <div className="max-w-4xl mx-auto mt-4">
        <h1 className="text-2xl font-heading mb-2">Neuer Beleg</h1>

        {/* Stepper */}
        <div className="flex gap-2 mb-6 text-xs">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`flex-1 px-3 py-2 rounded border ${step === s ? 'bg-cyan-500 text-slate-900 border-cyan-400 font-semibold' : step > s ? 'bg-emerald-900/30 border-emerald-700 text-emerald-300' : 'bg-slate-900 border-slate-700 text-slate-500'}`}
            >
              {s}. {s === 1 ? 'Quelle' : s === 2 ? 'Daten' : 'Klassifizierung'}
            </div>
          ))}
        </div>

        {error && <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/30 text-rose-300 rounded text-sm">{error}</div>}

        {/* Step 1: Quelle */}
        {step === 1 && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                onClick={() => setQuelle('upload')}
                className={`p-4 text-left rounded border ${quelle === 'upload' ? 'border-cyan-400 bg-cyan-500/10' : 'border-slate-700 bg-[#111827] hover:border-slate-600'}`}
              >
                <div className="font-semibold">📄 PDF/Foto hochladen</div>
                <div className="text-xs text-slate-400 mt-1">OCR liest Lieferant + Positionen automatisch</div>
              </button>
              <button
                onClick={() => setQuelle('manuell')}
                className={`p-4 text-left rounded border ${quelle === 'manuell' ? 'border-cyan-400 bg-cyan-500/10' : 'border-slate-700 bg-[#111827] hover:border-slate-600'}`}
              >
                <div className="font-semibold">✍ Manuell erfassen</div>
                <div className="text-xs text-slate-400 mt-1">Lieferant + Positionen direkt eingeben</div>
              </button>
            </div>

            {quelle === 'upload' && (
              <div className="p-4 bg-[#111827] border border-slate-800 rounded">
                <label className="block text-sm mb-2">Datei wählen (PDF, JPG, PNG, WebP, max 20 MB)</label>
                <input
                  type="file"
                  accept="application/pdf,image/jpeg,image/png,image/webp,image/heic"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="text-sm"
                />
              </div>
            )}

            <button
              onClick={handleNextFromStep1}
              disabled={!quelle}
              className="px-4 py-2 bg-cyan-500 disabled:bg-slate-700 hover:bg-cyan-400 text-slate-900 disabled:text-slate-500 rounded font-semibold"
            >
              Weiter
            </button>
          </div>
        )}

        {/* Step 2: Daten */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm mb-1">Lieferant</label>
                <select value={lieferantId} onChange={(e) => setLieferantId(e.target.value)} className="w-full bg-[#111827] border border-slate-700 rounded px-3 py-2 text-base">
                  <option value="">– wählen –</option>
                  {lieferanten.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
                <input
                  type="text"
                  placeholder="oder neuen Lieferanten anlegen…"
                  value={neuerLieferantName}
                  onChange={(e) => setNeuerLieferantName(e.target.value)}
                  className="w-full bg-[#111827] border border-slate-700 rounded px-3 py-2 text-sm mt-2"
                />
              </div>
              <div>
                <label className="block text-sm mb-1">Beleg-Datum *</label>
                <input type="date" value={belegDatum} onChange={(e) => setBelegDatum(e.target.value)} className="w-full bg-[#111827] border border-slate-700 rounded px-3 py-2 text-base" />
              </div>
              <div>
                <label className="block text-sm mb-1">Bezahl-Datum</label>
                <input type="date" value={bezahlDatum} onChange={(e) => setBezahlDatum(e.target.value)} className="w-full bg-[#111827] border border-slate-700 rounded px-3 py-2 text-base" />
              </div>
              <div>
                <label className="block text-sm mb-1">Rechnungsnummer Lieferant</label>
                <input type="text" value={rechnungsnummer} onChange={(e) => setRechnungsnummer(e.target.value)} className="w-full bg-[#111827] border border-slate-700 rounded px-3 py-2 text-base" />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input type="checkbox" id="eigenbeleg" checked={istEigenbeleg} onChange={(e) => setIstEigenbeleg(e.target.checked)} />
              <label htmlFor="eigenbeleg" className="text-sm">Eigenbeleg (kein offizielles Dokument)</label>
            </div>
            {istEigenbeleg && (
              <input
                type="text"
                placeholder="Begründung (Pflicht)"
                value={eigenbelegGrund}
                onChange={(e) => setEigenbelegGrund(e.target.value)}
                className="w-full bg-[#111827] border border-amber-700 rounded px-3 py-2 text-base"
              />
            )}

            {/* Positionen */}
            <div>
              <h3 className="text-sm font-semibold mb-2">Positionen</h3>
              <div className="space-y-2">
                {positionen.map((p, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                    <input
                      placeholder="Bezeichnung"
                      value={p.bezeichnung}
                      onChange={(e) => setPositionen((prev) => prev.map((pp, i) => i === idx ? { ...pp, bezeichnung: e.target.value } : pp))}
                      className="col-span-5 bg-[#111827] border border-slate-700 rounded px-2 py-1.5 text-sm"
                    />
                    <input
                      type="number" min="1"
                      value={p.menge}
                      onChange={(e) => setPositionen((prev) => prev.map((pp, i) => i === idx ? { ...pp, menge: Math.max(1, parseInt(e.target.value || '1', 10)) } : pp))}
                      className="col-span-1 bg-[#111827] border border-slate-700 rounded px-2 py-1.5 text-sm"
                    />
                    <input
                      type="number" step="0.01" min="0"
                      placeholder="Einzelpreis netto"
                      value={p.einzelpreis_netto}
                      onChange={(e) => setPositionen((prev) => prev.map((pp, i) => i === idx ? { ...pp, einzelpreis_netto: parseFloat(e.target.value || '0') } : pp))}
                      className="col-span-3 bg-[#111827] border border-slate-700 rounded px-2 py-1.5 text-sm"
                    />
                    <input
                      type="number" step="0.5" min="0" max="100"
                      value={p.mwst_satz}
                      onChange={(e) => setPositionen((prev) => prev.map((pp, i) => i === idx ? { ...pp, mwst_satz: parseFloat(e.target.value || '19') } : pp))}
                      className="col-span-2 bg-[#111827] border border-slate-700 rounded px-2 py-1.5 text-sm"
                    />
                    <button
                      onClick={() => setPositionen((prev) => prev.filter((_, i) => i !== idx))}
                      disabled={positionen.length === 1}
                      className="col-span-1 text-rose-400 hover:text-rose-300 disabled:text-slate-600"
                    >✕</button>
                  </div>
                ))}
              </div>
              <button
                onClick={() => setPositionen((p) => [...p, { bezeichnung: '', menge: 1, einzelpreis_netto: 0, mwst_satz: 19 }])}
                className="mt-2 text-cyan-400 text-sm hover:text-cyan-300"
              >+ Position hinzufügen</button>
              <div className="mt-3 text-right text-sm text-slate-400">
                Netto: <span className="font-mono text-slate-200">{fmtEuro(summeNetto)}</span>
                {' · '}
                Brutto: <span className="font-mono text-slate-200">{fmtEuro(summeBrutto)}</span>
              </div>
            </div>

            <div className="flex gap-2">
              <button onClick={() => setStep(1)} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded">Zurück</button>
              <button onClick={handleSaveStep2} disabled={busy} className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 disabled:bg-slate-700 text-slate-900 rounded font-semibold">
                {busy ? 'Speichert…' : 'Weiter zur Klassifizierung'}
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Klassifizierung */}
        {step === 3 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-400">Klassifiziere jede Position. Erst danach kann der Beleg festgeschrieben werden.</p>
              <button onClick={applyKi} disabled={busy} className="text-cyan-400 hover:text-cyan-300 text-sm">
                {busy ? 'KI läuft…' : '✨ KI-Klassifizierung anwenden'}
              </button>
            </div>

            {step3Positionen.map((p) => (
              <div key={p.id} className="p-3 bg-[#111827] border border-slate-800 rounded">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <div className="font-semibold">{p.bezeichnung}</div>
                    <div className="text-xs text-slate-400">{p.menge}× {fmtEuro(Number(p.einzelpreis_netto))} = {fmtEuro(Number(p.gesamt_brutto))} brutto</div>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded border ${
                    p.klassifizierung === 'pending' ? 'bg-amber-500/10 text-amber-300 border-amber-500/30' :
                    p.klassifizierung === 'afa' ? 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30' :
                    p.klassifizierung === 'gwg' ? 'bg-amber-500/10 text-amber-300 border-amber-500/30' :
                    p.klassifizierung === 'ausgabe' ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' :
                    'bg-slate-700/30 text-slate-400 border-slate-700'
                  }`}>
                    {KLASS_LABEL[p.klassifizierung as Klass] ?? '—'}
                  </span>
                </div>
                {p.ki_vorschlag && (
                  <div className="text-xs text-slate-400 italic mb-2">
                    💡 KI: {p.ki_vorschlag.klassifizierung} — {p.ki_vorschlag.begruendung} ({Math.round(p.ki_vorschlag.confidence * 100)}%)
                  </div>
                )}
                <div className="flex gap-2 flex-wrap">
                  {(['afa', 'gwg', 'ausgabe', 'ignoriert'] as const).map((k) => (
                    <button
                      key={k}
                      onClick={() => setKlassifizierung(p.id, k)}
                      className={`px-3 py-1 text-xs rounded border ${
                        p.klassifizierung === k ? 'bg-cyan-500 text-slate-900 border-cyan-400 font-semibold' : 'bg-slate-800 hover:bg-slate-700 border-slate-700'
                      }`}
                    >
                      {KLASS_LABEL[k]}
                    </button>
                  ))}
                </div>
              </div>
            ))}

            <div className="flex gap-2 pt-3 border-t border-slate-800">
              <Link href={`/admin/buchhaltung/belege/${belegId}`} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded">
                Speichern & schließen
              </Link>
              <button
                onClick={handleFestschreiben}
                disabled={busy || !allClassified}
                className="px-4 py-2 bg-emerald-500 disabled:bg-slate-700 hover:bg-emerald-400 disabled:text-slate-500 text-slate-900 rounded font-semibold"
              >
                {busy ? 'Wird festgeschrieben…' : '🔒 Beleg festschreiben'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
