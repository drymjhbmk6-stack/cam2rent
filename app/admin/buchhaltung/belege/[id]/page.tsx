'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import AdminBackLink from '@/components/admin/AdminBackLink';

type Klass = 'pending' | 'afa' | 'gwg' | 'ausgabe' | 'ignoriert';

const KLASS_LABEL: Record<Klass, string> = {
  pending: 'Offen', afa: 'AfA', gwg: 'GWG', ausgabe: 'Ausgabe', ignoriert: 'Ignorieren',
};

interface Beleg {
  id: string; beleg_nr: string; interne_beleg_no: string | null;
  beleg_datum: string; bezahl_datum: string | null;
  rechnungsnummer_lieferant: string | null; summe_netto: number; summe_brutto: number;
  status: 'offen'|'teilweise'|'klassifiziert'|'festgeschrieben';
  quelle: string; ist_eigenbeleg: boolean; eigenbeleg_grund: string | null;
  notizen: string | null; festgeschrieben_at: string | null;
  lieferant: { id: string; name: string; adresse?: string | null; email?: string | null; ust_id?: string | null } | null;
}
interface Position {
  id: string; reihenfolge: number; bezeichnung: string; menge: number;
  einzelpreis_netto: number; mwst_satz: number;
  gesamt_netto: number; gesamt_brutto: number;
  klassifizierung: Klass; kategorie: string | null; notizen: string | null;
  locked: boolean; ki_vorschlag: { klassifizierung: string; begruendung: string; confidence: number } | null;
}
interface Anhang {
  id: string; storage_path: string; dateiname: string; typ: string; mime_type: string; size_bytes: number | null;
}

function fmtEuro(n: number) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n);
}
function fmtDate(s: string | null) {
  return s ? new Date(s).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' }) : '–';
}

export default function BelegDetailPage() {
  const params = useParams();
  const router = useRouter();
  const belegId = String(params?.id ?? '');

  const [beleg, setBeleg] = useState<Beleg | null>(null);
  const [positionen, setPositionen] = useState<Position[]>([]);
  const [anhaenge, setAnhaenge] = useState<Anhang[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    setLoading(true);
    const res = await fetch(`/api/admin/belege/${belegId}`);
    if (!res.ok) {
      setError('Beleg nicht gefunden');
      setLoading(false);
      return;
    }
    const data = await res.json();
    setBeleg(data.beleg);
    setPositionen(data.positionen);
    setAnhaenge(data.anhaenge);
    setLoading(false);
  }

  useEffect(() => { reload(); }, [belegId]);

  async function setKlassifizierung(posId: string, klass: Klass) {
    const res = await fetch(`/api/admin/beleg-positionen/${posId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ klassifizierung: klass }),
    });
    if (res.ok) reload();
  }

  async function applyKi() {
    setBusy(true);
    const res = await fetch(`/api/admin/belege/${belegId}/ki-klassifizierung`, { method: 'POST' });
    if (!res.ok) setError((await res.json()).error);
    await reload();
    setBusy(false);
  }

  async function handleUploadAnhang(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    fd.append('kind', 'rechnung');
    const res = await fetch(`/api/admin/belege/${belegId}/anhaenge`, { method: 'POST', body: fd });
    if (res.ok) reload();
    else setError((await res.json()).error);
  }

  async function openAnhang(anhang: Anhang) {
    const res = await fetch(`/api/admin/belege/${belegId}/anhaenge/${anhang.id}?signed=1`);
    const data = await res.json();
    if (data.url) window.open(data.url, '_blank');
  }

  async function handleFestschreiben() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/belege/${belegId}/festschreiben`, { method: 'POST' });
    if (!res.ok) {
      setError((await res.json()).error);
      setBusy(false);
      return;
    }
    await reload();
    setBusy(false);
  }

  async function handleDelete() {
    if (!confirm('Beleg wirklich löschen?')) return;
    const res = await fetch(`/api/admin/belege/${belegId}`, { method: 'DELETE' });
    if (res.ok) router.push('/admin/buchhaltung/belege');
    else setError((await res.json()).error);
  }

  if (loading) return <div className="p-6 text-slate-400">Lädt…</div>;
  if (!beleg) return <div className="p-6 text-rose-400">{error ?? 'Nicht gefunden'}</div>;

  const isLocked = beleg.status === 'festgeschrieben';
  const allClassified = positionen.length > 0 && positionen.every((p) => p.klassifizierung !== 'pending');

  return (
    <div className="min-h-screen bg-[#0a0f1e] text-slate-50 px-4 sm:px-6 py-6">
      <AdminBackLink href="/admin/buchhaltung/belege" />
      <div className="max-w-5xl mx-auto mt-4 space-y-6">
        {/* Header */}
        <div className="flex flex-wrap justify-between items-start gap-3">
          <div>
            <h1 className="text-2xl font-heading">{beleg.beleg_nr}</h1>
            {beleg.interne_beleg_no && beleg.interne_beleg_no !== beleg.beleg_nr && (
              <p className="text-xs text-slate-400 font-mono">Intern: {beleg.interne_beleg_no}</p>
            )}
            <p className="text-sm text-slate-400">
              {fmtDate(beleg.beleg_datum)}
              {beleg.lieferant && ` · ${beleg.lieferant.name}`}
              {beleg.rechnungsnummer_lieferant && ` · Rg-Nr ${beleg.rechnungsnummer_lieferant}`}
            </p>
          </div>
          <div className="text-right">
            <div className="text-xs text-slate-400">Brutto-Summe</div>
            <div className="text-2xl font-mono">{fmtEuro(Number(beleg.summe_brutto))}</div>
            <div className="text-xs text-slate-400">netto {fmtEuro(Number(beleg.summe_netto))}</div>
          </div>
        </div>

        {isLocked && (
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 rounded text-sm">
            🔒 Beleg ist festgeschrieben (am {fmtDate(beleg.festgeschrieben_at)}). Keine Änderungen mehr möglich.
          </div>
        )}
        {error && <div className="p-3 bg-rose-500/10 border border-rose-500/30 text-rose-300 rounded text-sm">{error}</div>}

        {/* Anhaenge */}
        <section className="bg-[#111827] border border-slate-800 rounded p-4">
          <h2 className="font-semibold mb-3">Anhänge ({anhaenge.length})</h2>
          {anhaenge.length === 0 && !isLocked && (
            <p className="text-sm text-amber-400 mb-2">⚠ Kein Anhang. Bei Festschreibung muss entweder ein Anhang hochgeladen oder Eigenbeleg-Begründung gesetzt sein.</p>
          )}
          <div className="space-y-2">
            {anhaenge.map((a) => (
              <div key={a.id} className="flex justify-between items-center p-2 bg-slate-900/40 rounded">
                <button onClick={() => openAnhang(a)} className="text-cyan-400 hover:text-cyan-300 text-sm flex-1 text-left">
                  📎 {a.dateiname} ({a.typ})
                </button>
              </div>
            ))}
          </div>
          {!isLocked && (
            <label className="inline-block mt-3 cursor-pointer text-sm text-cyan-400 hover:text-cyan-300">
              + Anhang hinzufügen
              <input type="file" className="hidden" onChange={handleUploadAnhang} accept="application/pdf,image/*" />
            </label>
          )}
        </section>

        {/* Positionen */}
        <section className="bg-[#111827] border border-slate-800 rounded p-4">
          <div className="flex justify-between items-center mb-3">
            <h2 className="font-semibold">Positionen ({positionen.length})</h2>
            {!isLocked && (
              <button onClick={applyKi} disabled={busy} className="text-cyan-400 hover:text-cyan-300 text-sm">
                {busy ? 'KI läuft…' : '✨ KI-Klassifizierung'}
              </button>
            )}
          </div>
          <div className="space-y-2">
            {positionen.map((p) => (
              <div key={p.id} className="p-3 bg-slate-900/40 rounded">
                <div className="flex justify-between items-start mb-2">
                  <div className="flex-1">
                    <div className="font-medium">{p.bezeichnung}</div>
                    <div className="text-xs text-slate-400">
                      {p.menge}× {fmtEuro(Number(p.einzelpreis_netto))} netto · {p.mwst_satz}% MwSt = {fmtEuro(Number(p.gesamt_brutto))} brutto
                    </div>
                    {p.ki_vorschlag && p.klassifizierung === 'pending' && (
                      <div className="text-xs text-cyan-400 italic mt-1">
                        💡 KI: {p.ki_vorschlag.klassifizierung} — {p.ki_vorschlag.begruendung}
                      </div>
                    )}
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded border ${
                    p.klassifizierung === 'pending' ? 'bg-amber-500/10 text-amber-300 border-amber-500/30' :
                    p.klassifizierung === 'afa' ? 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30' :
                    p.klassifizierung === 'gwg' ? 'bg-amber-500/10 text-amber-300 border-amber-500/30' :
                    p.klassifizierung === 'ausgabe' ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' :
                    'bg-slate-700/30 text-slate-400 border-slate-700'
                  }`}>
                    {KLASS_LABEL[p.klassifizierung]}
                  </span>
                </div>
                {!p.locked && (
                  <div className="flex gap-2 flex-wrap">
                    {(['afa', 'gwg', 'ausgabe', 'ignoriert'] as const).map((k) => (
                      <button
                        key={k}
                        onClick={() => setKlassifizierung(p.id, k)}
                        className={`px-2 py-0.5 text-xs rounded border ${
                          p.klassifizierung === k ? 'bg-cyan-500 text-slate-900 border-cyan-400 font-semibold' : 'bg-slate-800 hover:bg-slate-700 border-slate-700'
                        }`}
                      >
                        {KLASS_LABEL[k]}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Aktionen */}
        {!isLocked && (
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={handleFestschreiben}
              disabled={busy || !allClassified}
              className="px-4 py-2 bg-emerald-500 disabled:bg-slate-700 hover:bg-emerald-400 disabled:text-slate-500 text-slate-900 rounded font-semibold"
            >
              {busy ? 'Wird festgeschrieben…' : '🔒 Festschreiben'}
            </button>
            <button onClick={handleDelete} className="px-4 py-2 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 rounded">
              Löschen
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
