import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { yearMonthKey } from '@/lib/seasonal-themes';
import type { SeasonalImagesData } from '@/lib/seasonal-themes';

/**
 * GET /api/seasonal-images?zone=hero
 * Liefert das saisonale Bild für den aktuellen Monat und die angegebene Zone.
 */
export async function GET(req: NextRequest) {
  const zone = req.nextUrl.searchParams.get('zone');
  if (!zone) {
    return NextResponse.json({ error: 'Zone erforderlich (z.B. hero, blog).' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data } = await supabase
    .from('admin_settings')
    .select('value')
    .eq('key', 'seasonal_images')
    .maybeSingle();

  if (!data?.value) {
    return NextResponse.json({ image: null });
  }

  let allImages: SeasonalImagesData;
  try {
    allImages = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
  } catch {
    return NextResponse.json({ image: null });
  }

  const now = new Date();
  const key = yearMonthKey(now.getFullYear(), now.getMonth() + 1);
  const zoneImages = allImages[zone];

  if (!zoneImages || !zoneImages[key]) {
    return NextResponse.json({ image: null });
  }

  return NextResponse.json({
    image: zoneImages[key],
    month: now.getMonth() + 1,
  });
}
