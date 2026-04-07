import { NextRequest, NextResponse } from 'next/server';
import { getProducts } from '@/lib/get-products';
import { accessories } from '@/data/accessories';
import { RENTAL_SETS_STATIC } from '@/data/sets';

export async function GET(req: NextRequest) {
  const products = await getProducts();
  const q = req.nextUrl.searchParams.get('q')?.trim().toLowerCase();
  if (!q || q.length < 2) {
    return NextResponse.json({ kameras: [], zubehoer: [], sets: [] });
  }

  const terms = q.split(/\s+/);
  const matches = (text: string) =>
    terms.every((t) => text.toLowerCase().includes(t));

  // Search products
  const kameras = products
    .filter(
      (p) =>
        matches(p.name) ||
        matches(p.brand) ||
        matches(p.model) ||
        matches(p.description) ||
        matches(p.shortDescription) ||
        matches(p.category) ||
        p.tags.some((tag) => matches(tag))
    )
    .slice(0, 6)
    .map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      brand: p.brand,
      image: p.images[0],
      pricePerDay: p.pricePerDay,
      available: p.available,
    }));

  // Search accessories
  const zubehoer = accessories.filter(
    (a) => matches(a.name) || matches(a.description)
  )
    .slice(0, 4)
    .map((a) => ({
      id: a.id,
      name: a.name,
      description: a.description,
    }));

  // Search sets
  const sets = RENTAL_SETS_STATIC.filter(
    (s) =>
      matches(s.name) ||
      matches(s.description) ||
      s.includedItems.some((item) => matches(item))
  )
    .slice(0, 4)
    .map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
    }));

  return NextResponse.json({ kameras, zubehoer, sets });
}
