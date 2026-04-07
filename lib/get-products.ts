/**
 * Zentrale Produktliste: DB-first, statischer Fallback.
 * Wird von API-Routen und Server-Komponenten genutzt.
 */
import { createServiceClient } from '@/lib/supabase';
import { products as staticProducts, type Product } from '@/data/products';
import {
  DEFAULT_ADMIN_PRODUCTS,
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
  };
}

/**
 * Lädt alle Produkte: zuerst aus der DB, dann statische Fallbacks.
 * DB-Produkte überschreiben statische mit gleicher ID.
 * Neue DB-Produkte (ohne statisches Gegenstück) werden vollständig aus DB erstellt.
 */
export async function getProducts(): Promise<Product[]> {
  let adminProducts: AdminProducts = DEFAULT_ADMIN_PRODUCTS;
  let kautionTiers: KautionTiers = DEFAULT_KAUTION_TIERS;

  try {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from('admin_config')
      .select('key, value')
      .in('key', ['products', 'kautionTiers']);

    if (data) {
      for (const row of data) {
        if (row.key === 'products' && row.value && typeof row.value === 'object') {
          const val = row.value as Record<string, AdminProduct>;
          if (Object.keys(val).length > 0) adminProducts = val;
        }
        if (row.key === 'kautionTiers' && row.value) {
          kautionTiers = row.value as unknown as KautionTiers;
        }
      }
    }
  } catch {
    // DB nicht erreichbar → Fallback
  }

  // Statische Produkte als Lookup
  const staticMap = new Map(staticProducts.map((p) => [p.id, p]));

  // AdminProducts → Product konvertieren
  const result: Product[] = Object.values(adminProducts).map((admin) =>
    adminToProduct(admin, staticMap.get(admin.id), kautionTiers),
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
