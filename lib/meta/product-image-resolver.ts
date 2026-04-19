/**
 * Matched einen Social-Post-Text (topic + angle + keywords) auf ein konkretes
 * Shop-Produkt und liefert dessen Produktbild zurueck — damit die Bild-KI
 * nicht eigene, oft altmodische Kamera-Modelle erfindet, sondern das echte
 * Produkt als Referenz bekommt (gpt-image-1) oder direkt als Post-Bild
 * verwendet wird.
 */

import { getProducts } from '@/lib/get-products';
import type { Product } from '@/data/products';

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Score, wie gut ein Text zu einem Produkt passt.
 * Nur Modell-/Fullname-Matches zaehlen — reine Marken-Treffer ("GoPro") sind
 * zu unscharf und wuerden zufaellige Kameras ausspielen.
 */
function scoreProduct(normText: string, p: Product): number {
  const fullName = normalize(`${p.brand} ${p.model ?? p.name}`);
  const model = normalize(p.model ?? p.name.replace(p.brand, ''));
  const slug = normalize(p.slug ?? '');
  const rawName = normalize(p.name);

  let score = 0;
  if (fullName && normText.includes(fullName)) score += 20;
  if (rawName && normText.includes(rawName)) score += 15;
  if (model && model.length >= 3 && normText.includes(model)) score += 10;
  if (slug && slug.length >= 4 && normText.includes(slug.replace(/-/g, ' '))) score += 8;

  // Teil-Matches auf Modell-Tokens (z.B. "osmo action" ohne "5 pro")
  if (model) {
    const tokens = model.split(' ').filter((t) => t.length >= 3);
    if (tokens.length >= 2) {
      const hits = tokens.filter((t) => normText.includes(t)).length;
      if (hits === tokens.length) score += 6;
      else if (hits >= tokens.length - 1) score += 3;
    }
  }

  return score;
}

export interface ProductImageMatch {
  productId: string;
  productName: string;
  brand: string;
  imageUrls: string[]; // erste 3 Bilder, als Referenz fuer gpt-image-1
}

/**
 * Findet das am besten passende Produkt zum Text.
 * Threshold: >= 10 (Modell-Match oder besser). Reine Marken-Erwaehnung
 * matcht NICHT, weil das sonst zufaellige Kameras auswuerfe.
 */
export async function resolveProductForPost(
  text: string,
  products?: Product[]
): Promise<ProductImageMatch | null> {
  const list = products ?? (await getProducts());
  if (list.length === 0) return null;

  const normText = normalize(text);
  if (!normText) return null;

  let best: { product: Product; score: number } | null = null;
  for (const p of list) {
    const score = scoreProduct(normText, p);
    if (score > 0 && (!best || score > best.score)) {
      best = { product: p, score };
    }
  }

  if (!best || best.score < 10) return null;

  const imageUrls = (best.product.images ?? []).filter(Boolean).slice(0, 3);
  if (imageUrls.length === 0) return null;

  return {
    productId: best.product.id,
    productName: best.product.name,
    brand: best.product.brand,
    imageUrls,
  };
}

/**
 * Beschreibt eine "moderne" Action-Cam in Worten — wird an DALL-E 3 Prompts
 * angehaengt, wenn KEIN konkretes Produkt zugeordnet werden konnte. Hilft
 * dagegen, dass DALL-E eine sperrige Kompaktkamera aus 2005 rendert.
 */
export function modernCameraHint(): string {
  return 'If an action camera is visible, it must look like a modern 2024-era action cam (small cube shape, ~60mm, single lens in front, matte black body) — like GoPro Hero 12 Black, DJI Osmo Action 5 Pro, or a modern Insta360. NEVER a retro camcorder, NEVER a bulky old point-and-shoot, NEVER a DSLR.';
}
