'use client';

/**
 * Projektablage — Download-Link, der auch in der installierten iOS-App geht.
 *
 * Ein normaler `<a href>` auf eine Antwort mit `Content-Disposition: attachment`
 * funktioniert im Safari-Tab (Download-Manager) und am Desktop. In der vom
 * Homescreen gestarteten App (Standalone-Modus) zeigt iOS dafuer aber keine
 * Oberflaeche — der Tipp verpufft ohne jede Rueckmeldung.
 *
 * Deshalb: ausserhalb der App bleibt es der schlichte Link (der Browser
 * streamt direkt auf die Platte, kein Speicherverbrauch). In der App wird die
 * Datei per fetch geholt, mit Fortschritt angezeigt und danach ueber das
 * Teilen-Blatt („In Dateien sichern") angeboten. Das Teilen muss auf einen
 * eigenen Tipp reagieren, weil Safari `navigator.share` nur innerhalb einer
 * Nutzer-Aktion erlaubt — nach dem asynchronen Laden waere die verstrichen.
 */

import { useEffect, useRef, useState } from 'react';
import { Button, Modal } from '@/components/admin/ui';
import { fmtBytes } from '@/lib/projektablage-shared';

/** Oberhalb davon wird in der App nicht in den Speicher geladen. */
const MAX_APP_DOWNLOAD_BYTES = 600 * 1024 * 1024;

type Status = 'idle' | 'laedt' | 'bereit' | 'fehler' | 'zu_gross';

export function istStandaloneApp(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  if (nav.standalone === true) return true;
  try {
    return window.matchMedia('(display-mode: standalone)').matches;
  } catch {
    return false;
  }
}

function dateinameAusHeader(res: Response, fallback: string): string {
  const cd = res.headers.get('content-disposition') ?? '';
  const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(cd);
  if (utf8) {
    try {
      return decodeURIComponent(utf8[1]);
    } catch {
      /* fallthrough */
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(cd);
  return plain?.[1]?.trim() || fallback;
}

interface Props extends Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  href: string;
  /** Name, unter dem die Datei gespeichert wird (Fallback zum Header). */
  dateiname: string;
  /** Bekannte Groesse — nur fuer Fortschritt und Speicher-Schutz. */
  groesseBytes?: number;
  children: React.ReactNode;
}

export default function DownloadLink({ href, dateiname, groesseBytes, children, onClick, ...rest }: Props) {
  // Erster Render immer als Link (kein Hydration-Mismatch), danach umschalten.
  const [standalone, setStandalone] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const [empfangen, setEmpfangen] = useState(0);
  const [fehler, setFehler] = useState('');
  const [datei, setDatei] = useState<File | null>(null);
  const abbruchRef = useRef<AbortController | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    setStandalone(istStandaloneApp());
  }, []);

  useEffect(() => {
    return () => {
      abbruchRef.current?.abort();
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  function schliessen() {
    abbruchRef.current?.abort();
    abbruchRef.current = null;
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setDatei(null);
    setEmpfangen(0);
    setFehler('');
    setStatus('idle');
  }

  async function laden() {
    if (groesseBytes != null && groesseBytes > MAX_APP_DOWNLOAD_BYTES) {
      setStatus('zu_gross');
      return;
    }
    setStatus('laedt');
    setEmpfangen(0);
    setFehler('');

    const ac = new AbortController();
    abbruchRef.current = ac;

    try {
      const res = await fetch(href, { credentials: 'same-origin', signal: ac.signal });
      if (!res.ok) {
        let meldung = `Download fehlgeschlagen (HTTP ${res.status}).`;
        try {
          const json = await res.json();
          if (json?.error) meldung = String(json.error);
        } catch {
          /* kein JSON */
        }
        throw new Error(meldung);
      }

      const typ = res.headers.get('content-type')?.split(';')[0] || 'application/octet-stream';
      const name = dateinameAusHeader(res, dateiname);
      const teile: BlobPart[] = [];
      let summe = 0;

      if (res.body) {
        const reader = res.body.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value && value.length > 0) {
            teile.push(value);
            summe += value.length;
            setEmpfangen(summe);
            if (summe > MAX_APP_DOWNLOAD_BYTES) {
              reader.cancel().catch(() => {});
              setFehler('Die Datei ist zu groß, um sie in der App zwischenzuspeichern.');
              setStatus('fehler');
              return;
            }
          }
        }
      } else {
        const blob = await res.blob();
        teile.push(blob);
        summe = blob.size;
        setEmpfangen(summe);
      }

      if (summe === 0) throw new Error('Die Antwort war leer.');
      setDatei(new File(teile, name, { type: typ }));
      setStatus('bereit');
    } catch (err) {
      // Vom Nutzer geschlossen — kein Fehler.
      if (ac.signal.aborted) return;
      setFehler(err instanceof Error ? err.message : 'Unbekannter Fehler.');
      setStatus('fehler');
    } finally {
      abbruchRef.current = null;
    }
  }

  /** Fallback ohne Teilen-Blatt: Objekt-URL in neuem Kontext oeffnen. */
  function alsLinkOeffnen() {
    if (!datei) return;
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    const url = URL.createObjectURL(datei);
    objectUrlRef.current = url;
    const a = document.createElement('a');
    a.href = url;
    a.download = datei.name;
    a.rel = 'noopener';
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function teilen() {
    if (!datei) return;
    const nav = navigator as Navigator & {
      canShare?: (data: ShareData) => boolean;
      share?: (data: ShareData) => Promise<void>;
    };
    const daten: ShareData = { files: [datei], title: datei.name };
    if (typeof nav.share === 'function' && (!nav.canShare || nav.canShare(daten))) {
      try {
        await nav.share(daten);
        schliessen();
        return;
      } catch (err) {
        // Abbruch durch den Nutzer ist kein Fehler.
        if (err instanceof Error && err.name === 'AbortError') return;
      }
    }
    alsLinkOeffnen();
  }

  const kannTeilen =
    typeof navigator !== 'undefined' &&
    typeof (navigator as Navigator & { share?: unknown }).share === 'function';

  if (!standalone) {
    return (
      <a href={href} onClick={onClick} {...rest}>
        {children}
      </a>
    );
  }

  const offen = status !== 'idle';

  return (
    <>
      <a
        href={href}
        {...rest}
        onClick={(e) => {
          onClick?.(e);
          if (e.defaultPrevented) return;
          e.preventDefault();
          void laden();
        }}
      >
        {children}
      </a>

      <Modal open={offen} onClose={schliessen} title="Download" maxWidth={440} closeOnBackdrop={status !== 'laedt'}>
        {status === 'laedt' && (
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <p style={{ margin: '0 0 6px', fontWeight: 600, color: 'var(--admin-text)' }}>
              Wird geladen …
            </p>
            <p style={{ margin: 0, fontSize: 14, color: 'var(--admin-text-dim)' }}>
              {fmtBytes(empfangen)}
              {groesseBytes ? ` von etwa ${fmtBytes(groesseBytes)}` : ''}
            </p>
            {groesseBytes ? (
              <div style={{ marginTop: 12, height: 6, borderRadius: 3, background: 'var(--admin-surface-2)', overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${Math.min(100, Math.round((empfangen / groesseBytes) * 100))}%`,
                    background: 'var(--admin-accent)',
                    transition: 'width .2s',
                  }}
                />
              </div>
            ) : null}
            <p style={{ margin: '14px 0 0', fontSize: 12, color: 'var(--admin-text-dim)' }}>
              Ein ZIP wird beim Laden gepackt, die Anzeige kann deshalb etwas unter der Endgröße liegen.
            </p>
            <div style={{ marginTop: 16 }}>
              <Button variant="ghost" size="sm" onClick={schliessen}>
                Abbrechen
              </Button>
            </div>
          </div>
        )}

        {status === 'bereit' && datei && (
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>📦</div>
            <p style={{ margin: '0 0 4px', fontWeight: 600, color: 'var(--admin-text)', wordBreak: 'break-all' }}>
              {datei.name}
            </p>
            <p style={{ margin: '0 0 16px', fontSize: 14, color: 'var(--admin-text-dim)' }}>
              {fmtBytes(datei.size)}
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
              <Button onClick={() => void teilen()}>
                {kannTeilen ? '📥 Sichern / Teilen' : '📥 Speichern'}
              </Button>
              <Button variant="ghost" size="sm" onClick={schliessen}>
                Schließen
              </Button>
            </div>
            {kannTeilen && (
              <p style={{ margin: '14px 0 0', fontSize: 12, color: 'var(--admin-text-dim)' }}>
                Im Teilen-Blatt &bdquo;In Dateien sichern&ldquo; wählen.
              </p>
            )}
          </div>
        )}

        {status === 'fehler' && (
          <div style={{ padding: '4px 0' }}>
            <p style={{ margin: '0 0 12px', color: 'var(--admin-danger)' }}>{fehler}</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <Button variant="secondary" size="sm" onClick={() => void laden()}>
                Erneut versuchen
              </Button>
              <Button variant="ghost" size="sm" onClick={schliessen}>
                Schließen
              </Button>
            </div>
          </div>
        )}

        {status === 'zu_gross' && (
          <div style={{ padding: '4px 0' }}>
            <p style={{ margin: '0 0 8px', color: 'var(--admin-text)' }}>
              Dieser Download ist mit {groesseBytes ? fmtBytes(groesseBytes) : 'seiner Größe'} zu groß,
              um ihn in der App zwischenzuspeichern.
            </p>
            <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--admin-text-dim)' }}>
              Bitte die Seite in Safari öffnen (dort läuft der Download direkt auf das Gerät) oder am
              Rechner herunterladen.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <Button variant="ghost" size="sm" onClick={schliessen}>
                Schließen
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
