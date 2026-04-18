/**
 * Zentrale Produktliste: Nur aus DB.
 * Wird von API-Routen und Server-Komponenten genutzt.
 */
import { createServiceClient } from '@/lib/supabase';
import { type Product } from '@/data/products';
import {
  DEFAULT_PRODUCT_PRICES,
  DEFAULT_KAUTION_TIERS,
  type AdminProduct,
  type AdminProducts,
  type KautionTiers,
} from '@/lib/price-config';

/**
 * Konvertiert ein AdminProduct (DB-Format) in ein vollständiges Product (Shop-Format).
 * Statische Daten werden als Fallback genutzt.
 */
function adminToProduct(
  admin: AdminProduct,
  staticFallback: Product | undefined,
  kautionTiers: KautionTiers,
  hasUnits: boolean,
): Product {
  // Preistabelle: AdminProduct hat number[], Product hat PriceEntry[]
  const priceTable = admin.priceTable.map((price, i) => ({
    days: i + 1,
    price,
  }));

  // Deposit: explizit gesetzt, oder aus kautionTier, oder Fallback
  const deposit = admin.deposit
    ?? (admin.kautionTier ? kautionTiers[admin.kautionTier]?.amount : undefined)
    ?? (DEFAULT_PRODUCT_PRICES[admin.id]?.deposit)
    ?? staticFallback?.deposit
    ?? 0;

  // Specs: AdminProductSpec[] → { resolution, fps, ... } für Abwärtskompatibilität
  const defaultSpecs = staticFallback?.specs ?? {
    resolution: '', fps: '', waterproof: '', battery: '', weight: '', storage: '',
  };
  const specs = admin.specs?.length
    ? admin.specs.reduce(
        (acc, s) => {
          const key = s.id as keyof typeof defaultSpecs;
          if (key in defaultSpecs) acc[key] = s.value;
          return acc;
        },
        { ...defaultSpecs },
      )
    : defaultSpecs;

  return {
    id: admin.id,
    name: admin.name,
    brand: admin.brand,
    model: admin.model ?? staticFallback?.model ?? admin.name.replace(admin.brand, '').trim(),
    description: admin.description ?? staticFallback?.description ?? admin.shortDescription,
    shortDescription: admin.shortDescription,
    pricePerDay: admin.priceTable[0] ?? staticFallback?.pricePerDay ?? 0,
    pricePerWeekend: admin.priceTable[1] ?? staticFallback?.pricePerWeekend ?? 0,
    pricePerWeek: admin.priceTable[6] ?? staticFallback?.pricePerWeek ?? 0,
    priceTable,
    priceFormula31plus: {
      base: (admin.priceTable[29] ?? 0) - 30 * admin.perDayAfter30,
      perDay: admin.perDayAfter30,
    },
    deposit,
    offersHaftungsoption: admin.hasHaftungsoption,
    images: admin.images?.length
      ? admin.images
      : admin.imageUrl
        ? [admin.imageUrl]
        : staticFallback?.images ?? ['/images/placeholder-cam.svg'],
    specs,
    adminSpecs: admin.specs?.length ? admin.specs : undefined,
    category: admin.category ?? staticFallback?.category ?? 'action-cam',
    tags: (admin.tags ?? staticFallback?.tags ?? []) as Product['tags'],
    available: admin.available,
    stock: admin.stock,
    slug: admin.slug,
    hasUnits,
  };
}

/**
 * Lädt alle Produkte aus der DB.
 * Gibt leeres Array zurück wenn DB nicht erreichbar.
 */
export async function getProducts(): Promise<Product[]> {
  let adminProducts: AdminProducts = {};
  let kautionTiers: KautionTiers = DEFAULT_KAUTION_TIERS;
  const productsWithUnits = new Set<string>();
  let supabase: ReturnType<typeof createServiceClient>;

  try {
    supabase = createServiceClient();
    const { data } = await supabase
      .from('admin_config')
      .select('key, value')
      .in('key', ['products', 'kautionTiers']);

    if (data) {
      for (const row of data) {
        if (row.key === 'products' && row.value && typeof row.value === 'object') {
          adminProducts = row.value as Record<string, AdminProduct>;
        }
        if (row.key === 'kautionTiers' && row.value) {
          kautionTiers = row.value as unknown as KautionTiers;
        }
      }
    }
  } catch {
    return [];
  }

  // product_units prüfen: welches Produkt hat mindestens eine aktive Unit?
  // Ausgemusterte Units (status='retired') zählen nicht — sonst wäre die
  // Waitlist nutzlos, sobald alte Kameras verkauft werden.
  // Separater try/catch, damit Produkte trotzdem geladen werden wenn
  // product_units nicht erreichbar ist (z.B. Tabelle fehlt).
  try {
    const { data: unitRows } = await supabase
      .from('product_units')
      .select('product_id')
      .neq('status', 'retired');

    if (unitRows) {
      for (const row of unitRows) {
        if (row.product_id) productsWithUnits.add(row.product_id);
      }
    }
  } catch {
    // best-effort — hasUnits wird dann für alle Produkte `false` sein,
    // was den Waitlist-Modus aktiviert. Akzeptabler Fallback.
  }

  // AdminProducts → Product konvertieren
  const result: Product[] = Object.values(adminProducts).map((admin) =>
    adminToProduct(admin, undefined, kautionTiers, productsWithUnits.has(admin.id)),
  );

  return result;
}

/**
 * Einzelnes Produkt per Slug laden.
 */
export async function getProductBySlug(slug: string): Promise<Product | undefined> {
  const all = await getProducts();
  return all.find((p) => p.slug === slug);
}

/**
 * Einzelnes Produkt per ID laden.
 */
export async function getProductById(id: string): Promise<Product | undefined> {
  const all = await getProducts();
  return all.find((p) => p.id === id);
}
