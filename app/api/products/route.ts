import { NextResponse } from 'next/server';
import { getProducts } from '@/lib/get-products';

export async function GET() {
  const products = await getProducts();
  return NextResponse.json(products, {
    headers: {
      'Cache-Control': 'public, max-age=10, s-maxage=30, stale-while-revalidate=60',
    },
  });
}
