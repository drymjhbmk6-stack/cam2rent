import { createServiceClient } from '@/lib/supabase';
import { getProducts } from '@/lib/get-products';
import { getAccessories } from '@/lib/get-accessories';
import { getPriceForDays } from '@/data/products';
import { getAccessoryPrice } from '@/data/accessories';
import { DEFAULT_HAFTUNG, calcHaftungTieredPrice, type HaftungConfig } from '@/lib/price-config';
import { differenceInCalendarDays } from 'date-fns';
import type { ReservationItems } from '@/lib/reservation-holds';

/**
 * Warenkorb-Position (ohne `id` — die vergibt der Client frisch). Spiegelt die
 * CartItem-Form aus components/CartProvider.tsx, damit die Landing-Seite die
 * reservierten Items 1:1 in den Warenkorb legen kann.
 */
export interface ReservationCartItem {
  productId: string;
  productName: string;
  productSlug: string;
  rentalFrom: string;
  rentalTo: string;
  days: number;
  accessories: string[];
  accessoryItems: { accessory_id: string; qty: number }[];
  haftung: 'none' | 'standard' | 'premium';
  priceRental: number;
  priceAccessories: number;
  priceHaftung: number;
  subtotal: number;
  deposit: number;
  deliveryMode: 'versand' | 'abholung';
  shippingMethod: 'standard' | 'express';
}

async function loadHaftungConfig(): Promise<HaftungConfig> {
  try {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from('admin_settings')
      .select('value')
      .eq('key', 'haftung_config')
      .maybeSingle();
    if (data?.value) {
      const parsed = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
      return { ...DEFAULT_HAFTUNG, ...parsed };
    }
  } catch { /* Fallback */ }
  return DEFAULT_HAFTUNG;
}

function inclusiveDays(fromIso: string, toIso: string): number {
  const from = new Date(fromIso);
  const to = new Date(toIso);
  if (from.getTime() === to.getTime()) return 1;
  return Math.max(1, differenceInCalendarDays(to, from) + 1);
}

/**
 * Baut aus den reservierten Zeilen fertige Warenkorb-Positionen mit AKTUELLEN
 * Katalogpreisen. Die Preise sind Anzeigewerte — der Checkout rechnet ohnehin
 * serverseitig autoritativ nach. Eine Zeile = eine Kamera-Position; die
 * Kamera-Menge (line.qty) ist reine Hold-Information und wird hier als 1
 * behandelt (der Kunde kann im Warenkorb weitere Positionen ergaenzen).
 */
export async function buildCartItemsFromReservation(
  reservation: {
    rentalFrom: string;
    rentalTo: string;
    deliveryMode: 'versand' | 'abholung';
    shippingMethod: 'standard' | 'express';
    items: ReservationItems;
  },
): Promise<ReservationCartItem[]> {
  const [products, accessories, haftungConfig] = await Promise.all([
    getProducts(),
    getAccessories(),
    loadHaftungConfig(),
  ]);
  const productById = new Map(products.map((p) => [p.id, p]));
  const accById = new Map(accessories.map((a) => [a.id, a]));

  const days = inclusiveDays(reservation.rentalFrom, reservation.rentalTo);
  const out: ReservationCartItem[] = [];

  for (const line of reservation.items.lines) {
    const product = productById.get(line.productId);
    if (!product) continue; // Kamera existiert nicht mehr → Zeile ueberspringen

    const priceRental = getPriceForDays(product, days);

    // Zubehoer-Preise + qty-Liste.
    const accessoryItems: { accessory_id: string; qty: number }[] = [];
    const accessoryIds: string[] = [];
    let priceAccessories = 0;
    for (const a of line.accessories) {
      const acc = accById.get(a.accessory_id);
      const qty = Math.max(1, a.qty);
      accessoryItems.push({ accessory_id: a.accessory_id, qty });
      accessoryIds.push(a.accessory_id);
      if (acc) priceAccessories += getAccessoryPrice(acc, days) * qty;
    }

    // Haftungsschutz-Preis (gestaffelt).
    const haftung = line.haftung ?? 'none';
    let priceHaftung = 0;
    if (haftung === 'standard') {
      priceHaftung = calcHaftungTieredPrice(haftungConfig.standard, haftungConfig.standardIncrement, days);
    } else if (haftung === 'premium') {
      priceHaftung = calcHaftungTieredPrice(haftungConfig.premium, haftungConfig.premiumIncrement, days);
    }

    out.push({
      productId: product.id,
      productName: product.name,
      productSlug: product.slug,
      rentalFrom: reservation.rentalFrom,
      rentalTo: reservation.rentalTo,
      days,
      accessories: accessoryIds,
      accessoryItems,
      haftung,
      priceRental,
      priceAccessories,
      priceHaftung,
      subtotal: priceRental + priceAccessories + priceHaftung,
      deposit: product.deposit,
      deliveryMode: reservation.deliveryMode,
      shippingMethod: reservation.shippingMethod,
    });
  }

  return out;
}
