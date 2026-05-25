'use client';

import { Suspense, useRef, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

/**
 * In-App PDF-Viewer mit Zurück- und Drucken-Button.
 *
 * Hintergrund: In der installierten iOS-PWA öffnen direkte Links auf
 * /api/...-PDFs eine chrome-lose Vollbild-Ansicht OHNE Zurück-Navigation —
 * der Nutzer muss die App schließen. Diese Seite ist eine normale
 * App-Route: PDF im <iframe>, eigener Zurück-Button (router.back()),
 * Drucken-Button (iframe.contentWindow.print()) und "Neuer Tab"-Fallback.
 *
 * Aufruf: /admin/pdf-viewer?u=<relativer /api-Pfad>&t=<Titel>
 */
function Viewer() {
  const sp = useSearchParams();
  const router = useRouter();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeLoaded, setIframeLoaded] = useState(false);

  const rawU = sp.get('u') ?? '';
  const title = sp.get('t') ?? 'Dokument';
  // Nur app-eigene API-Pfade zulassen (kein Open-Redirect / externe URL).
  const safe = rawU.startsWith('/api/') && !rawU.startsWith('//');
  const src = safe ? rawU : '';

  function handlePrint() {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    try {
      win.focus();
      win.print();
    } catch {
      // Fallback: Tab öffnen, dort Cmd/Strg+P. Mobile-Safari blockt
      // iframe.print() in PWA-Modus gelegentlich.
      if (src) window.open(src, '_blank', 'noopener,noreferrer');
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <div className="flex items-center justify-between gap-2 px-3 py-3 border-b border-slate-800 sticky top-0 bg-slate-950 z-10">
        <button
          type="button"
          onClick={() => router.back()}
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
              disabled={!iframeLoaded}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-cyan-600 text-white hover:bg-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Drucken (Strg+P)"
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
            <a
              href={src}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-semibold text-slate-400 hover:text-slate-200 whitespace-nowrap px-2 py-1.5"
              title="In neuem Tab öffnen"
            >
              ↗
            </a>
          )}
        </div>
      </div>

      {src ? (
        <iframe
          ref={iframeRef}
          src={src}
          title={title}
          onLoad={() => setIframeLoaded(true)}
          className="flex-1 w-full bg-white"
          style={{ border: 'none', minHeight: '80vh' }}
        />
      ) : (
        <div className="p-8 text-center text-red-400 text-sm">
          Ungültiger Dokument-Link.
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
