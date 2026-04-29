import { createServiceClient } from '@/lib/supabase';
import QRCode from 'qrcode';
import Link from 'next/link';
import PrintButton from './PrintButton';
import { getSiteUrl } from '@/lib/env-mode';

interface Unit {
  id: string;
  serial_number: string;
  label: string | null;
  status: string;
  notes: string | null;
}

export default async function KameraQrCodesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = createServiceClient();

  // Produkt laden
  const { data: configRow } = await supabase
    .from('admin_config')
    .select('value')
    .eq('key', 'products')
    .maybeSingle();
  const productMap = (configRow?.value ?? {}) as Record<string, { name?: string; brand?: string }>;
  const product = productMap[id];

  // Units laden — gefiltert auf nicht ausgemusterte
  const { data: unitsRaw } = await supabase
    .from('product_units')
    .select('id, serial_number, label, status, notes')
    .eq('product_id', id)
    .neq('status', 'retired')
    .order('serial_number', { ascending: true });
  const units = (unitsRaw ?? []) as Unit[];

  // QR-Inhalt = vollstaendige Scan-URL. Beim Scannen mit der Smartphone-Kamera
  // oeffnet der Browser automatisch /admin/scan/<seriennr> und zeigt die Detail-
  // ansicht (Modell, Status, aktive Buchung). Der bestehende SerialScanner unter
  // /admin/buchungen/neu erkennt URLs auch — er extrahiert den letzten Pfad-
  // Segment, sodass nur die Seriennummer ins Eingabefeld faellt.
  const siteUrl = (await getSiteUrl()).replace(/\/+$/, '');
  const qrItems = await Promise.all(
    units.map(async (u) => ({
      ...u,
      qr: await QRCode.toDataURL(`${siteUrl}/admin/scan/${encodeURIComponent(u.serial_number)}`, {
        margin: 1,
        width: 360,
        errorCorrectionLevel: 'M',
      }),
    })),
  );

  const productLabel = product?.name ?? id;
  const brandLabel = product?.brand ?? '';

  return (
    <div className="min-h-screen bg-white text-black p-6 print:p-0">
      <div className="max-w-5xl mx-auto print:max-w-none">
        {/* Toolbar — wird beim Drucken ausgeblendet */}
        <div className="flex items-center justify-between mb-6 print:hidden">
          <div>
            <Link
              href={`/admin/preise/kameras/${id}`}
              className="text-sm text-cyan-600 hover:underline"
            >
              ← Zurück zur Kamera
            </Link>
            <h1 className="text-2xl font-bold mt-2">QR-Codes – {productLabel}</h1>
            <p className="text-sm text-gray-600">
              {qrItems.length} Seriennummer{qrItems.length === 1 ? '' : 'n'} · zum Aufkleben auf die jeweilige Kamera
            </p>
          </div>
          <PrintButton />
        </div>

        {qrItems.length === 0 ? (
          <div className="border border-dashed border-gray-300 rounded p-8 text-center text-gray-500 print:hidden">
            Keine Seriennummern hinterlegt. Lege erst Seriennummern unter{' '}
            <Link href={`/admin/preise/kameras/${id}`} className="text-cyan-600 underline">
              Kamera-Editor
            </Link>{' '}
            an.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 print:gap-2">
            {qrItems.map((u) => (
              <div
                key={u.id}
                className="border border-gray-300 rounded-lg p-3 flex flex-col items-center break-inside-avoid bg-white"
                style={{ pageBreakInside: 'avoid' }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={u.qr} alt={u.serial_number} className="w-full max-w-[160px] aspect-square" />
                <div className="text-center mt-2 w-full px-1 overflow-hidden">
                  {brandLabel && (
                    <p className="text-[10px] uppercase tracking-wider text-gray-500 truncate">{brandLabel}</p>
                  )}
                  <p className="text-xs font-bold text-black leading-tight truncate">{productLabel}</p>
                  <p className="text-sm font-mono font-bold text-black mt-1 break-all">{u.serial_number}</p>
                  {u.label && <p className="text-[10px] text-gray-500 mt-0.5 truncate">{u.label}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <style>{`
        @media print {
          @page { margin: 10mm; size: A4; }
          body { background: white !important; }
        }
      `}</style>
    </div>
  );
}
