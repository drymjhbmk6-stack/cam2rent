'use client';

import { useEffect, useState } from 'react';
import { use } from 'react';
import { useAccessories } from '@/components/AccessoriesProvider';
import AdminBackLink from '@/components/admin/AdminBackLink';

interface Booking {
  id: string;
  product_name: string;
  rental_from: string;
  rental_to: string;
  days: number;
  customer_name: string | null;
  customer_email: string | null;
  shipping_method: string | null;
  shipping_address: string | null;
  accessories: string[];
  haftung: string;
  price_total: number;
  deposit: number;
  tracking_number: string | null;
}

function fmtDate(iso: string) {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

export default function DruckenPage({ params }: { params: Promise<{ id: string }> }) {
  const { accessories: STATIC_ACC } = useAccessories();
  const { id } = use(params);

  function accName(id: string): string {
    return STATIC_ACC.find((a) => a.id === id)?.name ?? id;
  }

  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`/api/admin/booking/${id}`)
      .then((r) => r.json())
      .then(({ booking: b, error: e }) => {
        if (e || !b) { setError('Buchung nicht gefunden.'); return; }
        setBooking(b);
      })
      .catch(() => setError('Fehler beim Laden.'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="p-8 text-center text-gray-500">Lädt…</div>;
  if (error || !booking) return <div className="p-8 text-center text-red-600">{error}</div>;

  const today = new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const accList = Array.isArray(booking.accessories) ? booking.accessories : [];

  return (
    <>
      <div className="print:hidden"><AdminBackLink href="/admin/versand" label="Zurück zum Versand" /></div>
      {/* Print button — wird beim Drucken ausgeblendet */}
      <div className="print:hidden fixed top-4 right-4 flex gap-2 z-10">
        <button
          onClick={() => window.print()}
          className="px-5 py-2.5 bg-black text-white font-semibold text-sm rounded-lg hover:bg-gray-800 shadow-lg"
        >
          Drucken / Als PDF speichern
        </button>
        <button
          onClick={() => window.close()}
          className="px-5 py-2.5 bg-white text-gray-700 font-semibold text-sm rounded-lg border hover:bg-gray-50 shadow-lg"
        >
          Schließen
        </button>
      </div>

      {/* Printable Document */}
      <div className="max-w-[210mm] mx-auto p-8 bg-white min-h-screen print:p-10 print:max-w-none print:text-[12pt] font-sans text-gray-900">

        {/* Header */}
        <div className="flex items-start justify-between mb-8 pb-6 border-b-2 border-gray-900">
          <div>
            <h1 className="text-3xl font-black tracking-tight">cam2rent</h1>
            <p className="text-sm text-gray-500 mt-0.5">Verleih von Action-Kameras</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Lieferschein</p>
            <p className="text-2xl font-black">{booking.id}</p>
            <p className="text-sm text-gray-500">Erstellt: {today}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-8 mb-8">
          {/* Kundendaten */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Empfänger</p>
            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
              <p className="font-bold text-base">{booking.customer_name || '—'}</p>
              {booking.customer_email && (
                <p className="text-sm text-gray-600 mt-0.5">{booking.customer_email}</p>
              )}
              {booking.shipping_address ? (
                <p className="text-sm text-gray-700 mt-2 whitespace-pre-line">{booking.shipping_address}</p>
              ) : (
                <div className="mt-3 space-y-1.5">
                  <div className="h-4 border-b border-dashed border-gray-300 flex items-end">
                    <span className="text-xs text-gray-400">Straße, Hausnummer</span>
                  </div>
                  <div className="h-4 border-b border-dashed border-gray-300 flex items-end">
                    <span className="text-xs text-gray-400">PLZ, Ort</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Miet-Info */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Mietzeitraum</p>
            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200 space-y-1.5">
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Mietbeginn</span>
                <span className="font-bold text-sm">{fmtDate(booking.rental_from)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Mietende / Rückgabe</span>
                <span className="font-bold text-sm">{fmtDate(booking.rental_to)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Dauer</span>
                <span className="font-bold text-sm">{booking.days} Tag{booking.days !== 1 ? 'e' : ''}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Versand</span>
                <span className="font-bold text-sm">
                  {booking.shipping_method === 'express' ? 'Express-Versand' : 'Standard-Versand'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Haftungsschutz</span>
                <span className="font-bold text-sm capitalize">{booking.haftung}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Packliste — 4-Augen-Prinzip */}
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
            Packliste — 4-Augen-Prinzip ✓
          </p>
          <div className="border-2 border-gray-900 rounded-lg overflow-hidden">
            <div className="bg-gray-900 text-white px-5 py-3 flex items-center justify-between">
              <span className="font-bold text-sm uppercase tracking-wide">Artikel</span>
              <div className="flex gap-8 text-xs font-semibold uppercase tracking-wider">
                <span>Verpackt</span>
                <span>Geprüft</span>
              </div>
            </div>

            {/* Kamera */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 bg-white">
              <div>
                <p className="font-bold text-base">{booking.product_name}</p>
                <p className="text-xs text-gray-500 mt-0.5">Kamera · Seriennummer prüfen</p>
              </div>
              <div className="flex gap-10">
                <div className="w-7 h-7 border-2 border-gray-400 rounded flex items-center justify-center text-gray-300 text-lg font-bold print:border-gray-600">☐</div>
                <div className="w-7 h-7 border-2 border-gray-400 rounded flex items-center justify-center text-gray-300 text-lg font-bold print:border-gray-600">☐</div>
              </div>
            </div>

            {/* Zubehör */}
            {accList.map((accId, i) => (
              <div key={accId} className={`flex items-center justify-between px-5 py-4 border-b border-gray-100 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                <div>
                  <p className="font-semibold text-sm">{accName(accId)}</p>
                  <p className="text-xs text-gray-400">Zubehör</p>
                </div>
                <div className="flex gap-10">
                  <div className="w-7 h-7 border-2 border-gray-400 rounded flex items-center justify-center text-gray-300 text-lg font-bold print:border-gray-600">☐</div>
                  <div className="w-7 h-7 border-2 border-gray-400 rounded flex items-center justify-center text-gray-300 text-lg font-bold print:border-gray-600">☐</div>
                </div>
              </div>
            ))}

            {/* Rücksendungs-Unterlagen */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-white">
              <div>
                <p className="font-semibold text-sm">Rücksendeetikett / DHL-Beileger</p>
                <p className="text-xs text-gray-400">Im Paket beilegen</p>
              </div>
              <div className="flex gap-10">
                <div className="w-7 h-7 border-2 border-gray-400 rounded flex items-center justify-center text-gray-300 text-lg font-bold print:border-gray-600">☐</div>
                <div className="w-7 h-7 border-2 border-gray-400 rounded flex items-center justify-center text-gray-300 text-lg font-bold print:border-gray-600">☐</div>
              </div>
            </div>

            {/* Dieser Lieferschein */}
            <div className="flex items-center justify-between px-5 py-4 bg-white">
              <div>
                <p className="font-semibold text-sm">Dieser Lieferschein (Kopie ins Paket)</p>
                <p className="text-xs text-gray-400">Original für Ablage behalten</p>
              </div>
              <div className="flex gap-10">
                <div className="w-7 h-7 border-2 border-gray-400 rounded flex items-center justify-center text-gray-300 text-lg font-bold print:border-gray-600">☐</div>
                <div className="w-7 h-7 border-2 border-gray-400 rounded flex items-center justify-center text-gray-300 text-lg font-bold print:border-gray-600">☐</div>
              </div>
            </div>
          </div>
        </div>

        {/* Rückgabe-Information */}
        <div className="mb-8 bg-gray-50 border border-gray-200 rounded-lg p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Rückgabe-Information für Kunden</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-bold">Rückgabedatum: {fmtDate(booking.rental_to)}</p>
              <p className="text-sm text-gray-600 mt-1">
                Bitte alle Artikel bis zu diesem Datum zurücksenden. Frankierung liegt bei.
              </p>
            </div>
            <div className="border-l border-gray-200 pl-4">
              <p className="text-xs text-gray-500 font-semibold mb-1">Rücksende-Tracking (wird vom Kunden selbst eingescannt)</p>
              <div className="h-8 border-b border-dashed border-gray-400" />
            </div>
          </div>
        </div>

        {/* 4-Augen Unterschriften */}
        <div className="border-2 border-gray-300 rounded-lg p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-4">4-Augen-Prinzip — Unterschriften</p>
          <div className="grid grid-cols-2 gap-8">
            <div>
              <p className="text-sm font-semibold mb-3">Verpackt von:</p>
              <div className="h-10 border-b-2 border-gray-400" />
              <div className="flex justify-between mt-1">
                <span className="text-xs text-gray-400">Name / Unterschrift</span>
                <span className="text-xs text-gray-400">Datum: ___________</span>
              </div>
            </div>
            <div>
              <p className="text-sm font-semibold mb-3">Geprüft von:</p>
              <div className="h-10 border-b-2 border-gray-400" />
              <div className="flex justify-between mt-1">
                <span className="text-xs text-gray-400">Name / Unterschrift</span>
                <span className="text-xs text-gray-400">Datum: ___________</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 pt-4 border-t border-gray-200 flex justify-between items-center">
          <p className="text-xs text-gray-400">cam2rent · Action-Kamera-Verleih · cam2rent.de</p>
          <p className="text-xs text-gray-400">Buchung {booking.id} · Gesamtbetrag: {booking.price_total.toFixed(2)} € (inkl. {booking.deposit.toFixed(2)} € Kaution)</p>
        </div>

      </div>

      <style>{`
        @media print {
          @page { margin: 15mm; size: A4; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>
    </>
  );
}
