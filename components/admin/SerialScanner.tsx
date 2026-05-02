'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Seriennummern-/Barcode-Scanner für die Admin-PWA.
 *
 * Nutzt zwei Backends:
 * 1. Native BarcodeDetector-API (Chrome/Edge auf Android, Desktop) — schnell,
 *    erkennt viele Formate (QR, EAN, Code128, DataMatrix, ...)
 * 2. jsQR Fallback (iOS Safari, alte Browser) — pure JS, nur QR-Codes,
 *    laeuft im Canvas-Frame-Loop
 *
 * Modal-Komponente — wird mit `open=true` geöffnet, ruft `onResult(text)`
 * beim ersten erkannten Code auf und schließt sich automatisch.
 */

type Status = 'init' | 'requesting' | 'scanning' | 'no-camera' | 'error';

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

interface ExtendedMediaTrackConstraintSet extends MediaTrackConstraintSet {
  torch?: boolean;
  zoom?: number;
  focusMode?: string;
  pointsOfInterest?: Array<{ x: number; y: number }>;
}
interface ExtendedMediaTrackCapabilities extends MediaTrackCapabilities {
  torch?: boolean;
  zoom?: { min: number; max: number; step?: number };
  focusMode?: string[];
}

interface SerialScannerProps {
  open: boolean;
  onResult: (text: string) => void;
  onClose: () => void;
  title?: string;
}

/**
 * Extrahiert den eigentlichen Code aus dem Scan-Wert. Akzeptiert sowohl
 * Plaintext-Codes ("GP12-001") als auch URLs vom QR-Code-Druck
 * ("https://cam2rent.de/admin/scan/GP12-001"). Bei URLs wird der letzte
 * Pfad-Segment genommen und URL-dekodiert.
 */
function extractScanValue(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      const segments = url.pathname.split('/').filter(Boolean);
      const last = segments[segments.length - 1];
      return last ? decodeURIComponent(last) : trimmed;
    } catch {
      return trimmed;
    }
  }
  return trimmed;
}

export default function SerialScanner({ open, onResult, onClose, title = 'Seriennummer scannen' }: SerialScannerProps) {
  const [status, setStatus] = useState<Status>('init');
  const [errorMsg, setErrorMsg] = useState('');
  const [manualValue, setManualValue] = useState('');
  const [usingFallback, setUsingFallback] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectIntervalRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

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
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setTorchOn(false);
    setTorchSupported(false);
  }

  /**
   * Aktiviert/deaktiviert die Taschenlampe der Ruek-Kamera. Funktioniert nur
   * auf Chromium-Browsern (Android/Desktop). iOS Safari unterstuetzt das nicht.
   */
  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()?.[0];
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as ExtendedMediaTrackConstraintSet] });
      setTorchOn(next);
    } catch {
      // Wenn das Geraet keine Torch hat, einfach den Button verstecken
      setTorchSupported(false);
    }
  }

  /**
   * Tap-to-Focus: bei Klick auf das Video versucht die Kamera, an dieser
   * Stelle scharfzustellen. Greift nur, wenn der Browser pointsOfInterest
   * im Track unterstuetzt (iOS Safari + neuere Chromium).
   */
  async function handleVideoTap(e: React.MouseEvent<HTMLVideoElement>) {
    const track = streamRef.current?.getVideoTracks()?.[0];
    if (!track) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    try {
      await track.applyConstraints({
        advanced: [{ pointsOfInterest: [{ x, y }], focusMode: 'single-shot' } as ExtendedMediaTrackConstraintSet],
      });
    } catch {
      // Ignorieren — Browser unterstuetzt das nicht.
    }
  }

  async function startScanning() {
    setStatus('requesting');
    setErrorMsg('');
    setManualValue('');
    setUsingFallback(false);

    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('no-camera');
      return;
    }

    try {
      // Hohe Aufloesung + Continuous-Autofocus → mehr Pixel pro QR-Modul,
      // damit der Scan auch bei groesserem Abstand und leichten Winkeln klappt.
      // `ideal` statt `exact`, damit aeltere Kameras nicht hart abbrechen.
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          // Continuous-Autofocus haelt das Bild scharf, auch wenn der Nutzer
          // die Kamera bewegt.
          focusMode: { ideal: 'continuous' },
          advanced: [{ focusMode: 'continuous' } as ExtendedMediaTrackConstraintSet],
        } as MediaTrackConstraints,
        audio: false,
      });
      streamRef.current = stream;

      // Torch-Capability einmalig pruefen + UI-Toggle freischalten
      const track = stream.getVideoTracks()[0];
      if (track && typeof track.getCapabilities === 'function') {
        const caps = track.getCapabilities() as ExtendedMediaTrackCapabilities;
        if (caps.torch === true) setTorchSupported(true);
      }

      if (!videoRef.current) return;
      videoRef.current.srcObject = stream;
      // iOS Safari verlangt playsInline + muted; sonst Vollbild oder kein autoplay.
      videoRef.current.setAttribute('playsinline', 'true');
      await videoRef.current.play();
      setStatus('scanning');

      // Pfad 1: Native BarcodeDetector — wenn verfuegbar (Chrome/Edge Android, Desktop)
      if (typeof window !== 'undefined' && window.BarcodeDetector) {
        const detector = new window.BarcodeDetector({
          formats: ['qr_code', 'ean_13', 'ean_8', 'code_128', 'code_39', 'code_93', 'codabar', 'data_matrix', 'itf', 'upc_a', 'upc_e'],
        });

        // 150 ms Intervall — bei 1080p kostet ein detect ~30-60 ms auf
        // Mid-Range-Mobile, frequentes Polling fuehlt sich also "snappy" an.
        detectIntervalRef.current = window.setInterval(async () => {
          if (!videoRef.current || videoRef.current.readyState < 2) return;
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes.length > 0) {
              const value = extractScanValue(codes[0].rawValue);
              if (value) {
                stopScanning();
                onResult(value);
                onClose();
              }
            }
          } catch {
            // Detect-Fehler einzelner Frames ignorieren — naechster Frame versucht erneut.
          }
        }, 150);
        return;
      }

      // Pfad 2: jsQR Fallback (iOS Safari, alte Browser) — pure JS, nur QR-Codes
      setUsingFallback(true);
      const jsQRMod = await import('jsqr');
      const jsQR = jsQRMod.default;

      if (!canvasRef.current) {
        canvasRef.current = document.createElement('canvas');
      }
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) {
        setErrorMsg('Canvas nicht verfuegbar.');
        setStatus('error');
        return;
      }

      const tick = () => {
        if (!videoRef.current || videoRef.current.readyState < 2) {
          rafRef.current = window.requestAnimationFrame(tick);
          return;
        }
        const w = videoRef.current.videoWidth;
        const h = videoRef.current.videoHeight;
        if (w === 0 || h === 0) {
          rafRef.current = window.requestAnimationFrame(tick);
          return;
        }
        // Auf max 720px lange Seite verkleinern — bringt deutlich mehr
        // Reichweite als die alten 480px (fast doppelt so weit erkennbar),
        // bleibt auf iPhone trotzdem unter 200ms pro Frame.
        const scale = Math.min(1, 720 / Math.max(w, h));
        canvas.width = Math.round(w * scale);
        canvas.height = Math.round(h * scale);
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        try {
          // attemptBoth statt dontInvert — invertierte/kontrastarme Sticker
          // werden jetzt auch erkannt. ~10ms Mehraufwand pro Frame, aber
          // viel toleranter gegenueber Beleuchtung und Etiketten-Material.
          const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: 'attemptBoth',
          });
          if (code?.data) {
            const value = extractScanValue(code.data);
            if (value) {
              stopScanning();
              onResult(value);
              onClose();
              return;
            }
          }
        } catch {
          // jsQR-Crash auf einzelnem Frame ignorieren
        }
        rafRef.current = window.requestAnimationFrame(tick);
      };
      rafRef.current = window.requestAnimationFrame(tick);
    } catch (e) {
      const msg = (e as Error).message || 'Kamera-Zugriff verweigert';
      setErrorMsg(msg);
      setStatus('error');
    }
  }

  function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    const v = extractScanValue(manualValue);
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
                onClick={handleVideoTap}
                className="w-full h-full object-cover cursor-crosshair"
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
              {status === 'scanning' && torchSupported && (
                <button
                  type="button"
                  onClick={toggleTorch}
                  aria-label={torchOn ? 'Taschenlampe aus' : 'Taschenlampe an'}
                  title={torchOn ? 'Taschenlampe aus' : 'Taschenlampe an'}
                  className="absolute top-2 right-2 w-10 h-10 rounded-full flex items-center justify-center transition-colors"
                  style={{ background: torchOn ? '#fbbf24' : 'rgba(0,0,0,0.5)', color: torchOn ? '#0f172a' : 'white' }}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 2l.553 1.106A2 2 0 0011.342 4h1.316a2 2 0 001.789-.894L15 2M9 2v3a2 2 0 002 2h2a2 2 0 002-2V2M10 22h4M12 14v8M9 8h6l-1 6h-4l-1-6z" />
                  </svg>
                </button>
              )}
            </div>
          )}

          {status === 'scanning' && (
            <p className="text-xs font-body text-brand-muted dark:text-gray-400 text-center">
              {usingFallback
                ? 'JS-Modus aktiv (iOS): Halte den Code möglichst gerade vor die Kamera. Tippe ins Bild zum Scharfstellen.'
                : 'Tippe ins Bild zum Scharfstellen. Bei dunklen Stickern Taschenlampe aktivieren.'}
            </p>
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
