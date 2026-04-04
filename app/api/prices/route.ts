import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import {
  DEFAULT_SHIPPING,
  DEFAULT_HAFTUNG,
  DEFAULT_PRODUCT_PRICES,
  DEFAULT_DURATION_DISCOUNTS,
  DEFAULT_LOYALTY_DISCOUNTS,
  DEFAULT_PRODUCT_DISCOUNTS,
  type PriceConfig,
  type DurationDiscount,
  type LoyaltyDiscount,
  type ProductDiscount,
} from '@/lib/price-config';

interface PriceConfigExtended extends PriceConfig {
  durationDiscounts: DurationDiscount[];
  loyaltyDiscounts: LoyaltyDiscount[];
  productDiscounts: ProductDiscount[];
}

/**
 * GET /api/prices
 *
 * Gibt die aktuellen Preise zurück (aus Supabase admin_config).
 * Fällt auf Standardwerte zurück, wenn die Tabelle noch nicht existiert.
 * Wird vom Buchungsflow (buchen/page.tsx, checkout/page.tsx) genutzt.
 */
export async function GET() {
  try {
    const supabase = createServiceClient();

    const { data, error } = await supabase
      .from('admin_config')
      .select('key, value')
      .in('key', ['shipping', 'haftung', 'product_prices', 'duration_discounts', 'loyalty_discounts', 'product_discounts']);

    if (error || !data) {
      return NextResponse.json(defaultConfig());
    }

    const map = Object.fromEntries(data.map((r) => [r.key, r.value]));

    const config: PriceConfigExtended = {
      shipping: map.shipping ?? DEFAULT_SHIPPING,
      haftung: map.haftung ?? DEFAULT_HAFTUNG,
      products: map.product_prices ?? DEFAULT_PRODUCT_PRICES,
      durationDiscounts: map.duration_discounts ?? DEFAULT_DURATION_DISCOUNTS,
      loyaltyDiscounts: map.loyalty_discounts ?? DEFAULT_LOYALTY_DISCOUNTS,
      productDiscounts: map.product_discounts ?? DEFAULT_PRODUCT_DISCOUNTS,
    };

    return NextResponse.json(config, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    return NextResponse.json(defaultConfig());
  }
}

function defaultConfig(): PriceConfigExtended {
  return {
    shipping: DEFAULT_SHIPPING,
    haftung: DEFAULT_HAFTUNG,
    products: DEFAULT_PRODUCT_PRICES,
    durationDiscounts: DEFAULT_DURATION_DISCOUNTS,
    loyaltyDiscounts: DEFAULT_LOYALTY_DISCOUNTS,
    productDiscounts: DEFAULT_PRODUCT_DISCOUNTS,
  };
}
