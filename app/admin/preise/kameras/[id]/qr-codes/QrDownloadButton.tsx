'use client';

import { useState } from 'react';

interface DownloadButtonProps {
  /** Data-URL (data:image/png;base64,...) des QR-Codes */
  dataUrl: string;
  /** Dateiname ohne Extension (z.B. die Seriennummer) */
  filename: string;
}

/**
 * "Als PNG speichern"-Button — laedt das QR-Code-Bild auf das Geraet runter.
 * Auf iOS: Bild oeffnet sich in einem neuen Tab, wo der User es per
 * Long-Press in seine Fotos speichern kann. Auf Desktop: direkter Download.
 *
 * Workflow Brother P-touch (iOS):
 *   1. Klick "Speichern" → Bild ist in Fotos
 *   2. Brother iPrint&Label App oeffnen
 *   3. Neues Etikett → Bild einfuegen → das gerade gespeicherte QR-Bild
 *   4. Drucken
 */
export default function QrDownloadButton({ dataUrl, filename }: DownloadButtonProps) {
  const [busy, setBusy] = useState(false);

  async function handleDownload() {
    setBusy(true);
    try {
      // Auf iOS funktioniert <a download> nicht zuverlaessig. Wir oeffnen
      // das Bild in einem neuen Tab, der User kann es dort per Long-Press
      // in die Fotos speichern. Auf Desktop loest <a download> direkt aus.
      const isIOS = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);
      if (isIOS) {
        const newTab = window.open('', '_blank');
        if (newTab) {
          newTab.document.write(`
            <html><head><title>${filename}</title>
            <meta name="viewport" content="width=device-width,initial-scale=1">
            <style>
              body{margin:0;background:#000;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;font-family:-apple-system,sans-serif;padding:24px;box-sizing:border-box}
              img{max-width:90vw;max-height:65vh;background:#fff;padding:16px;border-radius:12px}
              p{color:#fff;text-align:center;font-size:14px;margin-top:16px;padding:0 24px}
              .actions{display:flex;gap:12px;margin-top:24px;flex-wrap:wrap;justify-content:center}
              .btn{display:inline-block;padding:12px 20px;font-size:14px;font-weight:600;border-radius:10px;text-decoration:none;border:none;cursor:pointer}
              .btn-primary{background:#06b6d4;color:#fff}
              .btn-secondary{background:#374151;color:#fff}
            </style>
            </head><body>
              <img src="${dataUrl}" alt="${filename}" />
              <p>Lange auf das Bild tippen &rarr; <strong>"Zu Fotos hinzuf&uuml;gen"</strong></p>
              <div class="actions">
                <button class="btn btn-secondary" onclick="window.close()">Schlie&szlig;en</button>
                <a class="btn btn-primary" href="${dataUrl}" download="${filename}.png">Direkt herunterladen</a>
              </div>
            </body></html>
          `);
          newTab.document.close();
        }
      } else {
        // Desktop: direkter Download
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = `${filename}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleDownload}
      disabled={busy}
      className="mt-2 w-full px-2 py-1.5 text-[11px] font-semibold bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors disabled:opacity-40"
    >
      📥 Als PNG speichern
    </button>
  );
}
