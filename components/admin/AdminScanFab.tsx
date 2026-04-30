'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import SerialScanner from '@/components/admin/SerialScanner';

/**
 * Floating Action Button (rechts unten in der Admin-UI), der den
 * QR-/Barcode-Scanner oeffnet. Bei Erfolg navigiert er zur
 * /admin/scan/<code>-Detail-Karte (Bild, Asset-Daten, aktive Buchung).
 *
 * Der bestehende SerialScanner extrahiert den Code aus einer URL
 * (siehe extractScanValue) — wenn der QR die volle URL
 * https://.../admin/scan/<code> enthaelt, kommt nur <code> hier an.
 */
export default function AdminScanFab() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  function handleResult(code: string) {
    const trimmed = code.trim();
    if (!trimmed) return;
    router.push(`/admin/scan/${encodeURIComponent(trimmed)}`);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="QR-Code scannen"
        title="QR-Code scannen"
        className="fixed bottom-5 right-5 z-40 w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-transform hover:scale-105 active:scale-95"
        style={{
          background: '#06b6d4',
          color: 'white',
          // iOS-Safe-Area beachten
          bottom: 'calc(1.25rem + env(safe-area-inset-bottom))',
        }}
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 7V5a1 1 0 011-1h2M4 17v2a1 1 0 001 1h2M20 7V5a1 1 0 00-1-1h-2M20 17v2a1 1 0 01-1 1h-2M8 8h2v2H8V8zm6 6h2v2h-2v-2zm0-6h2v2h-2V8zM8 14h2v2H8v-2z" />
        </svg>
      </button>

      <SerialScanner
        open={open}
        title="QR-Code scannen"
        onResult={handleResult}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
