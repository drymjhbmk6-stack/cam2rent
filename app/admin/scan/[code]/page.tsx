import { createServiceClient } from '@/lib/supabase';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import ScanBackLink from './ScanBackLink';
import EditableCode from './EditableCode';

/**
 * Detail-Karte nach QR-Scan. Sucht den Code in product_units (Seriennummer)
 * und accessory_units (exemplar_code). Beide Pfade normalisieren ihre Daten
 * in eine gemeinsame UnitCardData-Form, sodass das Rendering ueber einen
 * einzigen <UnitCard>-Pfad laeuft. Damit gibt es keine Drift mehr zwischen
 * den beiden Karten (z.B. Inline-Edit auf beiden gleich).
 */

interface PageProps {
  params: Promise<{ code: string }>;
}

const STATUS_LABELS: Record<string, string> = {
  available: 'Verfügbar',
  rented: 'Vermietet',
  maintenance: 'In Wartung',
  damaged: 'Beschädigt',
  lost: 'Verloren',
  retired: 'Ausgemustert',
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

interface BookingRow {
  id: string;
  customer_name: string | null;
  rental_from: string;
  rental_to: string;
  status: string;
  delivery_mode: string;
}

interface DataGridItem {
  label: string;
  value: string;
  highlight?: boolean;
  fullWidth?: boolean;
  mono?: boolean;
}

interface ActionLink {
  href: string;
  label: string;
  primary?: boolean;
}

interface UnitCardData {
  layoutTitle: string; // "Kamera" / "Zubehör"
  kind: 'camera' | 'accessory';
  unitId: string;
  headerLabel: string; // z.B. "INSTA360 · 360-CAM" oder "AKKU"
  name: string;
  subtitle?: string | null; // Modell, Label oder Description
  code: string; // Seriennummer / Exemplar-Code
  statusKey: string;
  heroImage: string | null;
  dataGrid: DataGridItem[];
  note?: string | null;
  bookings: BookingRow[];
  actions: ActionLink[];
}

export default async function ScanLandingPage({ params }: PageProps) {
  const { code } = await params;
  const decodedCode = decodeURIComponent(code).trim();
  if (!decodedCode) notFound();

  const supabase = createServiceClient();
  const today = new Date().toISOString().slice(0, 10);

  // 1) Versuche product_units (Kameras) — primaer ueber Bezeichnung (label),
  //    Fallback ueber Seriennummer fuer alte QR-Aufkleber, die noch die
  //    Seriennummer in der URL hatten.
  let { data: productUnit } = await supabase
    .from('product_units')
    .select('id, product_id, serial_number, label, status, notes, purchased_at')
    .eq('label', decodedCode)
    .maybeSingle();

  if (!productUnit) {
    const fallback = await supabase
      .from('product_units')
      .select('id, product_id, serial_number, label, status, notes, purchased_at')
      .eq('serial_number', decodedCode)
      .maybeSingle();
    productUnit = fallback.data;
  }

  if (productUnit) {
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

    const data: UnitCardData = {
      layoutTitle: 'Kamera',
      kind: 'camera',
      unitId: productUnit.id,
      headerLabel: `${product?.brand ?? 'Marke'}${product?.category ? ` · ${product.category}` : ''}`,
      name: product?.name ?? productUnit.product_id,
      subtitle: product?.model ?? null,
      code: productUnit.label ?? '',
      statusKey: productUnit.status,
      heroImage: product?.images?.[0] ?? product?.imageUrl ?? null,
      dataGrid: [
        { label: 'Seriennummer', value: productUnit.serial_number, fullWidth: true, mono: true },
        { label: 'Kaufdatum', value: fmtDate(productUnit.purchased_at ?? asset?.purchase_date ?? null) },
        { label: 'Kaufpreis', value: fmtEuro(asset?.purchase_price) },
        { label: 'Wiederbeschaffungswert', value: fmtEuro(asset?.current_value), highlight: true },
        { label: 'Kaution', value: fmtEuro(product?.deposit) },
        { label: 'Nutzungsdauer', value: asset?.useful_life_months ? `${asset.useful_life_months} Monate` : '—' },
        { label: 'Anlagen-Status', value: asset?.status ?? '—' },
      ],
      note: productUnit.notes,
      bookings: bookingsRes?.data ?? [],
      actions: [
        { href: `/admin/preise/kameras/${productUnit.product_id}`, label: 'Kamera-Editor', primary: true },
        ...(asset ? [{ href: `/admin/anlagen/${asset.id}`, label: 'Anlage öffnen' }] : []),
        { href: `/admin/verfuegbarkeit?product=${productUnit.product_id}`, label: 'Belegungs-Kalender' },
      ],
    };

    return <UnitCard data={data} />;
  }

  // 2) Versuche accessory_units (Zubehör)
  const { data: accUnit } = await supabase
    .from('accessory_units')
    .select('id, accessory_id, exemplar_code, status, notes, purchased_at')
    .eq('exemplar_code', decodedCode)
    .maybeSingle();

  if (accUnit) {
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

    const data: UnitCardData = {
      layoutTitle: 'Zubehör',
      kind: 'accessory',
      unitId: accUnit.id,
      headerLabel: accessory?.category ?? 'Zubehör',
      name: accessory?.name ?? accUnit.accessory_id,
      subtitle: accessory?.description ?? null,
      code: accUnit.exemplar_code,
      statusKey: accUnit.status,
      heroImage: accessory?.image_url ?? null,
      dataGrid: [
        { label: 'Kaufdatum', value: fmtDate(accUnit.purchased_at ?? asset?.purchase_date ?? null) },
        { label: 'Kaufpreis', value: fmtEuro(asset?.purchase_price) },
        { label: 'Wiederbeschaffungswert', value: fmtEuro(asset?.current_value), highlight: true },
        { label: 'Mietpreis', value: accessory?.price != null ? `${fmtEuro(accessory.price)}${accessory.price_type === 'perDay' ? '/Tag' : ' (einmalig)'}` : '—' },
        { label: 'Nutzungsdauer', value: asset?.useful_life_months ? `${asset.useful_life_months} Monate` : '—' },
        { label: 'Anlagen-Status', value: asset?.status ?? '—' },
      ],
      note: accUnit.notes,
      bookings: bookingsRes?.data ?? [],
      actions: [
        { href: '/admin/zubehoer', label: 'Zubehör-Editor', primary: true },
        ...(asset ? [{ href: `/admin/anlagen/${asset.id}`, label: 'Anlage öffnen' }] : []),
      ],
    };

    return <UnitCard data={data} />;
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

function UnitCard({ data }: { data: UnitCardData }) {
  return (
    <ScanLayout title={data.layoutTitle}>
      <div className="space-y-4">
        <div className="flex gap-4 items-stretch">
          <div className="flex-1 min-w-0 flex flex-col">
            <p className="text-xs uppercase tracking-wider" style={{ color: '#6b7280' }}>{data.headerLabel}</p>
            <h1 className="text-2xl font-bold leading-tight" style={{ color: '#0f172a' }}>{data.name}</h1>
            {data.subtitle && <p className="text-sm mt-1" style={{ color: '#4b5563' }}>{data.subtitle}</p>}
            {data.kind === 'accessory' ? (
              <EditableCode kind={data.kind} unitId={data.unitId} initialCode={data.code} />
            ) : (
              <p className="text-sm font-mono mt-1" style={{ color: '#0f172a' }}>{data.code}</p>
            )}
            <div className="mt-auto pt-3">
              <StatusBadge status={data.statusKey} />
            </div>
          </div>
          {data.heroImage && (
            <a
              href={data.heroImage}
              target="_blank"
              rel="noopener noreferrer"
              className="w-32 flex-shrink-0 block transition-transform active:scale-95"
              aria-label="Bild vergrößern"
              title="Bild vergrößern"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={data.heroImage} alt={data.name} className="w-full h-full object-contain bg-gray-50 rounded-xl" />
            </a>
          )}
        </div>

        <DataGrid items={data.dataGrid} />

        {data.note && <Note text={data.note} />}

        <BookingsBlock bookings={data.bookings} />

        {data.actions.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-3 border-t">
            {data.actions.map((a) => (
              <Link
                key={a.href}
                href={a.href}
                className={`px-3 py-2 text-sm font-semibold rounded ${
                  a.primary
                    ? 'bg-cyan-600 text-white hover:bg-cyan-700'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {a.label}
              </Link>
            ))}
          </div>
        )}
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
        <ScanBackLink />
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
  const label = STATUS_LABELS[status] ?? status;
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

function DataGrid({ items }: { items: DataGridItem[] }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {items.map((item, i) => (
        <div
          key={i}
          className={`p-3 rounded-lg ${item.fullWidth ? 'col-span-2' : ''}`}
          style={item.highlight
            ? { background: '#ecfeff', border: '1px solid #a5f3fc' }
            : { background: '#f9fafb', border: '1px solid #e5e7eb' }}
        >
          <p className="text-[10px] uppercase tracking-wider" style={{ color: '#6b7280' }}>{item.label}</p>
          <p
            className={`text-sm font-semibold mt-0.5 break-all ${item.mono ? 'font-mono' : ''}`}
            style={{ color: item.highlight ? '#155e75' : '#0f172a' }}
          >
            {item.value}
          </p>
        </div>
      ))}
    </div>
  );
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
