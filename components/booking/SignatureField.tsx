'use client';

import { useRef, useState } from 'react';
import SignatureCanvas from 'react-signature-canvas';

/**
 * Unterschrift-Feld für Kunden-Dialoge (Mietvertrag, Verlegung).
 *
 * Hintergrund (2026-09-07): Das Kundenkonto hatte eine handgeschriebene
 * Canvas-Implementierung (mousedown/touchstart + manuelles preventDefault).
 * React hängt `touchstart`/`touchmove` am Root als PASSIVE Listener an —
 * `preventDefault()` ist dort wirkungslos, und je nach Gerät/Browser kam
 * kein einziger Strich an. Der Kunde konnte dann gar nicht unterschreiben,
 * ohne dass ihm ein Hinweis angezeigt wurde.
 *
 * Diese Komponente nutzt stattdessen `react-signature-canvas` (Pointer-Events
 * + korrekte DPI-Skalierung) — exakt die Bibliothek, die im Checkout
 * (`SignatureStep`) seit jeher zuverlässig läuft.
 *
 * Der Zustand ist bewusst ereignisgesteuert (kein useEffect + onChange):
 * ein Effekt mit einer inline übergebenen `onChange`-Funktion würde bei
 * jedem Eltern-Render erneut feuern und eine Render-Schleife auslösen.
 */

export interface SignatureFieldChange {
  method: 'canvas' | 'typed';
  /** PNG-Data-URL — nur im Zeichen-Modus gesetzt. */
  dataUrl: string | null;
}

interface SignatureFieldProps {
  /**
   * Der bereits im Formular eingegebene Name. Im Tipp-Modus IST er die
   * Unterschrift; die Komponente zeigt ihn nur als Vorschau an.
   */
  signerName: string;
  /**
   * Tipp-Alternative anbieten. Aus lassen, wenn die Gegenstelle zwingend
   * eine gezeichnete Unterschrift verlangt (z.B. der Verlege-Endpoint).
   */
  allowTyped?: boolean;
  onChange: (value: SignatureFieldChange) => void;
}

export default function SignatureField({ signerName, allowTyped = false, onChange }: SignatureFieldProps) {
  const padRef = useRef<SignatureCanvas>(null);
  const [useTyped, setUseTyped] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);

  const clear = () => {
    padRef.current?.clear();
    setHasDrawn(false);
    onChange({ method: 'canvas', dataUrl: null });
  };

  const handleEnd = () => {
    const pad = padRef.current;
    if (!pad || pad.isEmpty()) return;
    setHasDrawn(true);
    onChange({ method: 'canvas', dataUrl: pad.toDataURL('image/png') });
  };

  const switchMode = () => {
    const next = !useTyped;
    setUseTyped(next);
    padRef.current?.clear();
    setHasDrawn(false);
    onChange({ method: next ? 'typed' : 'canvas', dataUrl: null });
  };

  const typedReady = signerName.trim().length >= 2;

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-xs font-heading font-semibold text-brand-black dark:text-white">Unterschrift</label>
        <div className="flex items-center gap-3">
          {!useTyped && hasDrawn && (
            <button type="button" onClick={clear} className="text-xs text-accent-blue hover:underline">
              Löschen
            </button>
          )}
          {allowTyped && (
            <button type="button" onClick={switchMode} className="text-xs text-accent-blue hover:underline">
              {useTyped ? 'Stattdessen zeichnen' : 'Stattdessen Namen eintippen'}
            </button>
          )}
        </div>
      </div>

      {useTyped ? (
        <div className="border border-brand-border dark:border-white/10 rounded-[10px] bg-brand-bg dark:bg-brand-black p-4">
          {typedReady ? (
            <>
              <p className="font-heading font-semibold text-lg text-brand-black dark:text-white break-words">
                {signerName.trim()}
              </p>
              <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                Wird als deine Unterschrift verwendet.
              </p>
            </>
          ) : (
            <p className="text-xs text-brand-muted dark:text-gray-500">
              Trage oben deinen vollständigen Namen ein — er gilt dann als deine Unterschrift.
            </p>
          )}
        </div>
      ) : (
        <div className="relative border border-brand-border dark:border-white/10 rounded-[10px] bg-white dark:bg-brand-black overflow-hidden">
          <SignatureCanvas
            ref={padRef}
            penColor="#1a1a1a"
            canvasProps={{
              className: 'w-full touch-none cursor-crosshair',
              style: { height: 150, background: 'transparent' },
            }}
            onEnd={handleEnd}
          />
          {!hasDrawn && (
            <p className="absolute inset-0 flex items-center justify-center text-sm text-brand-muted dark:text-gray-600 pointer-events-none">
              Hier mit Finger oder Maus unterschreiben
            </p>
          )}
        </div>
      )}

      {!useTyped && allowTyped && (
        <p className="text-xs text-brand-muted dark:text-gray-500 mt-1">
          Klappt das Zeichnen auf deinem Gerät nicht? Nutze „Stattdessen Namen eintippen“.
        </p>
      )}
    </div>
  );
}
