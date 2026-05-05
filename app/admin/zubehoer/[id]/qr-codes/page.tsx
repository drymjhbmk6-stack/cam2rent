import { createServiceClient } from '@/lib/supabase';
import QRCode from 'qrcode';
import Link from 'next/link';
import PrintButton from '../../../preise/kameras/[id]/qr-codes/PrintButton';
import QrDownloadButton from '../../../preise/kameras/[id]/qr-codes/QrDownloadButton';
import { getSiteUrl } from '@/lib/env-mode';
import { resolveProdukteId, loadInventarUnitsForProdukt } from '@/lib/legacy-bridge';

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
    .select('id, name, category, is_bulk')
    .eq('id', id)
    .maybeSingle();

  const isBulk = (accessory as { is_bulk?: boolean } | null)?.is_bulk === true;

  const siteUrl = (await getSiteUrl()).replace(/\/+$/, '');

  // Bei Sammel-Zubehoer: ein einzelner QR auf accessory_id (statt N pro Exemplar).
  // Bei normalem Zubehoer: ein QR pro Exemplar.
  let qrItems: Array<{ id: string; exemplar_code: string; status: string; notes: string | null; qr: string }> = [];

  if (isBulk) {
    qrItems = [{
      id: id,
      exemplar_code: id,
      status: 'available',
      notes: null,
      qr: await QRCode.toDataURL(`${siteUrl}/admin/scan/${encodeURIComponent(id)}`, {
        margin: 1,
        width: 360,
        errorCorrectionLevel: 'M',
      }),
    }];
  } else {
    // Bevorzugt aus inventar_units (neue Welt) laden, Fallback auf
    // accessory_units (Pre-Migration-Daten).
    const produkteId = await resolveProdukteId(supabase, 'accessories', id, { autoCreate: true });
    let units: Unit[] = [];
    if (produkteId) {
      const inventarUnits = await loadInventarUnitsForProdukt(supabase, produkteId, {
        excludeRetired: true,
        trackingMode: 'individual',
      });
      units = inventarUnits.map((u) => ({
        id: u.id,
        exemplar_code: u.inventar_code || u.label || u.serial_number,
        status: u.status,
        notes: u.notes,
      }));
    }
    if (units.length === 0) {
      const { data: unitsRaw } = await supabase
        .from('accessory_units')
        .select('id, exemplar_code, status, notes')
        .eq('accessory_id', id)
        .neq('status', 'retired')
        .order('exemplar_code', { ascending: true });
      units = (unitsRaw ?? []) as Unit[];
    }

    qrItems = await Promise.all(
      units.map(async (u) => ({
        ...u,
        qr: await QRCode.toDataURL(`${siteUrl}/admin/scan/${encodeURIComponent(u.exemplar_code)}`, {
          margin: 1,
          width: 360,
          errorCorrectionLevel: 'M',
        }),
      })),
    );
  }

  const accessoryName = accessory?.name ?? id;

  return (
    <div className="min-h-screen bg-white text-black p-6 print:p-0">
      <div className="max-w-5xl mx-auto print:max-w-none">
        <div className="flex items-center justify-between mb-6 print:hidden">
          <div>
            <Link href="/admin/zubehoer" className="text-sm text-cyan-600 hover:underline">
              ← Zurück zum Zubehör
            </Link>
            <h1 className="text-2xl font-bold mt-2">QR-{isBulk ? 'Code' : 'Codes'} – {accessoryName}</h1>
            <p className="text-sm text-gray-600">
              {isBulk
                ? 'Sammel-QR · ein QR-Code für das gesamte Zubehör (auf den Aufbewahrungs-Behälter aufkleben)'
                : `${qrItems.length} Exemplar${qrItems.length === 1 ? '' : 'e'} · zum Aufkleben auf jedes Stück`}
            </p>
          </div>
          <PrintButton />
        </div>

        {qrItems.length > 0 && (
          <details className="mb-6 print:hidden bg-blue-50 border border-blue-200 rounded-lg">
            <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-blue-900">
              🖨️ Mit Brother P-touch oder anderem Etikettendrucker drucken?
            </summary>
            <div className="px-4 pb-4 text-sm text-blue-900 space-y-2">
              <p><strong>Variante 1 — Direkt aus Brother iPrint&amp;Label:</strong></p>
              <ol className="list-decimal pl-5 space-y-1">
                <li>Auf jedem QR-Etikett unten den Button <strong>📥 Als PNG speichern</strong> klicken</li>
                <li>Auf iOS: Bild öffnet sich → lange tippen → <strong>&bdquo;Zu Fotos hinzufügen&ldquo;</strong></li>
                <li>Brother-App öffnen → <strong>Neues Etikett → Bild einfügen</strong> → das gespeicherte QR-Bild auswählen</li>
                <li>Drucken</li>
              </ol>
              <p className="pt-2"><strong>Variante 2 — AirPrint (falls dein Drucker AirPrint kann):</strong></p>
              <ol className="list-decimal pl-5 space-y-1">
                <li>Oben rechts auf <strong>Drucken</strong> klicken</li>
                <li>Im iOS-Druckdialog deinen Brother auswählen</li>
                <li>Format/Skalierung anpassen, drucken</li>
              </ol>
              <p className="pt-2 text-xs text-blue-700">
                <strong>Tipp:</strong> Für Brother P-touch CUBE / D200 / D460BT etc. funktioniert nur Variante 1 — die brauchen die Brother-App.
              </p>
            </div>
          </details>
        )}

        {qrItems.length === 0 ? (
          <div className="border border-dashed border-gray-300 rounded p-8 text-center text-gray-500 print:hidden">
            Keine Exemplare hinterlegt. Lege Einzelstücke unter{' '}
            <Link href="/admin/inventar/neu" className="text-cyan-600 underline">
              Inventar
            </Link>{' '}
            an und ordne sie diesem Zubehör zu.
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
                <img src={u.qr} alt={u.exemplar_code} className="w-full max-w-[160px] aspect-square" />
                <div className="text-center mt-2 w-full px-1 overflow-hidden">
                  <p className="text-base font-mono font-bold text-black break-all leading-tight">{u.exemplar_code}</p>
                  <p className="text-xs text-gray-700 mt-1 truncate">{accessoryName}</p>
                </div>
                <div className="w-full mt-2 print:hidden">
                  <QrDownloadButton dataUrl={u.qr} filename={u.exemplar_code} />
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
