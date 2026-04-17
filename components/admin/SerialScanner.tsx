'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Seriennummern-/Barcode-Scanner für die Admin-PWA.
 *
 * Nutzt die native BarcodeDetector-API (Chrome/Edge/Safari ≥ 17).
 * Fallback: Manuelle Texteingabe wenn API/Kamera nicht verfügbar.
 *
 * Modal-Komponente — wird mit `open=true` geöffnet, ruft `onResult(text)`
 * beim ersten erkannten Code auf und schließt sich automatisch.
 *
 * Erkannt werden alle gängigen Codes (QR, EAN-13, Code128, Code39,
 * DataMatrix, etc.) sowie reine Text-Eingabe als Fallback.
 */

type Status = 'init' | 'requesting' | 'scanning' | 'no-camera' | 'no-detector' | 'error';

interface BarcodeDetectorResult {
  rawValue: string;
  format: string;
  boundingBox: DOMRectReadOnly;
}

interface BarcodeDetectorClass {
  new (options?: { formats?: string[] }): {
    detect(source: CanvasImageSource): Promise<BarcodeDetectorResult[]>;
  };
}

declare global {
  interface Window {
    BarcodeDetector?: BarcodeDetectorClass;
  }
}

interface SerialScannerProps {
  open: boolean;
  onResult: (text: string) => void;
  onClose: () => void;
  title?: string;
}

export default function SerialScanner({ open, onResult, onClose, title = 'Seriennummer scannen' }: SerialScannerProps) {
  const [status, setStatus] = useState<Status>('init');
  const [errorMsg, setErrorMsg] = useState('');
  const [manualValue, setManualValue] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (!open) {
      stopScanning();
      return;
    }
    void startScanning();
    return () => stopScanning();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function stopScanning() {
    if (detectIntervalRef.current !== null) {
      window.clearInterval(detectIntervalRef.current);
      detectIntervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }

  async function startScanning() {
    setStatus('requesting');
    setErrorMsg('');
    setManualValue('');

    if (typeof window === 'undefined' || !window.BarcodeDetector) {
      setStatus('no-detector');
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('no-camera');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      streamRef.current = stream;

      if (!videoRef.current) return;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setStatus('scanning');

      const detector = new window.BarcodeDetector({
        formats: ['qr_code', 'ean_13', 'ean_8', 'code_128', 'code_39', 'code_93', 'codabar', 'data_matrix', 'itf', 'upc_a', 'upc_e'],
      });

      detectIntervalRef.current = window.setInterval(async () => {
        if (!videoRef.current || videoRef.current.readyState < 2) return;
        try {
          const codes = await detector.detect(videoRef.current);
          if (codes.length > 0) {
            const value = codes[0].rawValue.trim();
            if (value) {
              stopScanning();
              onResult(value);
              onClose();
            }
          }
        } catch {
          // Detect-Fehler einzelner Frames ignorieren — nächster Frame versucht erneut.
        }
      }, 250);
    } catch (e) {
      setErrorMsg((e as Error).message || 'Kamera-Zugriff verweigert');
      setStatus('error');
    }
  }

  function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    const v = manualValue.trim();
    if (!v) return;
    stopScanning();
    onResult(v);
    onClose();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-md overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-brand-border dark:border-slate-700">
          <h3 className="font-heading font-bold text-base text-brand-black dark:text-white">{title}</h3>
          <button
            type="button"
            onClick={() => { stopScanning(); onClose(); }}
            aria-label="Schließen"
            className="p-1.5 text-brand-muted hover:text-brand-black dark:hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-4">
          {(status === 'requesting' || status === 'scanning') && (
            <div className="relative bg-black rounded-xl overflow-hidden aspect-[4/3]">
              <video
                ref={videoRef}
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              {status === 'scanning' && (
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                  <div className="border-2 border-accent-cyan rounded-xl w-3/4 h-1/2 shadow-[0_0_0_9999px_rgba(0,0,0,0.4)]"></div>
                </div>
              )}
              {status === 'requesting' && (
                <div className="absolute inset-0 flex items-center justify-center text-white text-sm font-body">
                  Kamera wird gestartet…
                </div>
              )}
            </div>
          )}

          {status === 'no-detector' && (
            <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-4 py-3">
              <p className="text-sm font-body text-amber-800 dark:text-amber-200">
                Dein Browser unterstützt keinen nativen Barcode-Scanner. Bitte gib die Seriennummer manuell ein.
              </p>
            </div>
          )}
          {status === 'no-camera' && (
            <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-4 py-3">
              <p className="text-sm font-body text-amber-800 dark:text-amber-200">
                Keine Kamera verfügbar. Bitte gib die Seriennummer manuell ein.
              </p>
            </div>
          )}
          {status === 'error' && (
            <div className="rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3">
              <p className="text-sm font-body text-red-800 dark:text-red-200">{errorMsg}</p>
            </div>
          )}

          <form onSubmit={handleManualSubmit} className="border-t border-brand-border dark:border-slate-700 pt-4">
            <label className="block text-xs font-heading font-semibold text-brand-muted uppercase tracking-wider mb-2">
              Oder manuell eingeben
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={manualValue}
                onChange={(e) => setManualValue(e.target.value)}
                placeholder="z.B. C3231234567"
                autoFocus={status !== 'scanning'}
                className="flex-1 px-3 py-2.5 text-base font-body bg-white dark:bg-slate-700 dark:text-slate-200 border border-brand-border dark:border-slate-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-accent-cyan"
              />
              <button
                type="submit"
                disabled={!manualValue.trim()}
                className="px-4 py-2.5 bg-accent-cyan text-white text-sm font-heading font-semibold rounded-btn hover:bg-cyan-700 transition-colors disabled:opacity-40"
              >
                Übernehmen
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
