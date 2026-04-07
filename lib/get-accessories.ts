/**
 * Zentrale Zubehör-Liste: DB-first, statischer Fallback.
 */
import { createServiceClient } from '@/lib/supabase';
import { accessories as staticAccessories, type Accessory } from '@/data/accessories';

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
  };
}

export async function getAccessories(): Promise<Accessory[]> {
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('accessories')
      .select('*')
      .order('sort_order', { ascending: true });

    if (error || !data || data.length === 0) {
      return staticAccessories;
    }

    return data.map(dbToAccessory);
  } catch {
    return staticAccessories;
  }
}
