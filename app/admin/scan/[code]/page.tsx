import { createServiceClient } from '@/lib/supabase';
import Link from 'next/link';
import { notFound } from 'next/navigation';

/**
 * Landing-Page nach QR-Scan. Sucht den Code in product_units (Seriennummer)
 * und accessory_units (exemplar_code), zeigt Stammdaten + aktuellen Status +
 * aktive Buchung. Erreichbar unter /admin/scan/<code>.
 */

interface PageProps {
  params: Promise<{ code: string }>;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  available: { label: 'Verfügbar', color: 'bg-green-100 text-green-700' },
  rented: { label: 'Vermietet', color: 'bg-blue-100 text-blue-700' },
  maintenance: { label: 'In Wartung', color: 'bg-amber-100 text-amber-700' },
  damaged: { label: 'Beschädigt', color: 'bg-red-100 text-red-700' },
  lost: { label: 'Verloren', color: 'bg-red-100 text-red-700' },
  retired: { label: 'Ausgemustert', color: 'bg-gray-100 text-gray-700' },
};

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    timeZone: 'Europe/Berlin',
  });
}

export default async function ScanLandingPage({ params }: PageProps) {
  const { code } = await params;
  const decodedCode = decodeURIComponent(code).trim();
  if (!decodedCode) notFound();

  const supabase = createServiceClient();

  // 1) Versuche product_units (Kameras)
  const { data: productUnit } = await supabase
    .from('product_units')
    .select('id, product_id, serial_number, label, status, notes, purchased_at')
    .eq('serial_number', decodedCode)
    .maybeSingle();

  if (productUnit) {
    // Produkt-Stammdaten
    const { data: configRow } = await supabase
      .from('admin_config')
      .select('value')
      .eq('key', 'products')
      .maybeSingle();
    const productMap = (configRow?.value ?? {}) as Record<string, { name?: string; brand?: string }>;
    const product = productMap[productUnit.product_id];

    // Aktive / kommende Buchung dieser Unit
    const today = new Date().toISOString().slice(0, 10);
    const { data: activeBookings } = await supabase
      .from('bookings')
      .select('id, customer_name, rental_from, rental_to, status, delivery_mode')
      .eq('unit_id', productUnit.id)
      .in('status', ['confirmed', 'shipped', 'picked_up'])
      .gte('rental_to', today)
      .order('rental_from', { ascending: true })
      .limit(5);

    return (
      <ScanLayout title="Kamera">
        <div className="space-y-4">
          <div>
            <p className="text-xs uppercase tracking-wider text-gray-500">{product?.brand ?? 'Marke'}</p>
            <h1 className="text-2xl font-bold">{product?.name ?? productUnit.product_id}</h1>
            <p className="text-base font-mono mt-1">{productUnit.serial_number}</p>
            {productUnit.label && <p className="text-sm text-gray-600 mt-1">{productUnit.label}</p>}
          </div>

          <StatusBadge status={productUnit.status} />

          {productUnit.notes && (
            <Note text={productUnit.notes} />
          )}

          <BookingsBlock bookings={activeBookings ?? []} />

          <div className="flex flex-wrap gap-2 pt-3 border-t">
            <Link
              href={`/admin/preise/kameras/${productUnit.product_id}`}
              className="px-3 py-2 text-sm font-semibold bg-cyan-600 text-white rounded hover:bg-cyan-700"
            >
              Kamera-Editor
            </Link>
            <Link
              href={`/admin/verfuegbarkeit?product=${productUnit.product_id}`}
              className="px-3 py-2 text-sm font-semibold bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
            >
              Belegungs-Kalender
            </Link>
          </div>
        </div>
      </ScanLayout>
    );
  }

  // 2) Versuche accessory_units (Zubehör)
  const { data: accUnit } = await supabase
    .from('accessory_units')
    .select('id, accessory_id, exemplar_code, status, notes, purchased_at')
    .eq('exemplar_code', decodedCode)
    .maybeSingle();

  if (accUnit) {
    const { data: accessory } = await supabase
      .from('accessories')
      .select('id, name, category')
      .eq('id', accUnit.accessory_id)
      .maybeSingle();

    // Aktive Buchungen die dieses Exemplar enthalten (über accessory_unit_ids[])
    const today = new Date().toISOString().slice(0, 10);
    const { data: activeBookings } = await supabase
      .from('bookings')
      .select('id, customer_name, rental_from, rental_to, status, delivery_mode')
      .contains('accessory_unit_ids', [accUnit.id])
      .in('status', ['confirmed', 'shipped', 'picked_up'])
      .gte('rental_to', today)
      .order('rental_from', { ascending: true })
      .limit(5);

    return (
      <ScanLayout title="Zubehör">
        <div className="space-y-4">
          <div>
            <p className="text-xs uppercase tracking-wider text-gray-500">{accessory?.category ?? 'Zubehör'}</p>
            <h1 className="text-2xl font-bold">{accessory?.name ?? accUnit.accessory_id}</h1>
            <p className="text-base font-mono mt-1">{accUnit.exemplar_code}</p>
          </div>

          <StatusBadge status={accUnit.status} />

          {accUnit.notes && <Note text={accUnit.notes} />}

          <BookingsBlock bookings={activeBookings ?? []} />

          <div className="flex flex-wrap gap-2 pt-3 border-t">
            <Link
              href="/admin/zubehoer"
              className="px-3 py-2 text-sm font-semibold bg-cyan-600 text-white rounded hover:bg-cyan-700"
            >
              Zubehör-Editor
            </Link>
          </div>
        </div>
      </ScanLayout>
    );
  }

  // 3) Nichts gefunden
  return (
    <ScanLayout title="Code unbekannt">
      <div className="space-y-3">
        <p className="text-base">Der gescannte Code <code className="font-mono px-1.5 py-0.5 bg-gray-100 rounded">{decodedCode}</code> wurde nicht gefunden.</p>
        <p className="text-sm text-gray-600">Möglicherweise wurde die Seriennummer geändert oder das Etikett gehört zu einem ausgemusterten Gerät.</p>
        <Link href="/admin" className="inline-block px-3 py-2 text-sm font-semibold bg-gray-100 text-gray-700 rounded hover:bg-gray-200">
          Zurück zum Dashboard
        </Link>
      </div>
    </ScanLayout>
  );
}

function ScanLayout({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 px-4 py-6">
      <div className="max-w-md mx-auto bg-white rounded-2xl border border-gray-200 p-5">
        <p className="text-xs text-gray-500 mb-3">QR-Scan · {title}</p>
        {children}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_LABELS[status] ?? { label: status, color: 'bg-gray-100 text-gray-700' };
  return (
    <span className={`inline-flex px-3 py-1 rounded-full text-sm font-semibold ${cfg.color}`}>
      {cfg.label}
    </span>
  );
}

function Note({ text }: { text: string }) {
  return (
    <div className="p-3 bg-amber-50 border border-amber-200 rounded text-sm text-amber-900 whitespace-pre-wrap">
      {text}
    </div>
  );
}

interface BookingRow {
  id: string;
  customer_name: string | null;
  rental_from: string;
  rental_to: string;
  status: string;
  delivery_mode: string;
}

function BookingsBlock({ bookings }: { bookings: BookingRow[] }) {
  if (bookings.length === 0) {
    return (
      <div className="p-3 bg-green-50 border border-green-200 rounded text-sm text-green-900">
        Keine aktive Buchung.
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
        {bookings.length === 1 ? 'Aktive Buchung' : 'Aktive Buchungen'}
      </p>
      {bookings.map((b) => (
        <Link
          key={b.id}
          href={`/admin/buchungen/${b.id}`}
          className="block p-3 border border-gray-200 rounded-lg hover:border-cyan-500 hover:bg-cyan-50 transition-colors"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-bold">{b.customer_name ?? 'Gast'}</p>
            <span className="text-xs px-2 py-0.5 bg-gray-100 rounded">{b.status}</span>
          </div>
          <p className="text-xs text-gray-600 mt-1">
            {fmtDate(b.rental_from)} – {fmtDate(b.rental_to)} · {b.delivery_mode === 'abholung' ? 'Abholung' : 'Versand'}
          </p>
          <p className="text-xs font-mono text-gray-500 mt-0.5">{b.id}</p>
        </Link>
      ))}
    </div>
  );
}
