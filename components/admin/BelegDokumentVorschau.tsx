'use client';

import { useEffect, useState } from 'react';

/**
 * Vorschau des Rechnungs-Dokuments (Anhang) eines Belegs.
 *
 * PDF wird in einem <iframe> eingebettet, Bilder als <img>. Wird sowohl
 * inline auf der Beleg-Detailseite (anhaenge wird als Prop durchgereicht,
 * spart einen Fetch) als auch im Schnell-Vorschau-Popup der Belege-Liste
 * genutzt (dort ohne anhaenge-Prop → lädt selbst über die Detail-API).
 */

interface Anhang {
  id: string;
  dateiname: string;
  mime_type: string;
}

export default function BelegDokumentVorschau({
  belegId,
  anhaenge: anhaengeProp,
  height = 520,
}: {
  belegId: string;
  anhaenge?: Anhang[];
  height?: number;
}) {
  const [anhaenge, setAnhaenge] = useState<Anhang[]>(anhaengeProp ?? []);
  const [loadingList, setLoadingList] = useState(!anhaengeProp);
  const [activeId, setActiveId] = useState<string | null>(anhaengeProp?.[0]?.id ?? null);
  const [url, setUrl] = useState<string | null>(null);
  const [loadingUrl, setLoadingUrl] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Anhänge laden, falls nicht als Prop übergeben (Listen-Popup).
  useEffect(() => {
    if (anhaengeProp) return;
    let cancelled = false;
    setLoadingList(true);
    fetch(`/api/admin/belege/${belegId}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        const list: Anhang[] = Array.isArray(d.anhaenge) ? d.anhaenge : [];
        setAnhaenge(list);
        setActiveId(list[0]?.id ?? null);
      })
      .catch(() => { if (!cancelled) setError('Beleg konnte nicht geladen werden.'); })
      .finally(() => { if (!cancelled) setLoadingList(false); });
    return () => { cancelled = true; };
  }, [belegId, anhaengeProp]);

  // Signed-URL für das aktive Dokument laden.
  useEffect(() => {
    if (!activeId) { setUrl(null); return; }
    let cancelled = false;
    setLoadingUrl(true);
    setError(null);
    fetch(`/api/admin/belege/${belegId}/anhaenge/${activeId}?signed=1`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d.url) setUrl(d.url);
        else setError('Keine Vorschau-URL erhalten.');
      })
      .catch(() => { if (!cancelled) setError('Dokument konnte nicht geladen werden.'); })
      .finally(() => { if (!cancelled) setLoadingUrl(false); });
    return () => { cancelled = true; };
  }, [belegId, activeId]);

  const active = anhaenge.find((a) => a.id === activeId) ?? null;
  const isPdf = (active?.mime_type ?? '').includes('pdf');
  const isImage = (active?.mime_type ?? '').startsWith('image/');

  if (loadingList) {
    return <div className="text-sm text-slate-500 py-6 text-center">Lade…</div>;
  }
  if (anhaenge.length === 0) {
    return <div className="text-sm text-slate-500 py-6 text-center">Kein Dokument hinterlegt.</div>;
  }

  return (
    <div className="space-y-2">
      {anhaenge.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {anhaenge.map((a) => (
            <button
              key={a.id}
              onClick={() => setActiveId(a.id)}
              className={`px-2 py-1 rounded text-xs border max-w-[200px] truncate ${
                a.id === activeId
                  ? 'bg-cyan-500 text-slate-900 border-cyan-400 font-semibold'
                  : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {a.dateiname}
            </button>
          ))}
        </div>
      )}
      {error && <p className="text-sm text-rose-400">{error}</p>}
      {loadingUrl && <div className="text-sm text-slate-500 py-6 text-center">Lade Dokument…</div>}
      {!loadingUrl && url && isPdf && (
        <iframe
          src={url}
          title="Rechnung"
          className="w-full rounded border border-slate-700 bg-white"
          style={{ height }}
        />
      )}
      {!loadingUrl && url && isImage && (
        <div
          className="rounded border border-slate-700 bg-slate-950 overflow-auto"
          style={{ maxHeight: height }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="Rechnung" className="w-full" />
        </div>
      )}
      {!loadingUrl && url && !isPdf && !isImage && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-cyan-400 hover:text-cyan-300 underline text-sm"
        >
          Dokument öffnen
        </a>
      )}
    </div>
  );
}
