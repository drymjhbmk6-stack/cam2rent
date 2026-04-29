import { createServiceClient } from '@/lib/supabase';
import QRCode from 'qrcode';
import Link from 'next/link';
import PrintButton from '../../../preise/kameras/[id]/qr-codes/PrintButton';
import { getSiteUrl } from '@/lib/env-mode';

interface Unit {
  id: string;
  exemplar_code: string;
  status: string;
  notes: string | null;
}

export default async function ZubehoerQrCodesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = createServiceClient();

  // Zubehör laden
  const { data: accessory } = await supabase
    .from('accessories')
    .select('id, name, category')
    .eq('id', id)
    .maybeSingle();

  // Units laden (kein 'retired')
  const { data: unitsRaw } = await supabase
    .from('accessory_units')
    .select('id, exemplar_code, status, notes')
    .eq('accessory_id', id)
    .neq('status', 'retired')
    .order('exemplar_code', { ascending: true });
  const units = (unitsRaw ?? []) as Unit[];

  const siteUrl = (await getSiteUrl()).replace(/\/+$/, '');
  const qrItems = await Promise.all(
    units.map(async (u) => ({
      ...u,
      qr: await QRCode.toDataURL(`${siteUrl}/admin/scan/${encodeURIComponent(u.exemplar_code)}`, {
        margin: 1,
        width: 360,
        errorCorrectionLevel: 'M',
      }),
    })),
  );

  const accessoryName = accessory?.name ?? id;
  const categoryLabel = accessory?.category ?? '';

  return (
    <div className="min-h-screen bg-white text-black p-6 print:p-0">
      <div className="max-w-5xl mx-auto print:max-w-none">
        <div className="flex items-center justify-between mb-6 print:hidden">
          <div>
            <Link href="/admin/zubehoer" className="text-sm text-cyan-600 hover:underline">
              ← Zurück zum Zubehör
            </Link>
            <h1 className="text-2xl font-bold mt-2">QR-Codes – {accessoryName}</h1>
            <p className="text-sm text-gray-600">
              {qrItems.length} Exemplar{qrItems.length === 1 ? '' : 'e'} · zum Aufkleben auf jedes Stück
            </p>
          </div>
          <PrintButton />
        </div>

        {qrItems.length === 0 ? (
          <div className="border border-dashed border-gray-300 rounded p-8 text-center text-gray-500 print:hidden">
            Keine Exemplare hinterlegt. Lege erst Einzelstücke unter{' '}
            <Link href="/admin/zubehoer" className="text-cyan-600 underline">
              Zubehör-Verwaltung
            </Link>{' '}
            an.
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3 print:gap-2">
            {qrItems.map((u) => (
              <div
                key={u.id}
                className="border border-gray-300 rounded-lg p-3 flex flex-col items-center break-inside-avoid"
                style={{ pageBreakInside: 'avoid' }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={u.qr} alt={u.exemplar_code} className="w-full max-w-[180px] aspect-square" />
                <div className="text-center mt-1">
                  {categoryLabel && (
                    <p className="text-[10px] uppercase tracking-wider text-gray-500">{categoryLabel}</p>
                  )}
                  <p className="text-sm font-bold leading-tight">{accessoryName}</p>
                  <p className="text-base font-mono font-bold mt-1">{u.exemplar_code}</p>
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
