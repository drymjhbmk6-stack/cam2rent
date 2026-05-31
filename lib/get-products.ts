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

  // ── ECHTEN Lagerbestand pro Produkt LIVE zaehlen ──────────────────────────
  // KRITISCH: Der gespeicherte `admin.stock`-Wert in admin_config.products ist
  // nur ein Cache und kann veralten (z.B. stand bei der Insta360 X5 dauerhaft
  // auf 3, obwohl real nur 1 Exemplar existiert → Kalender erlaubte 3 parallele
  // Buchungen → Ueberbuchung). Deshalb wird `stock` hier IMMER aus den echten
  // physischen Einheiten abgeleitet, damit die Verfuegbarkeit nie mehr Kameras
  // anbieten kann, als es gibt.
  //
  // Quelle der Wahrheit ist die neue Welt (inventar_units). Nur wenn ein Produkt
  // dort GAR NICHT existiert, faellt die Zaehlung auf die alte Welt
  // (product_units) zurueck — und erst wenn auch dort nichts ist, bleibt der
  // Config-Wert als letzter Fallback (Pre-Inventory-Altbestand). Die beiden
  // Welten werden NICHT summiert (Mirror wuerde sonst doppelt zaehlen).
  const newWorldCount = new Map<string, number>(); // legacyId → aktive inventar_units
  const oldWorldCount = new Map<string, number>(); // legacyId → aktive product_units

  // 1) Neue Welt: migration_audit liefert legacy-id → produkte.id, dann
  //    inventar_units gegen aktive Stuecke abfragen.
  try {
    const { data: auditRows } = await supabase
      .from('migration_audit')
      .select('alte_id, neue_id')
      .eq('alte_tabelle', 'admin_config.products')
      .eq('neue_tabelle', 'produkte');

    const produktIdToLegacy = new Map<string, string>();
    for (const row of (auditRows ?? []) as Array<{ alte_id: string; neue_id: string }>) {
      if (row.alte_id && row.neue_id) produktIdToLegacy.set(row.neue_id, row.alte_id);
    }

    if (produktIdToLegacy.size > 0) {
      const { data: invRows } = await supabase
        .from('inventar_units')
        .select('produkt_id, tracking_mode, bestand')
        .eq('typ', 'kamera')
        .neq('status', 'ausgemustert');

      for (const row of (invRows ?? []) as Array<{ produkt_id: string | null; tracking_mode?: string | null; bestand?: number | null }>) {
        if (!row.produkt_id) continue;
        const legacyId = produktIdToLegacy.get(row.produkt_id);
        if (!legacyId) continue;
        // Kameras sind normalerweise individual-getrackt (1 Zeile = 1 Stueck);
        // Bulk-Bestand defensiv ueber `bestand` aufsummieren.
        const n = row.tracking_mode === 'bulk' ? Math.max(0, row.bestand ?? 0) : 1;
        newWorldCount.set(legacyId, (newWorldCount.get(legacyId) ?? 0) + n);
      }
    }
  } catch {
    // migration_audit oder inventar_units fehlen — okay, Fallback unten greift.
  }

  // 2) Alte Welt: product_units. Fuer Pre-Migration und Produkte ohne
  //    migration_audit-Eintrag.
  try {
    const { data: unitRows } = await supabase
      .from('product_units')
      .select('product_id')
      .neq('status', 'retired');

    if (unitRows) {
      for (const row of unitRows) {
        if (row.product_id) {
          oldWorldCount.set(row.product_id, (oldWorldCount.get(row.product_id) ?? 0) + 1);
        }
      }
    }
  } catch {
    // best-effort — Fallback auf Config-Stock.
  }

  // Effektiven Bestand pro Produkt bestimmen (neue Welt hat Vorrang, kein
  // Summieren). productsWithUnits steuert weiterhin `hasUnits` (Waitlist-UI).
  const resolvedStock = new Map<string, number>();
  for (const [id, n] of newWorldCount) {
    resolvedStock.set(id, n);
    if (n > 0) productsWithUnits.add(id);
  }
  for (const [id, n] of oldWorldCount) {
    if (!resolvedStock.has(id)) {
      resolvedStock.set(id, n);
      if (n > 0) productsWithUnits.add(id);
    }
  }

  // AdminProducts → Product konvertieren. `stock` aus echter Zaehlung, sonst
  // Config-Wert (nur fuer Produkte ohne jegliche Einheiten-Erfassung).
  const result: Product[] = Object.values(adminProducts).map((admin) => {
    const liveStock = resolvedStock.has(admin.id) ? resolvedStock.get(admin.id)! : admin.stock;
    return adminToProduct(
      { ...admin, stock: liveStock },
      undefined,
      kautionTiers,
      productsWithUnits.has(admin.id),
    );
  });

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
