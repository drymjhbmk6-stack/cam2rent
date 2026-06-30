'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

/**
 * In-App PDF-Viewer mit Zurück-, Vollbild- und Drucken-Button.
 *
 * Hintergrund: In der installierten iOS-PWA öffnen direkte Links auf
 * /api/...-PDFs eine chrome-lose Vollbild-Ansicht OHNE Zurück-Navigation.
 * Zusätzlich rendert iOS-Safari PDFs in einem <iframe> NICHT scrollbar und
 * ignoriert Fit-to-Width — der Vertrag ist dann rechts abgeschnitten und man
 * kommt nicht zu den Folgeseiten.
 *
 * Lösung: Das PDF wird clientseitig mit pdf.js zu Bildern gerendert und in
 * einem normalen, scrollbaren Container an die Bildschirmbreite angepasst.
 * Das funktioniert überall (inkl. iOS-PWA). Schlägt pdf.js fehl, wird auf den
 * klassischen <iframe> zurückgefallen.
 *
 * Aufruf: /admin/pdf-viewer?u=<relativer /api-Pfad>&t=<Titel>
 */
function Viewer() {
  const sp = useSearchParams();
  const router = useRouter();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [pages, setPages] = useState<string[]>([]);
  const [numPages, setNumPages] = useState(0);

  const rawU = sp.get('u') ?? '';
  const title = sp.get('t') ?? 'Dokument';
  // Nur app-eigene API-Pfade zulassen (kein Open-Redirect / externe URL).
  const safe = rawU.startsWith('/api/') && !rawU.startsWith('//');
  const src = safe ? rawU : '';

  useEffect(() => {
    if (!src) {
      setStatus('error');
      return;
    }
    let cancelled = false;
    setStatus('loading');
    setPages([]);
    setNumPages(0);

    (async () => {
      try {
        const pdfjs = await import('pdfjs-dist');
        // Worker über CDN laden — kein zusätzliches Webpack-Worker-Bundling
        // nötig, robust im Next.js-Build.
        pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;

        const doc = await pdfjs.getDocument(src).promise;
        if (cancelled) return;
        setNumPages(doc.numPages);

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        // Renderbreite an Bildschirm anpassen (gedeckelt für Speicher/Schärfe).
        const targetCssWidth = Math.min(Math.max(window.innerWidth, 320), 1100);

        const out: string[] = [];
        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i);
          if (cancelled) return;
          const base = page.getViewport({ scale: 1 });
          const scale = (targetCssWidth * dpr) / base.width;
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement('canvas');
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          const ctx = canvas.getContext('2d');
          if (!ctx) continue;
          await page.render({ canvasContext: ctx, viewport }).promise;
          if (cancelled) return;
          out.push(canvas.toDataURL('image/jpeg', 0.85));
          // Speicher freigeben.
          canvas.width = 0;
          canvas.height = 0;
          setPages([...out]); // progressiv anzeigen
        }
        if (!cancelled) setStatus('ready');
      } catch (err) {
        console.error('pdf.js Rendering fehlgeschlagen, Fallback auf iframe:', err);
        if (!cancelled) setStatus('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [src]);

  const handlePrint = useCallback(() => {
    // Drucken über die native PDF-Datei in neuem Tab (zuverlässiger als
    // window.print() auf gerenderte Bilder, v.a. mehrseitig).
    if (src) window.open(src, '_blank', 'noopener,noreferrer');
  }, [src]);

  const handleBack = useCallback(() => {
    // Im Vollbild führt "Zurück" zuerst aus dem Vollbild heraus.
    if (fullscreen) {
      setFullscreen(false);
      return;
    }
    router.back();
  }, [fullscreen, router]);

  return (
    <div
      className={`${
        fullscreen ? 'fixed inset-0 z-[100]' : 'min-h-screen'
      } bg-slate-950 text-slate-100 flex flex-col`}
    >
      <div
        className="flex items-center justify-between gap-2 px-3 py-3 border-b border-slate-800 sticky top-0 bg-slate-950 z-10"
        style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
      >
        <button
          type="button"
          onClick={handleBack}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-cyan-400 hover:text-cyan-300 shrink-0"
        >
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 12L6 8l4-4" />
          </svg>
          Zurück
        </button>
        <span className="text-sm font-semibold truncate flex-1 text-center px-2 hidden sm:block">{title}</span>
        <div className="flex items-center gap-1.5 shrink-0">
          {src && (
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-cyan-600 text-white hover:bg-cyan-500"
              title="Drucken / Herunterladen"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 6 2 18 2 18 9" />
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                <rect x="6" y="14" width="12" height="8" />
              </svg>
              Drucken
            </button>
          )}
          {src && (
            <button
              type="button"
              onClick={() => setFullscreen((v) => !v)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold border border-slate-700 text-slate-200 hover:bg-slate-800"
              title={fullscreen ? 'Vollbild verlassen' : 'Vollbild'}
            >
              {fullscreen ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 9H4M9 9V4M15 9h5M15 9V4M9 15H4M9 15v5M15 15h5M15 15v5" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
                </svg>
              )}
              {fullscreen ? 'Verlassen' : 'Vollbild'}
            </button>
          )}
        </div>
      </div>

      {!src ? (
        <div className="p-8 text-center text-red-400 text-sm">Ungültiger Dokument-Link.</div>
      ) : status === 'error' ? (
        // Fallback: klassischer iframe, falls pdf.js fehlschlägt.
        <iframe
          ref={iframeRef}
          src={`${src}${src.includes('#') ? '' : '#view=FitH'}`}
          title={title}
          className="flex-1 w-full bg-white"
          style={{ border: 'none', minHeight: '80vh' }}
        />
      ) : (
        <div
          className="flex-1 overflow-auto bg-slate-800"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          <div className="mx-auto flex flex-col items-center gap-3 py-4 px-2" style={{ maxWidth: '1100px' }}>
            {pages.map((u, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                src={u}
                alt={`Seite ${i + 1}`}
                className="w-full h-auto bg-white shadow-lg rounded-sm"
              />
            ))}
            {status === 'loading' && (
              <div className="text-slate-300 text-sm py-10">
                Vertrag wird geladen{numPages > 0 ? ` … (${pages.length}/${numPages})` : ' …'}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function PdfViewerPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950 text-slate-400 p-8 text-center">Lädt…</div>}>
      <Viewer />
    </Suspense>
  );
}
