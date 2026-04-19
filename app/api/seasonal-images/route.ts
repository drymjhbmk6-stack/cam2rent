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

  // Monat in Berlin-Zeit — sonst kippt der Monatswechsel zwischen 22-24 Uhr
  // auf UTC-Servern einen Tag zu spaet (Dezember ist noch Dezember in Berlin,
  // aber schon Januar in UTC... oder andersrum).
  const berlinIso = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
  const [yStr, mStr] = berlinIso.split('-');
  const year = parseInt(yStr, 10);
  const month = parseInt(mStr, 10);
  const key = yearMonthKey(year, month);
  const zoneImages = allImages[zone];

  if (!zoneImages || !zoneImages[key]) {
    return NextResponse.json({ image: null });
  }

  return NextResponse.json({
    image: zoneImages[key],
    month,
  });
}
