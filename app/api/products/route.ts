import { NextResponse } from 'next/server';
import { getProducts } from '@/lib/get-products';

export async function GET() {
  const products = await getProducts();
  return NextResponse.json(products, {
    headers: {
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
    },
  });
}
