'use client';

import { Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

/**
 * In-App PDF-Viewer mit Zurück-Button.
 *
 * Hintergrund: In der installierten iOS-PWA öffnen direkte Links auf
 * /api/...-PDFs eine chrome-lose Vollbild-Ansicht OHNE Zurück-Navigation —
 * der Nutzer muss die App schließen. Diese Seite ist eine normale
 * App-Route: PDF im <iframe>, eigener Zurück-Button (router.back()).
 *
 * Aufruf: /admin/pdf-viewer?u=<relativer /api-Pfad>&t=<Titel>
 */
function Viewer() {
  const sp = useSearchParams();
  const router = useRouter();

  const rawU = sp.get('u') ?? '';
  const title = sp.get('t') ?? 'Dokument';
  // Nur app-eigene API-Pfade zulassen (kein Open-Redirect / externe URL).
  const safe = rawU.startsWith('/api/') && !rawU.startsWith('//');
  const src = safe ? rawU : '';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-800 sticky top-0 bg-slate-950 z-10">
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-cyan-400 hover:text-cyan-300"
        >
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 12L6 8l4-4" />
          </svg>
          Zurück
        </button>
        <span className="text-sm font-semibold truncate">{title}</span>
        {src ? (
          <a
            href={src}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-semibold text-slate-400 hover:text-slate-200 whitespace-nowrap"
          >
            Neuer Tab ↗
          </a>
        ) : (
          <span className="w-16" />
        )}
      </div>

      {src ? (
        <iframe
          src={src}
          title={title}
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
