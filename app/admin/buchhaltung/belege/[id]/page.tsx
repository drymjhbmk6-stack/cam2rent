'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import AdminBackLink from '@/components/admin/AdminBackLink';
import { shrinkImageFileIfNeeded } from '@/lib/shrink-image-client';
import { formatCurrency } from '@/lib/format-utils';

type Klass = 'pending' | 'afa' | 'gwg' | 'ausgabe' | 'verbrauch' | 'ignoriert';

const KLASS_LABEL: Record<Klass, string> = {
  pending: 'Offen', afa: 'AfA', gwg: 'GWG', verbrauch: 'Verbrauch', ausgabe: 'Ausgabe', ignoriert: 'Ignorieren',
};
const KLASS_HINT: Record<Klass, string> = {
  pending: 'Noch nicht klassifiziert',
  afa: 'AfA = Anlagegut über 800 € netto. Wird über mehrere Jahre abgeschrieben (linear, typisch 36 Monate). Erscheint im Anlagenverzeichnis und kann ins Inventar übernommen werden.',
  gwg: 'GWG = Geringwertiges Wirtschaftsgut zwischen 250 und 800 € netto. Wird im Jahr der Anschaffung sofort vollständig abgeschrieben, erscheint trotzdem im Anlagenverzeichnis (Verzeichnis-Pflicht). Kann ins Inventar übernommen werden.',
  verbrauch: 'Verbrauchsmaterial unter 250 € netto (SD-Karten, ND-Filter, Schrauben, Akkus, Reinigungsmittel). Sofort-Aufwand in der EÜR — kann aber als Bulk- oder Einzel-Inventar geführt werden, weil es auf Lager liegt und beim Versand mitgepackt wird.',
  ausgabe: 'Ausgabe ohne Inventar (Versand, Stripe-Gebühren, Marketing, Software-Abos, Versicherung, Rabatt-Zeile). Sofort-Aufwand in der EÜR, taucht NICHT im Inventar-Picker auf.',
  ignoriert: 'Position wird NICHT verbucht — z. B. private Anschaffung versehentlich auf der Geschäftsrechnung, durchlaufender Posten, Pfand.',
};

interface Beleg {
  id: string; beleg_nr: string; interne_beleg_no: string | null;
  beleg_datum: string; bezahl_datum: string | null;
  rechnungsnummer_lieferant: string | null; summe_netto: number; summe_brutto: number;
  status: 'offen'|'teilweise'|'klassifiziert'|'festgeschrieben';
  quelle: string; ist_eigenbeleg: boolean; eigenbeleg_grund: string | null;
  notizen: string | null; festgeschrieben_at: string | null;
  created_at?: string | null; updated_at?: string | null; is_test?: boolean;
  ocr_status?: 'pending' | 'running' | 'done' | 'failed' | null;
  ocr_error?: string | null;
  lieferant: { id: string; name: string; adresse?: string | null; email?: string | null; ust_id?: string | null } | null;
  verdacht_duplikat_beleg_id?: string | null;
  verdacht_duplikat_grund?: string | null;
  verdacht_duplikat_dismissed_at?: string | null;
  verdacht_duplikat_existing?: { id: string; beleg_nr: string } | null;
}
interface Position {
  id: string; reihenfolge: number; bezeichnung: string; menge: number;
  einzelpreis_netto: number; mwst_satz: number;
  gesamt_netto: number; gesamt_brutto: number;
  klassifizierung: Klass; kategorie: string | null; notizen: string | null;
  locked: boolean; ki_vorschlag: {
    klassifizierung?: string; begruendung?: string; confidence?: number;
    art?: string; nutzungsdauer_monate?: number; kategorie?: string;
  } | null;
  folgekosten_asset_id?: string | null;
}
interface Anhang {
  id: string; storage_path: string; dateiname: string; typ: string; mime_type: string; size_bytes: number | null;
}
interface Verknuepfung {
  id: string;
  stueck_anteil: number;
  inventar_unit: { id: string; bezeichnung: string; inventar_code: string | null; seriennummer: string | null } | null;
}

const AUSGABE_KATEGORIEN: { value: string; label: string }[] = [
  { value: 'stripe_fees', label: 'Zahlungsgebühren' },
  { value: 'shipping', label: 'Versand' },
  { value: 'software', label: 'Software/Abos' },
  { value: 'hardware', label: 'Hardware' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'office', label: 'Büro/Allgemein' },
  { value: 'travel', label: 'Reisen' },
  { value: 'insurance', label: 'Versicherung' },
  { value: 'legal', label: 'Rechtsberatung' },
  { value: 'other', label: 'Sonstiges' },
];

const QUELLE_LABEL: Record<string, string> = {
  upload: '📄 PDF/Foto-Upload (OCR)',
  manuell: '✍ Manuell erfasst',
  stripe_sync: '💳 Stripe-Import',
  migration: '🔄 Migration',
};

function fmtDateTime(s: string | null | undefined) {
  return s ? new Date(s).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' }) : '–';
}
function fmtBytes(n: number | null) {
  if (n == null) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

// Zentraler fmtEuro aus lib/format-utils
const fmtEuro = formatCurrency;
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
  const [linksByPosition, setLinksByPosition] = useState<Record<string, Verknuepfung[]>>({});
  const [assetStatus, setAssetStatus] = useState<{ expected: number; actual: number }>({ expected: 0, actual: 0 });
  const [regenWarnings, setRegenWarnings] = useState<string[] | null>(null);
  const [regenInfo, setRegenInfo] = useState<{ created: number; afa: number } | null>(null);
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
    setLinksByPosition(data.linksByPosition ?? {});
    setAssetStatus(data.asset_status ?? { expected: 0, actual: 0 });
    setLoading(false);
  }

  async function handleRegenerateAssets() {
    setBusy(true);
    setError(null);
    setRegenWarnings(null);
    setRegenInfo(null);
    const res = await fetch(`/api/admin/belege/${belegId}/regenerate-assets`, { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? 'Fehler beim Anlegen der Anlagen');
    } else {
      setRegenWarnings(data.warnings ?? []);
      setRegenInfo({ created: data.assets_created ?? 0, afa: data.afa_buchungen_created ?? 0 });
    }
    await reload();
    setBusy(false);
  }

  useEffect(() => { reload(); }, [belegId]);

  async function setKlassifizierung(posId: string, klass: Klass) {
    const res = await fetch(`/api/admin/beleg-positionen/${posId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ klassifizierung: klass }),
    });
    if (res.ok) reload();
  }

  async function setKategorie(posId: string, kategorie: string) {
    const res = await fetch(`/api/admin/beleg-positionen/${posId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kategorie: kategorie || null }),
    });
    if (res.ok) reload();
  }

  async function applyKiVorschlag(p: Position) {
    const ki = p.ki_vorschlag;
    if (!ki) return;
    const update: Record<string, unknown> = {};
    if (ki.klassifizierung) update.klassifizierung = ki.klassifizierung;
    if (ki.kategorie) update.kategorie = ki.kategorie;
    if (!Object.keys(update).length) return;
    const res = await fetch(`/api/admin/beleg-positionen/${p.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(update),
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
    // Foto-Belege > 3.5 MB werden im Browser verkleinert (Claude Vision 5 MB-Limit).
    const uploadFile = await shrinkImageFileIfNeeded(file);
    const fd = new FormData();
    fd.append('file', uploadFile);
    fd.append('kind', 'rechnung');
    const res = await fetch(`/api/admin/belege/${belegId}/anhaenge`, { method: 'POST', body: fd });
    if (res.ok) reload();
    else setError((await res.json()).error);
  }

  async function openAnhang(anhang: Anhang) {
    // iOS Safari blockt window.open() nach await — Tab synchron oeffnen, dann
    // navigieren. Bei blockiertem Popup faellt der Aufruf auf Same-Tab zurueck.
    const win = window.open('', '_blank');
    try {
      const res = await fetch(`/api/admin/belege/${belegId}/anhaenge/${anhang.id}?signed=1`);
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(errBody.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      if (!data.url) throw new Error('Keine Signed-URL erhalten');
      if (win && !win.closed) {
        win.location.href = data.url;
      } else {
        window.location.href = data.url;
      }
    } catch (err) {
      win?.close();
      setError(`Anhang konnte nicht geoeffnet werden: ${(err as Error).message}`);
    }
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

  async function handleAufheben() {
    const confirmed = confirm(
      'Festschreibung aufheben?\n\n' +
      'Der Beleg wird wieder editierbar. Falls beim Festschreiben automatisch eine Anlage (AfA/GWG) erzeugt wurde, ' +
      'wird diese mit gelöscht — solange der monatliche AfA-Cron noch nichts weitergeschrieben hat. ' +
      'Inventar-Verknüpfungen bleiben bestehen.\n\nFortfahren?',
    );
    if (!confirmed) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/belege/${belegId}/aufheben`, { method: 'POST' });
    if (!res.ok) {
      setError((await res.json()).error ?? 'Aufheben fehlgeschlagen');
      setBusy(false);
      return;
    }
    await reload();
    setBusy(false);
  }

  async function handleRetryOcr() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/belege/${belegId}/ocr`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notify: false }),
    });
    if (!res.ok) {
      setError((await res.json()).error ?? 'OCR-Retry fehlgeschlagen');
      setBusy(false);
      return;
    }
    await reload();
    setBusy(false);
  }

  async function handleDismissDuplicate() {
    if (!confirm('Wirklich kein Duplikat? Der Beleg kann danach festgeschrieben werden.')) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/belege/${belegId}/dismiss-duplicate`, { method: 'POST' });
    if (!res.ok) {
      setError((await res.json()).error ?? 'Konnte Verdacht nicht aufheben');
      setBusy(false);
      return;
    }
    await reload();
    setBusy(false);
  }

  if (loading) return <div className="p-6 text-slate-400">Lädt…</div>;
  if (!beleg) return <div className="p-6 text-rose-400">{error ?? 'Nicht gefunden'}</div>;

  const isLocked = beleg.status === 'festgeschrieben';
  const hasOpenDuplicate = !!beleg.verdacht_duplikat_beleg_id && !beleg.verdacht_duplikat_dismissed_at;
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

        {hasOpenDuplicate && (
          <div className="p-4 bg-rose-500/10 border-2 border-rose-500/50 text-rose-200 rounded text-sm space-y-2">
            <div className="flex items-start gap-2">
              <span className="text-lg leading-none">⚠</span>
              <div className="flex-1">
                <div className="font-semibold text-rose-100">Verdacht auf Duplikat</div>
                <div className="text-xs text-rose-300 mt-1">{beleg.verdacht_duplikat_grund ?? 'Inhaltlicher Treffer mit anderem Beleg'}</div>
                {beleg.verdacht_duplikat_existing && (
                  <Link
                    href={`/admin/buchhaltung/belege/${beleg.verdacht_duplikat_existing.id}`}
                    className="inline-block mt-2 text-cyan-300 hover:text-cyan-200 underline font-mono text-xs"
                  >
                    → Original-Beleg {beleg.verdacht_duplikat_existing.beleg_nr} öffnen
                  </Link>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 pt-2 border-t border-rose-500/30">
              <button
                onClick={handleDelete}
                disabled={busy}
                className="px-3 py-1.5 bg-rose-500 hover:bg-rose-400 disabled:bg-slate-700 text-slate-900 rounded text-sm font-semibold"
              >
                🗑 Diesen Beleg löschen
              </button>
              <button
                onClick={handleDismissDuplicate}
                disabled={busy}
                className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-slate-200 rounded text-sm"
              >
                Kein Duplikat — fortfahren
              </button>
            </div>
            <p className="text-xs text-rose-300/80 pt-1">
              Festschreiben ist gesperrt, bis der Verdacht aufgelöst ist.
            </p>
          </div>
        )}
        {beleg.verdacht_duplikat_beleg_id && beleg.verdacht_duplikat_dismissed_at && (
          <div className="p-2 bg-slate-700/30 border border-slate-600 text-slate-400 rounded text-xs">
            Duplikat-Verdacht wurde bestätigt aufgehoben.
            {beleg.verdacht_duplikat_existing && (
              <> Vergleich:{' '}
                <Link
                  href={`/admin/buchhaltung/belege/${beleg.verdacht_duplikat_existing.id}`}
                  className="text-cyan-400 hover:text-cyan-300 underline font-mono"
                >
                  {beleg.verdacht_duplikat_existing.beleg_nr}
                </Link>
              </>
            )}
          </div>
        )}
        {beleg.ocr_status === 'failed' && (
          <div className="p-4 bg-rose-500/10 border-2 border-rose-500/50 text-rose-200 rounded text-sm space-y-2">
            <div className="flex items-start gap-2">
              <span className="text-lg leading-none">❌</span>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-rose-100">KI-Analyse fehlgeschlagen</div>
                {beleg.ocr_error && (
                  <div className="text-xs text-rose-300 mt-1 font-mono whitespace-pre-wrap break-words">{beleg.ocr_error}</div>
                )}
                <p className="text-xs text-rose-300/80 mt-2">
                  Häufigster Grund nach Bulk-Upload: Anthropic-Rate-Limit. Einfach erneut starten — der Server drosselt jetzt auf 3 OCRs parallel.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 pt-2 border-t border-rose-500/30">
              <button
                onClick={handleRetryOcr}
                disabled={busy}
                className="px-3 py-1.5 bg-rose-500 hover:bg-rose-400 disabled:bg-slate-700 text-slate-900 rounded text-sm font-semibold"
              >
                {busy ? 'Läuft…' : '🔄 OCR neu starten'}
              </button>
            </div>
          </div>
        )}
        {(beleg.ocr_status === 'running' || beleg.ocr_status === 'pending') && (
          <div className="p-3 bg-violet-500/10 border border-violet-500/30 text-violet-200 rounded text-sm flex items-center gap-2">
            <span className="inline-block w-2 h-2 bg-violet-400 rounded-full animate-pulse" />
            KI analysiert den Beleg gerade — Seite zeigt das Ergebnis automatisch (manchmal hilft Reload).
          </div>
        )}
        {isLocked && (
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 rounded text-sm flex flex-wrap items-center justify-between gap-3">
            <div>
              🔒 Beleg ist festgeschrieben (am {fmtDate(beleg.festgeschrieben_at)}). Keine Änderungen mehr möglich.
            </div>
            <button
              onClick={handleAufheben}
              disabled={busy}
              className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 disabled:bg-slate-700 text-slate-900 rounded text-sm font-semibold whitespace-nowrap"
              title="Macht die Festschreibung rückgängig — z.B. um eine falsche Klassifikation zu korrigieren."
            >
              {busy ? 'Wird aufgehoben…' : '↺ Aufheben'}
            </button>
          </div>
        )}
        {isLocked && assetStatus.expected > assetStatus.actual && (
          <div className="p-3 bg-amber-500/10 border border-amber-500/30 text-amber-200 rounded text-sm flex flex-wrap items-center justify-between gap-3">
            <div>
              ⚠ {assetStatus.actual} von {assetStatus.expected} erwarteten Anlagen wurden erzeugt.
              Vermutlich Silent-Fail beim Festschreiben (z.B. ungültiger <code className="font-mono">art</code>-Wert in der KI-Klassifikation).
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleRegenerateAssets}
                disabled={busy}
                className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 disabled:bg-slate-700 text-slate-900 rounded text-sm font-semibold whitespace-nowrap"
              >
                {busy ? 'Erzeuge…' : '↻ Anlagen jetzt erzeugen'}
              </button>
              <button
                onClick={async () => {
                  const res = await fetch(`/api/admin/buchhaltung/asset-debug?beleg_id=${belegId}`);
                  const data = await res.json();
                  const w = window.open('', '_blank');
                  if (w) {
                    w.document.body.style.cssText = 'background:#0a0f1e;color:#e2e8f0;font-family:monospace;padding:20px;';
                    w.document.body.innerText = JSON.stringify(data, null, 2);
                  }
                }}
                className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded text-sm whitespace-nowrap"
                title="Zeigt was wirklich in den Tabellen assets / assets_neu liegt"
              >
                🔍 Debug
              </button>
            </div>
          </div>
        )}
        {regenWarnings && regenWarnings.length > 0 && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/30 text-rose-300 rounded text-sm">
            <div className="font-semibold mb-1">Beim Erzeugen sind {regenWarnings.length} Warnungen aufgetreten:</div>
            <ul className="list-disc list-inside space-y-0.5 text-xs font-mono">
              {regenWarnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
            {regenInfo && (
              <div className="text-xs mt-2 opacity-80">Neu angelegt: {regenInfo.created} Asset(s), {regenInfo.afa} AfA-Buchung(en).</div>
            )}
          </div>
        )}
        {regenWarnings && regenWarnings.length === 0 && regenInfo && regenInfo.created > 0 && (
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 rounded text-sm">
            ✓ {regenInfo.created} Anlage(n) erzeugt, {regenInfo.afa} AfA-Buchung(en) — siehe <Link href="/admin/buchhaltung/anlagen" className="underline">Anlagenverzeichnis</Link>.
          </div>
        )}
        {regenWarnings && regenWarnings.length === 0 && regenInfo && regenInfo.created === 0 && (
          <div className="p-3 bg-amber-500/10 border border-amber-500/30 text-amber-300 rounded text-sm">
            ⚠ Keine neuen Anlagen erzeugt — der Auto-Generator hat 0 Inserts gemacht und keine Warnung geworfen.
            Wahrscheinlich existierten bereits Assets (Idempotenz-Skip). Falls du im Anlagenverzeichnis nichts siehst,
            ist das Asset evtl. in einer anderen Tabelle gelandet (assets vs. assets_neu) — bitte melden.
          </div>
        )}
        {error && <div className="p-3 bg-rose-500/10 border border-rose-500/30 text-rose-300 rounded text-sm">{error}</div>}

        {/* Beleg-Daten — gleiches Layout wie der Anlege-Wizard, read-only */}
        <section className="bg-[#111827] border border-slate-800 rounded p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm mb-1 text-slate-400">Lieferant</label>
              <input
                type="text"
                value={beleg.lieferant?.name ?? '—'}
                disabled
                className="w-full bg-[#111827] border border-slate-700 rounded px-3 py-2 text-base disabled:opacity-90"
              />
              {beleg.lieferant && (beleg.lieferant.adresse || beleg.lieferant.email || beleg.lieferant.ust_id) && (
                <div className="text-xs text-slate-500 mt-1.5 space-y-0.5">
                  {beleg.lieferant.adresse && <div className="whitespace-pre-line">{beleg.lieferant.adresse}</div>}
                  {beleg.lieferant.email && <div><a href={`mailto:${beleg.lieferant.email}`} className="text-cyan-400 hover:text-cyan-300">{beleg.lieferant.email}</a></div>}
                  {beleg.lieferant.ust_id && <div>USt-ID: <span className="font-mono">{beleg.lieferant.ust_id}</span></div>}
                </div>
              )}
            </div>
            <div>
              <label className="block text-sm mb-1 text-slate-400">Beleg-Datum *</label>
              <input
                type="text"
                value={fmtDate(beleg.beleg_datum)}
                disabled
                className="w-full bg-[#111827] border border-slate-700 rounded px-3 py-2 text-base disabled:opacity-90"
              />
            </div>
            <div>
              <label className="block text-sm mb-1 text-slate-400">Bezahl-Datum</label>
              <input
                type="text"
                value={beleg.bezahl_datum ? fmtDate(beleg.bezahl_datum) : 'TT.mm.jjjj'}
                disabled
                className={`w-full bg-[#111827] border border-slate-700 rounded px-3 py-2 text-base disabled:opacity-90 ${!beleg.bezahl_datum ? 'text-slate-500 italic' : ''}`}
              />
            </div>
            <div>
              <label className="block text-sm mb-1 text-slate-400">Rechnungsnummer Lieferant</label>
              <input
                type="text"
                value={beleg.rechnungsnummer_lieferant ?? ''}
                disabled
                className="w-full bg-[#111827] border border-slate-700 rounded px-3 py-2 text-base disabled:opacity-90"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input type="checkbox" checked={beleg.ist_eigenbeleg} disabled />
            <label className="text-sm text-slate-300">Eigenbeleg (kein offizielles Dokument)</label>
          </div>
          {beleg.ist_eigenbeleg && beleg.eigenbeleg_grund && (
            <input
              type="text"
              value={beleg.eigenbeleg_grund}
              disabled
              className="w-full bg-[#111827] border border-amber-700 rounded px-3 py-2 text-base text-amber-200 disabled:opacity-90"
            />
          )}

          {beleg.notizen && (
            <div>
              <label className="block text-sm mb-1 text-slate-400">Notizen</label>
              <textarea
                value={beleg.notizen}
                disabled
                rows={Math.max(2, beleg.notizen.split('\n').length)}
                className="w-full bg-[#111827] border border-slate-700 rounded px-3 py-2 text-sm disabled:opacity-90 resize-none"
              />
            </div>
          )}

          {/* Meta-Footer: Status, Quelle, Zeitstempel */}
          <div className="pt-3 mt-2 border-t border-slate-800 flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-500">
            <div>Status: <span className="text-slate-300 capitalize">{beleg.status}</span>{beleg.is_test && <span className="text-pink-400 ml-1">· TEST</span>}</div>
            <div>Quelle: <span className="text-slate-300">{QUELLE_LABEL[beleg.quelle] ?? beleg.quelle}</span></div>
            {beleg.interne_beleg_no && <div>Intern: <span className="text-slate-300 font-mono">{beleg.interne_beleg_no}</span></div>}
            <div>Angelegt: <span className="text-slate-300">{fmtDateTime(beleg.created_at)}</span></div>
            {beleg.updated_at && beleg.updated_at !== beleg.created_at && (
              <div>Geändert: <span className="text-slate-300">{fmtDateTime(beleg.updated_at)}</span></div>
            )}
            {beleg.festgeschrieben_at && (
              <div>Festgeschrieben: <span className="text-emerald-300">{fmtDateTime(beleg.festgeschrieben_at)}</span></div>
            )}
          </div>
        </section>

        {/* Anhaenge */}
        <section className="bg-[#111827] border border-slate-800 rounded p-4">
          <h2 className="font-semibold mb-3">Anhänge ({anhaenge.length})</h2>
          {anhaenge.length === 0 && !isLocked && (
            <p className="text-sm text-amber-400 mb-2">⚠ Kein Anhang. Bei Festschreibung muss entweder ein Anhang hochgeladen oder Eigenbeleg-Begründung gesetzt sein.</p>
          )}
          <div className="space-y-2">
            {anhaenge.map((a) => (
              <div key={a.id} className="flex justify-between items-center p-2 bg-slate-900/40 rounded gap-3">
                <button onClick={() => openAnhang(a)} className="text-cyan-400 hover:text-cyan-300 text-sm flex-1 text-left truncate">
                  📎 {a.dateiname}
                </button>
                <span className="text-xs text-slate-500 shrink-0">
                  {a.typ}
                  {a.size_bytes != null && ` · ${fmtBytes(a.size_bytes)}`}
                  {a.mime_type && ` · ${a.mime_type}`}
                </span>
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

        {/* Positionen — Tabellen-Layout analog Wizard */}
        <section className="bg-[#111827] border border-slate-800 rounded p-4">
          <div className="flex justify-between items-center mb-3">
            <h2 className="font-semibold">Positionen ({positionen.length})</h2>
            {!isLocked && (
              <button onClick={applyKi} disabled={busy} className="text-cyan-400 hover:text-cyan-300 text-sm">
                {busy ? 'KI läuft…' : '✨ KI-Klassifizierung'}
              </button>
            )}
          </div>

          {/* Spaltenkopf nur auf Desktop — Mobile stacked Card-Layout */}
          <div className="hidden md:grid grid-cols-12 gap-2 mb-1 px-1 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
            <div className="col-span-4">Bezeichnung</div>
            <div className="col-span-1 text-center">Menge</div>
            <div className="col-span-2 text-right">Einzel netto</div>
            <div className="col-span-2 text-right">Einzel brutto</div>
            <div className="col-span-1 text-center">MwSt %</div>
            <div className="col-span-2 text-right">Klassifizierung</div>
          </div>

          <div className="space-y-2">
            {positionen.map((p) => {
              const links = linksByPosition[p.id] ?? [];
              const ki = p.ki_vorschlag;
              const einzelBrutto = Number(p.einzelpreis_netto) * (1 + Number(p.mwst_satz) / 100);
              const hasDetails = (p.kategorie || ki || p.notizen || links.length > 0 || p.folgekosten_asset_id);
              return (
              <div key={p.id} className="rounded border border-slate-800 bg-slate-900/40">
                {/* Hauptzeile — Mobile: Stack mit Bezeichnung voll oben, Zahlen drunter; Desktop: 12-Grid */}
                <div className="p-2 space-y-2 md:grid md:grid-cols-12 md:gap-2 md:items-center md:space-y-0">
                  {/* Bezeichnung: volle Breite auf Mobile, 4/12 auf Desktop */}
                  <input
                    value={p.bezeichnung}
                    disabled
                    aria-label="Bezeichnung"
                    className="w-full md:col-span-4 bg-[#111827] border border-slate-700 rounded px-2 py-1.5 text-sm disabled:opacity-90"
                  />
                  {/* Mobile: Mini-Labels uebers Feld; md:contents loest den Wrapper im Grid auf */}
                  <div className="grid grid-cols-4 gap-2 md:contents">
                    <label className="md:hidden text-[10px] uppercase tracking-wider text-slate-500 col-span-1">Menge</label>
                    <label className="md:hidden text-[10px] uppercase tracking-wider text-slate-500 col-span-1 text-right">Netto</label>
                    <label className="md:hidden text-[10px] uppercase tracking-wider text-slate-500 col-span-1 text-right">Brutto</label>
                    <label className="md:hidden text-[10px] uppercase tracking-wider text-slate-500 col-span-1 text-center">MwSt</label>
                    <input
                      value={p.menge}
                      disabled
                      aria-label="Menge"
                      className="col-span-1 md:col-span-1 bg-[#111827] border border-slate-700 rounded px-2 py-1.5 text-sm text-center disabled:opacity-90"
                    />
                    <input
                      value={Number(p.einzelpreis_netto).toFixed(2)}
                      disabled
                      aria-label="Einzelpreis netto"
                      className="col-span-1 md:col-span-2 bg-[#111827] border border-slate-700 rounded px-2 py-1.5 text-sm text-right disabled:opacity-90"
                    />
                    <input
                      value={einzelBrutto.toFixed(2)}
                      disabled
                      aria-label="Einzelpreis brutto"
                      className="col-span-1 md:col-span-2 bg-[#111827] border border-slate-700 rounded px-2 py-1.5 text-sm text-right disabled:opacity-90"
                    />
                    <input
                      value={p.mwst_satz}
                      disabled
                      aria-label="MwSt-Satz"
                      className="col-span-1 md:col-span-1 bg-[#111827] border border-slate-700 rounded px-2 py-1.5 text-sm text-center disabled:opacity-90"
                    />
                  </div>
                  <div className="flex justify-end md:col-span-2">
                    <span className={`text-xs px-2 py-0.5 rounded border ${
                      p.klassifizierung === 'pending' ? 'bg-amber-500/10 text-amber-300 border-amber-500/30' :
                      p.klassifizierung === 'afa' ? 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30' :
                      p.klassifizierung === 'gwg' ? 'bg-amber-500/10 text-amber-300 border-amber-500/30' :
                      p.klassifizierung === 'verbrauch' ? 'bg-violet-500/10 text-violet-300 border-violet-500/30' :
                      p.klassifizierung === 'ausgabe' ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' :
                      'bg-slate-700/30 text-slate-400 border-slate-700'
                    }`}>
                      {KLASS_LABEL[p.klassifizierung]}
                    </span>
                  </div>
                </div>

                {/* Sub-Zeile: Summen + Details */}
                <div className="px-3 pb-2 text-xs text-slate-500 flex flex-wrap gap-x-4">
                  <span>Gesamt netto: <span className="text-slate-300 font-mono">{fmtEuro(Number(p.gesamt_netto))}</span></span>
                  <span>Gesamt brutto: <span className="text-slate-300 font-mono">{fmtEuro(Number(p.gesamt_brutto))}</span></span>
                  {p.kategorie && <span>Kategorie: <span className="text-slate-300">{p.kategorie}</span></span>}
                </div>

                {/* Details (KI, Notizen, Verknüpfungen) */}
                {hasDetails && (
                  <div className="px-3 pb-3 space-y-2">
                    {ki && (
                      <div className="text-xs p-2 bg-cyan-500/5 border border-cyan-500/20 rounded">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-cyan-300 font-semibold">💡 KI-Vorschlag</div>
                          {!p.locked && (ki.klassifizierung || ki.kategorie) && (
                            <button
                              onClick={() => applyKiVorschlag(p)}
                              className="px-2 py-0.5 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 rounded border border-cyan-500/30 text-[11px]"
                            >
                              Übernehmen
                            </button>
                          )}
                        </div>
                        <div className="text-slate-300 mt-0.5">
                          {ki.klassifizierung && <span>Klassifizierung: <span className="text-cyan-300">{ki.klassifizierung}</span></span>}
                          {typeof ki.confidence === 'number' && <span> · Sicherheit {Math.round(ki.confidence * 100)}%</span>}
                        </div>
                        {ki.art && <div className="text-slate-400">Art: {ki.art}</div>}
                        {ki.kategorie && <div className="text-slate-400">Kategorie: {ki.kategorie}</div>}
                        {typeof ki.nutzungsdauer_monate === 'number' && (
                          <div className="text-slate-400">Nutzungsdauer: {ki.nutzungsdauer_monate} Monate</div>
                        )}
                        {ki.begruendung && <div className="text-slate-400 italic mt-0.5">{ki.begruendung}</div>}
                      </div>
                    )}
                    {p.notizen && (
                      <div className="text-xs text-slate-400 italic">📝 {p.notizen}</div>
                    )}
                    {links.length > 0 && (
                      <div className="text-xs p-2 bg-slate-800/40 border border-slate-700 rounded">
                        <div className="text-slate-300 font-semibold mb-1">🔗 Verknüpfte Inventar-Stücke ({links.length})</div>
                        <ul className="space-y-1">
                          {links.map((l) => (
                            <li key={l.id} className="flex justify-between gap-2">
                              {l.inventar_unit ? (
                                <Link href={`/admin/inventar/${l.inventar_unit.id}`} className="text-cyan-400 hover:text-cyan-300 truncate">
                                  {l.inventar_unit.bezeichnung}
                                  {l.inventar_unit.inventar_code && <span className="text-slate-500 font-mono ml-1">({l.inventar_unit.inventar_code})</span>}
                                  {l.inventar_unit.seriennummer && <span className="text-slate-500 ml-1">· SN {l.inventar_unit.seriennummer}</span>}
                                </Link>
                              ) : (
                                <span className="text-slate-500 italic">— gelöscht —</span>
                              )}
                              {l.stueck_anteil !== 1 && <span className="text-slate-400 shrink-0">Anteil {l.stueck_anteil}</span>}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {p.folgekosten_asset_id && (
                      <div className="text-xs text-amber-300">
                        Folgekosten verknüpft mit Anlage: <span className="font-mono">{p.folgekosten_asset_id}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Klassifikations-Buttons + Kategorie (nur wenn nicht locked) */}
                {!p.locked && (
                  <div className="px-3 pb-3 space-y-2">
                    <div className="flex gap-2 flex-wrap items-center">
                      {(['afa', 'gwg', 'verbrauch', 'ausgabe', 'ignoriert'] as const).map((k) => (
                        <button
                          key={k}
                          onClick={() => setKlassifizierung(p.id, k)}
                          title={KLASS_HINT[k]}
                          className={`px-2 py-0.5 text-xs rounded border ${
                            p.klassifizierung === k ? 'bg-cyan-500 text-slate-900 border-cyan-400 font-semibold' : 'bg-slate-800 hover:bg-slate-700 border-slate-700'
                          }`}
                        >
                          {KLASS_LABEL[k]}
                        </button>
                      ))}
                      <span className="text-xs text-slate-500" title="Hover über die Buttons für Erklärungen">ⓘ Hover für Details</span>
                    </div>
                    {p.klassifizierung === 'ausgabe' && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-400 shrink-0">Kategorie:</span>
                        <select
                          value={p.kategorie ?? ''}
                          onChange={(e) => setKategorie(p.id, e.target.value)}
                          className="bg-[#111827] border border-slate-700 rounded px-2 py-1 text-sm text-slate-200 focus:outline-none focus:border-cyan-500"
                        >
                          <option value="">— wählen —</option>
                          {AUSGABE_KATEGORIEN.map((k) => (
                            <option key={k.value} value={k.value}>{k.label}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                )}
              </div>
              );
            })}
          </div>

          {/* Summen-Footer wie im Wizard */}
          <div className="mt-3 text-right text-sm text-slate-400">
            Netto: <span className="font-mono text-slate-200">{fmtEuro(Number(beleg.summe_netto))}</span>
            {' · '}
            MwSt: <span className="font-mono text-slate-300">{fmtEuro(Number(beleg.summe_brutto) - Number(beleg.summe_netto))}</span>
            {' · '}
            Brutto: <span className="font-mono text-cyan-300">{fmtEuro(Number(beleg.summe_brutto))}</span>
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
