import { createServiceClient } from '@/lib/supabase';
import Link from 'next/link';
import AdminBackLink from '@/components/admin/AdminBackLink';
import InventarFilter from './InventarFilter';

/**
 * Inventar-Liste — alle physischen Kamera- und Zubehör-Exemplare auf einen
 * Blick. Klick auf eine Zeile öffnet die Scan-Detail-Karte
 * (/admin/scan/<code>) mit Bild, Asset-Daten, aktiver Buchung etc.
 *
 * Suchen + Filter laufen client-seitig, die Seite ist eine
 * Server-Component die einmal alle Units laedt (typisch < 200 Stueck).
 */

export const dynamic = 'force-dynamic';

interface ListItem {
  type: 'camera' | 'accessory';
  code: string;
  name: string;
  status: string;
  href: string;
  context?: string; // z.B. Marke (GoPro) oder Kategorie (Akku)
  extraSearch?: string; // zusaetzliche Suchbegriffe (z.B. Seriennummer wenn Code = Bezeichnung)
}

const STATUS_LABELS: Record<string, string> = {
  available: 'Verfügbar',
  rented: 'Vermietet',
  maintenance: 'Wartung',
  damaged: 'Beschädigt',
  lost: 'Verloren',
  retired: 'Ausgemustert',
};

export default async function InventarPage() {
  const supabase = createServiceClient();

  const [productUnitsRes, accUnitsRes, configRes, accessoriesRes] = await Promise.all([
    supabase.from('product_units').select('id, product_id, serial_number, label, status').order('serial_number'),
    supabase.from('accessory_units').select('id, accessory_id, exemplar_code, status').order('exemplar_code'),
    supabase.from('admin_config').select('value').eq('key', 'products').maybeSingle(),
    supabase.from('accessories').select('id, name, category, is_bulk, available_qty, available'),
  ]);

  const productMap = (configRes?.data?.value ?? {}) as Record<string, { name?: string; brand?: string }>;
  const accessoryRows = (accessoriesRes.data ?? []) as Array<{
    id: string; name?: string; category?: string;
    is_bulk?: boolean; available_qty?: number; available?: boolean;
  }>;
  const accessoryMap = new Map(
    accessoryRows.map((a) => [a.id, { name: a.name, category: a.category, is_bulk: a.is_bulk }]),
  );
  const bulkAccessories = accessoryRows.filter((a) => a.is_bulk === true);

  const items: ListItem[] = [];

  for (const u of productUnitsRes.data ?? []) {
    const product = productMap[u.product_id];
    // Bezeichnung (label) hat Vorrang — Fallback auf Seriennummer wenn noch keine
    // gepflegt ist, damit die Liste keine leeren Codes enthaelt.
    const displayCode = (u.label && u.label.trim()) || u.serial_number;
    const hasLabel = displayCode !== u.serial_number;
    items.push({
      type: 'camera',
      code: displayCode,
      name: product?.name ?? u.product_id,
      status: u.status,
      // QR-Code zeigt immer auf die Seriennummer (das ist der gescannte Wert)
      href: `/admin/scan/${encodeURIComponent(u.serial_number)}`,
      context: product?.brand ?? undefined,
      // Damit Suche nach Seriennummer auch trifft, selbst wenn eine Bezeichnung sichtbar ist
      extraSearch: hasLabel ? u.serial_number : undefined,
    });
  }

  for (const u of accUnitsRes.data ?? []) {
    const acc = accessoryMap.get(u.accessory_id);
    // Sammel-Zubehoer hat keine echten Einzel-Exemplare, sondern wird unten
    // einmal pro accessory angezeigt. Defensiv hier auch raus filtern.
    if (acc?.is_bulk) continue;
    items.push({
      type: 'accessory',
      code: u.exemplar_code,
      name: acc?.name ?? u.accessory_id,
      status: u.status,
      href: `/admin/scan/${encodeURIComponent(u.exemplar_code)}`,
      context: acc?.category ?? undefined,
    });
  }

  // Sammel-Zubehoer: ein Eintrag pro accessory (nicht pro physisches Stueck)
  for (const a of bulkAccessories) {
    items.push({
      type: 'accessory',
      code: a.id,
      name: `${a.name ?? a.id} (Sammel · ${a.available_qty ?? 0} Stk.)`,
      status: a.available === false ? 'retired' : 'available',
      href: `/admin/scan/${encodeURIComponent(a.id)}`,
      context: a.category ?? undefined,
    });
  }

  // Sortierung: zuerst Kameras, dann Zubehör; jeweils alphabetisch
  items.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'camera' ? -1 : 1;
    return a.code.localeCompare(b.code);
  });

  const cameraCount = items.filter((i) => i.type === 'camera').length;
  const accessoryCount = items.filter((i) => i.type === 'accessory').length;

  return (
    <div style={{ padding: '20px 16px', maxWidth: 900, margin: '0 auto' }}>
      <AdminBackLink label="Zurück" />
      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#e2e8f0', marginBottom: 4 }}>Inventar</h1>
      <p style={{ fontSize: 13, color: '#64748b', marginBottom: 18 }}>
        {cameraCount} Kamera{cameraCount === 1 ? '' : 's'} · {accessoryCount} Zubehör-Exempl{accessoryCount === 1 ? 'ar' : 'are'}
        {' · '}Klick auf eine Zeile öffnet die Detail-Karte (analog QR-Scan).
      </p>

      {items.length === 0 ? (
        <div style={{ padding: 32, textAlign: 'center', color: '#64748b', background: '#111827', border: '1px dashed #334155', borderRadius: 12 }}>
          Noch keine Seriennummern angelegt. Lege erst Exemplare unter{' '}
          <Link href="/admin/preise/kameras" style={{ color: '#06b6d4' }}>Kameras</Link> oder{' '}
          <Link href="/admin/zubehoer" style={{ color: '#06b6d4' }}>Zubehör</Link> an.
        </div>
      ) : (
        <InventarFilter items={items} statusLabels={STATUS_LABELS} />
      )}
    </div>
  );
}
