import { NextResponse } from 'next/server';
import { getAccessories } from '@/lib/get-accessories';

export async function GET() {
  const accessories = await getAccessories();
  return NextResponse.json(accessories, {
    headers: {
      'Cache-Control': 'public, max-age=0, s-maxage=0, stale-while-revalidate=60',
    },
  });
}
