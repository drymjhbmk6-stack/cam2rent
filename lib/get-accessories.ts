/**
 * Zentrale Zubehör-Liste: Nur aus DB.
 */
import { createServiceClient } from '@/lib/supabase';
import { type Accessory } from '@/data/accessories';

interface DbAccessory {
  id: string;
  name: string;
  category: string;
  description: string | null;
  pricing_mode: 'perDay' | 'flat';
  price: number;
  available_qty: number;
  available: boolean;
  image_url: string | null;
  sort_order: number;
  compatible_product_ids: string[];
  internal: boolean;
}

function dbToAccessory(db: DbAccessory): Accessory {
  return {
    id: db.id,
    name: db.name,
    description: db.description ?? '',
    pricingMode: db.pricing_mode,
    price: db.price,
    available: db.available,
    iconId: 'mount',
    group: db.category?.toLowerCase() ?? undefined,
    internal: db.internal ?? false,
  };
}

/** Nur buchbares Zubehoer (fuer Kunden sichtbar) */
export async function getAccessories(): Promise<Accessory[]> {
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('accessories')
      .select('*')
      .or('internal.is.null,internal.eq.false')
      .order('sort_order', { ascending: true });

    if (error || !data) return [];
    return data.map(dbToAccessory);
  } catch {
    return [];
  }
}

/** Alle Zubehoer inkl. internes (fuer Admin + Sets) */
export async function getAllAccessories(): Promise<Accessory[]> {
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('accessories')
      .select('*')
      .order('sort_order', { ascending: true });

    if (error || !data) return [];
    return data.map(dbToAccessory);
  } catch {
    return [];
  }
}
