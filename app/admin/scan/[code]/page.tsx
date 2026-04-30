import { createServiceClient } from '@/lib/supabase';
import Link from 'next/link';
import { notFound } from 'next/navigation';

/**
 * Detail-Karte nach QR-Scan. Sucht den Code in product_units (Seriennummer)
 * und accessory_units (exemplar_code), zeigt:
 * - Bild
 * - Stammdaten (Marke, Name, Modell, Kategorie)
 * - Status
 * - Asset-Daten (Kaufdatum, Kaufpreis, Wiederbeschaffungswert)
 * - Kaution / Mietpreis-Info
 * - Aktive Buchung
 * - Notizen
 * - Quick-Actions (Editor, Belegungs-Kalender)
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

function fmtEuro(n: number | null | undefined) {
  if (n == null || isNaN(n)) return '—';
  return n.toFixed(2).replace('.', ',') + ' €';
}

interface AssetRow {
  id: string;
  current_value: number | null;
  purchase_price: number | null;
  purchase_date: string | null;
  useful_life_months: number | null;
  status: string | null;
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
    // Produkt-Stammdaten + Asset + aktive Buchungen parallel laden
    const today = new Date().toISOString().slice(0, 10);
    const [configRes, assetRes, bookingsRes] = await Promise.all([
      supabase.from('admin_config').select('value').eq('key', 'products').maybeSingle(),
      supabase.from('assets')
        .select('id, current_value, purchase_price, purchase_date, useful_life_months, status')
        .eq('unit_id', productUnit.id)
        .maybeSingle(),
      supabase.from('bookings')
        .select('id, customer_name, rental_from, rental_to, status, delivery_mode')
        .eq('unit_id', productUnit.id)
        .in('status', ['confirmed', 'shipped', 'picked_up'])
        .gte('rental_to', today)
        .order('rental_from', { ascending: true })
        .limit(5),
    ]);

    const productMap = (configRes?.data?.value ?? {}) as Record<string, {
      name?: string; brand?: string; model?: string; category?: string;
      images?: string[]; imageUrl?: string; deposit?: number;
    }>;
    const product = productMap[productUnit.product_id];
    const asset = (assetRes?.data ?? null) as AssetRow | null;
    const activeBookings = bookingsRes?.data ?? [];
    const heroImage = product?.images?.[0] ?? product?.imageUrl ?? null;

    return (
      <ScanLayout title="Kamera">
        {heroImage && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={heroImage} alt={product?.name ?? ''} className="w-full aspect-[4/3] object-contain bg-gray-50 rounded-xl mb-4" />
        )}

        <div className="space-y-4">
          <div>
            <p className="text-xs uppercase tracking-wider" style={{ color: '#6b7280' }}>{product?.brand ?? 'Marke'}{product?.category ? ` · ${product.category}` : ''}</p>
            <h1 className="text-2xl font-bold leading-tight" style={{ color: '#0f172a' }}>{product?.name ?? productUnit.product_id}</h1>
            {product?.model && <p className="text-sm mt-1" style={{ color: '#4b5563' }}>{product.model}</p>}
            <p className="text-base font-mono mt-2 break-all" style={{ color: '#0f172a' }}>{productUnit.serial_number}</p>
            {productUnit.label && <p className="text-sm mt-1" style={{ color: '#4b5563' }}>{productUnit.label}</p>}
          </div>

          <StatusBadge status={productUnit.status} />

          {/* Stammdaten-Grid: Kauf, Wert, Kaution */}
          <DataGrid items={[
            { label: 'Kaufdatum', value: fmtDate(productUnit.purchased_at ?? asset?.purchase_date ?? null) },
            { label: 'Kaufpreis', value: fmtEuro(asset?.purchase_price) },
            { label: 'Wiederbeschaffungswert', value: fmtEuro(asset?.current_value), highlight: true },
            { label: 'Kaution', value: fmtEuro(product?.deposit) },
            { label: 'Nutzungsdauer', value: asset?.useful_life_months ? `${asset.useful_life_months} Monate` : '—' },
            { label: 'Anlagen-Status', value: asset?.status ?? '—' },
          ]} />

          {productUnit.notes && <Note text={productUnit.notes} />}

          <BookingsBlock bookings={activeBookings} />

          <div className="flex flex-wrap gap-2 pt-3 border-t">
            <Link
              href={`/admin/preise/kameras/${productUnit.product_id}`}
              className="px-3 py-2 text-sm font-semibold bg-cyan-600 text-white rounded hover:bg-cyan-700"
            >
              Kamera-Editor
            </Link>
            {asset && (
              <Link
                href={`/admin/anlagen/${asset.id}`}
                className="px-3 py-2 text-sm font-semibold bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
              >
                Anlage öffnen
              </Link>
            )}
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
    const today = new Date().toISOString().slice(0, 10);
    const [accessoryRes, assetRes, bookingsRes] = await Promise.all([
      supabase.from('accessories').select('*').eq('id', accUnit.accessory_id).maybeSingle(),
      supabase.from('assets')
        .select('id, current_value, purchase_price, purchase_date, useful_life_months, status')
        .eq('accessory_unit_id', accUnit.id)
        .maybeSingle(),
      supabase.from('bookings')
        .select('id, customer_name, rental_from, rental_to, status, delivery_mode')
        .contains('accessory_unit_ids', [accUnit.id])
        .in('status', ['confirmed', 'shipped', 'picked_up'])
        .gte('rental_to', today)
        .order('rental_from', { ascending: true })
        .limit(5),
    ]);

    const accessory = (accessoryRes?.data ?? null) as null | {
      id: string; name?: string; category?: string; description?: string;
      image_url?: string; price?: number; price_type?: string;
    };
    const asset = (assetRes?.data ?? null) as AssetRow | null;
    const activeBookings = bookingsRes?.data ?? [];
    const heroImage = accessory?.image_url ?? null;

    return (
      <ScanLayout title="Zubehör">
        {heroImage && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={heroImage} alt={accessory?.name ?? ''} className="w-full aspect-[4/3] object-contain bg-gray-50 rounded-xl mb-4" />
        )}

        <div className="space-y-4">
          <div>
            <p className="text-xs uppercase tracking-wider" style={{ color: '#6b7280' }}>{accessory?.category ?? 'Zubehör'}</p>
            <h1 className="text-2xl font-bold leading-tight" style={{ color: '#0f172a' }}>{accessory?.name ?? accUnit.accessory_id}</h1>
            <p className="text-base font-mono mt-2 break-all" style={{ color: '#0f172a' }}>{accUnit.exemplar_code}</p>
            {accessory?.description && <p className="text-sm mt-2" style={{ color: '#4b5563' }}>{accessory.description}</p>}
          </div>

          <StatusBadge status={accUnit.status} />

          <DataGrid items={[
            { label: 'Kaufdatum', value: fmtDate(accUnit.purchased_at ?? asset?.purchase_date ?? null) },
            { label: 'Kaufpreis', value: fmtEuro(asset?.purchase_price) },
            { label: 'Wiederbeschaffungswert', value: fmtEuro(asset?.current_value), highlight: true },
            { label: 'Mietpreis', value: accessory?.price != null ? `${fmtEuro(accessory.price)}${accessory.price_type === 'perDay' ? '/Tag' : ' (einm.)'}` : '—' },
            { label: 'Nutzungsdauer', value: asset?.useful_life_months ? `${asset.useful_life_months} Monate` : '—' },
            { label: 'Anlagen-Status', value: asset?.status ?? '—' },
          ]} />

          {accUnit.notes && <Note text={accUnit.notes} />}

          <BookingsBlock bookings={activeBookings} />

          <div className="flex flex-wrap gap-2 pt-3 border-t">
            <Link href="/admin/zubehoer" className="px-3 py-2 text-sm font-semibold bg-cyan-600 text-white rounded hover:bg-cyan-700">
              Zubehör-Editor
            </Link>
            {asset && (
              <Link href={`/admin/anlagen/${asset.id}`} className="px-3 py-2 text-sm font-semibold bg-gray-100 text-gray-700 rounded hover:bg-gray-200">
                Anlage öffnen
              </Link>
            )}
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
  // Inline-Style + colorScheme: 'light' verhindert dass iOS-System-Dark-Mode
  // den Browser-Default-Text einfaerbt — sonst bekommen Elemente ohne
  // explizite text-Klasse einen weissen Default und sind unlesbar auf
  // weissem Karten-Hintergrund.
  return (
    <div
      className="min-h-screen px-4"
      style={{
        background: '#f8fafc',
        color: '#0f172a',
        colorScheme: 'light',
        // iOS Safe-Area-Top beachten (Notch / Dynamic Island), unten ebenfalls
        paddingTop: 'calc(1rem + env(safe-area-inset-top))',
        paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))',
      }}
    >
      <div className="max-w-md mx-auto mb-3">
        <Link
          href="/admin"
          className="inline-flex items-center gap-1 text-sm font-semibold py-2"
          style={{ color: '#0891b2' }}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Zur&uuml;ck zum Dashboard
        </Link>
      </div>
      <div
        className="max-w-md mx-auto rounded-2xl border p-5"
        style={{ background: '#ffffff', borderColor: '#e5e7eb', color: '#0f172a' }}
      >
        <p className="text-xs mb-3" style={{ color: '#6b7280' }}>QR-Scan · {title}</p>
        {children}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  // Inline-Farben statt Tailwind-Klassen, damit iOS-Dark-Mode nichts ueberschreibt.
  const colorMap: Record<string, { bg: string; fg: string }> = {
    available: { bg: '#dcfce7', fg: '#15803d' },
    rented: { bg: '#dbeafe', fg: '#1d4ed8' },
    maintenance: { bg: '#fef3c7', fg: '#b45309' },
    damaged: { bg: '#fee2e2', fg: '#b91c1c' },
    lost: { bg: '#fee2e2', fg: '#b91c1c' },
    retired: { bg: '#f3f4f6', fg: '#374151' },
  };
  const cfg = colorMap[status] ?? { bg: '#f3f4f6', fg: '#374151' };
  const label = STATUS_LABELS[status]?.label ?? status;
  return (
    <span
      className="inline-flex px-3 py-1 rounded-full text-sm font-semibold"
      style={{ background: cfg.bg, color: cfg.fg }}
    >
      {label}
    </span>
  );
}

function Note({ text }: { text: string }) {
  return (
    <div
      className="p-3 rounded text-sm whitespace-pre-wrap"
      style={{ background: '#fef3c7', border: '1px solid #fde68a', color: '#78350f' }}
    >
      {text}
    </div>
  );
}

function DataGrid({ items }: { items: { label: string; value: string; highlight?: boolean }[] }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {items.map((item, i) => (
        <div
          key={i}
          className="p-3 rounded-lg"
          style={item.highlight
            ? { background: '#ecfeff', border: '1px solid #a5f3fc' }
            : { background: '#f9fafb', border: '1px solid #e5e7eb' }}
        >
          <p className="text-[10px] uppercase tracking-wider" style={{ color: '#6b7280' }}>{item.label}</p>
          <p
            className="text-sm font-semibold mt-0.5"
            style={{ color: item.highlight ? '#155e75' : '#0f172a' }}
          >
            {item.value}
          </p>
        </div>
      ))}
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
      <div
        className="p-3 rounded text-sm"
        style={{ background: '#dcfce7', border: '1px solid #bbf7d0', color: '#14532d' }}
      >
        Keine aktive Buchung.
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#6b7280' }}>
        {bookings.length === 1 ? 'Aktive Buchung' : 'Aktive Buchungen'}
      </p>
      {bookings.map((b) => (
        <Link
          key={b.id}
          href={`/admin/buchungen/${b.id}`}
          className="block p-3 rounded-lg transition-colors"
          style={{ background: '#ffffff', border: '1px solid #e5e7eb', color: '#0f172a' }}
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-bold" style={{ color: '#0f172a' }}>{b.customer_name ?? 'Gast'}</p>
            <span className="text-xs px-2 py-0.5 rounded" style={{ background: '#f3f4f6', color: '#374151' }}>{b.status}</span>
          </div>
          <p className="text-xs mt-1" style={{ color: '#4b5563' }}>
            {fmtDate(b.rental_from)} – {fmtDate(b.rental_to)} · {b.delivery_mode === 'abholung' ? 'Abholung' : 'Versand'}
          </p>
          <p className="text-xs font-mono mt-0.5" style={{ color: '#6b7280' }}>{b.id}</p>
        </Link>
      ))}
    </div>
  );
}
