'use client';

import { useState } from 'react';
import NotifyModal from '@/components/NotifyModal';

interface WaitlistCardProps {
  productId: string;
  productName: string;
}

/**
 * Ersetzt auf der Produktdetailseite den Buchungs-Kalender, wenn für
 * die Kamera noch keine Seriennummer hinterlegt ist. So können
 * Interessenten sich für eine Benachrichtigung eintragen.
 */
export default function WaitlistCard({ productId, productName }: WaitlistCardProps) {
  const [notifyOpen, setNotifyOpen] = useState(false);

  return (
    <>
      <div className="rounded-xl bg-accent-blue-soft dark:bg-accent-blue/10 border border-accent-blue/20 p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-white dark:bg-brand-dark flex items-center justify-center">
            <svg viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth={2} className="w-5 h-5" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
            </svg>
          </div>
          <div className="min-w-0">
            <p className="font-heading font-bold text-sm text-accent-blue dark:text-blue-300">
              Demnächst verfügbar
            </p>
            <p className="text-xs font-body text-accent-blue/80 dark:text-blue-300/80 mt-1">
              Diese Kamera ist noch nicht im Bestand. Trage deine E-Mail ein, und wir benachrichtigen dich, sobald sie gemietet werden kann.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setNotifyOpen(true)}
          className="block w-full text-center px-4 py-2.5 bg-brand-black dark:bg-accent-blue text-white font-heading font-bold text-sm rounded-[10px] hover:bg-brand-dark dark:hover:bg-blue-600 transition-colors"
        >
          Benachrichtige mich
        </button>
      </div>

      <NotifyModal
        isOpen={notifyOpen}
        onClose={() => setNotifyOpen(false)}
        productName={productName}
        productId={productId}
        source="detail"
      />
    </>
  );
}
