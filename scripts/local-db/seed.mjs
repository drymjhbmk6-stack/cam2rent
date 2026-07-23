/**
 * Legt Testdaten in der LOKALEN Supabase-DB an (Kameras, Exemplare, Zubehoer,
 * ein Set, Marken). Idempotent (upsert).
 *
 * Aufruf:  node --env-file=.env.local scripts/local-db/seed.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
  console.error('Fehlt NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Aufruf: node --env-file=.env.local scripts/local-db/seed.mjs');
  process.exit(1);
}
const db = createClient(URL, KEY, { auth: { persistSession: false } });

// 30-Tage-Preistabelle linear von d1 bis d30
const ramp = (d1, d30) =>
  Array.from({ length: 30 }, (_, i) => Math.round(d1 + ((d30 - d1) * i) / 29));

const PLACEHOLDER = '/images/placeholder-cam.svg';

const cameras = {
  '1': {
    id: '1', name: 'GoPro Hero 13 Black', brand: 'GoPro', model: 'Hero 13',
    slug: 'gopro-hero-13-black', shortDescription: '5.3K60, 27MP, wasserdicht bis 10m',
    description: 'Neueste GoPro fuer Sport, Reisen und Abenteuer.',
    priceTable: ramp(13, 149), perDayAfter30: 5, kautionTier: null,
    hasHaftungsoption: true, available: true, stock: 0, deposit: 150,
    category: 'action-cam', tags: ['popular'], images: [PLACEHOLDER],
  },
  '2': {
    id: '2', name: 'DJI Osmo Action 5 Pro', brand: 'DJI', model: 'Osmo Action 5 Pro',
    slug: 'dji-osmo-action-5-pro', shortDescription: '4K120, groesserer Sensor, lange Akkulaufzeit',
    description: 'DJI Action-Cam mit starkem Low-Light-Verhalten.',
    priceTable: ramp(10, 120), perDayAfter30: 4, kautionTier: null,
    hasHaftungsoption: true, available: true, stock: 0, deposit: 120,
    category: 'action-cam', tags: ['deal'], images: [PLACEHOLDER],
  },
  '5': {
    id: '5', name: 'Insta360 X4', brand: 'Insta360', model: 'X4',
    slug: 'insta360-x4', shortDescription: '8K360, unsichtbarer Stick-Effekt',
    description: '360-Grad-Kamera fuer kreative Perspektiven.',
    priceTable: ramp(15, 160), perDayAfter30: 5, kautionTier: null,
    hasHaftungsoption: true, available: true, stock: 0, deposit: 180,
    category: '360-cam', tags: ['new'], images: [PLACEHOLDER],
  },
};

const accessories = [
  { id: 'akku-1', name: 'Ersatzakku', category: 'Strom', pricing_mode: 'flat', price: 5.9, available_qty: 10, available: true, is_bulk: true, compatible_product_ids: [] },
  { id: 'sd-256', name: 'Speicherkarte 256 GB', category: 'Speicher', pricing_mode: 'flat', price: 7.9, available_qty: 8, available: true, is_bulk: true, compatible_product_ids: [] },
  { id: 'stativ-1', name: 'Mini-Stativ', category: 'Halterung', pricing_mode: 'perDay', price: 2.5, available_qty: 5, available: true, is_bulk: false, compatible_product_ids: [] },
  { id: 'float-1', name: 'Floating Handle', category: 'Halterung', pricing_mode: 'perDay', price: 2.0, available_qty: 6, available: true, is_bulk: false, compatible_product_ids: ['1', '2'] },
];

const sets = [
  { id: 'basic-set-gopro', name: 'Basic Set', pricing_mode: 'flat', price: 9.9, available: true, product_ids: ['1'], accessory_items: [{ accessory_id: 'akku-1', qty: 1 }, { accessory_id: 'sd-256', qty: 1 }], basic_for_product_ids: ['1'] },
];

const adminSettings = [
  { key: 'camera_brands', value: JSON.stringify(['GoPro', 'DJI', 'Insta360']) },
  { key: 'brand_colors', value: JSON.stringify({ GoPro: '#0b7dc4', DJI: '#111827', Insta360: '#ff5c00' }) },
  { key: 'environment_mode', value: JSON.stringify({ mode: 'test' }) },
];

async function main() {
  // 1) Produkte (admin_config.products als Record)
  let r = await db.from('admin_config').upsert({ key: 'products', value: cameras }, { onConflict: 'key' });
  if (r.error) throw new Error('products: ' + r.error.message);
  console.log('✓ admin_config.products:', Object.keys(cameras).length, 'Kameras');

  // 2) Exemplare (product_units) -> Bestand > 0, buchbar. Erst leeren, dann 2 pro Kamera.
  await db.from('product_units').delete().in('product_id', Object.keys(cameras));
  const units = [];
  for (const id of Object.keys(cameras)) {
    for (let n = 1; n <= 2; n++) {
      const serial = `SN-${id}-${String(n).padStart(3, '0')}`;
      units.push({ id: randomUUID(), product_id: id, serial_number: serial, label: `${cameras[id].name} #${n}`, status: 'available', purchased_at: '2025-01-01' });
    }
  }
  r = await db.from('product_units').insert(units);
  if (r.error) throw new Error('product_units: ' + r.error.message);
  console.log('✓ product_units:', units.length, 'Exemplare');

  // 3) Zubehoer
  r = await db.from('accessories').upsert(accessories, { onConflict: 'id' });
  if (r.error) throw new Error('accessories: ' + r.error.message);
  console.log('✓ accessories:', accessories.length);

  // 4) Sets
  r = await db.from('sets').upsert(sets, { onConflict: 'id' });
  if (r.error) throw new Error('sets: ' + r.error.message);
  console.log('✓ sets:', sets.length);

  // 5) Einstellungen (Marken/Farben)
  r = await db.from('admin_settings').upsert(adminSettings, { onConflict: 'key' });
  if (r.error) throw new Error('admin_settings: ' + r.error.message);
  console.log('✓ admin_settings:', adminSettings.length);

  console.log('\nFertig. Testdaten angelegt.');
}

main().catch((e) => { console.error('Abbruch:', e.message); process.exit(1); });
