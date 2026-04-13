import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import type { SeasonalImagesData } from '@/lib/seasonal-themes';

/**
 * GET /api/admin/seasonal-images
 * Laedt alle saisonalen Bilder.
 */
export async function GET() {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('admin_settings')
    .select('value')
    .eq('key', 'seasonal_images')
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let images: SeasonalImagesData = {};
  if (data?.value) {
    try {
      images = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
    } catch {
      images = {};
    }
  }

  return NextResponse.json({ images });
}

/**
 * POST /api/admin/seasonal-images
 * Speichert ein saisonales Bild für eine Zone und einen Monat.
 * Body: { zone, yearMonth, image } oder { zone, yearMonth, remove: true }
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { zone, yearMonth, image, remove } = body;

  if (!zone || !yearMonth) {
    return NextResponse.json({ error: 'Zone und yearMonth erforderlich.' }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Aktuelle Daten laden
  const { data } = await supabase
    .from('admin_settings')
    .select('value')
    .eq('key', 'seasonal_images')
    .maybeSingle();

  let images: SeasonalImagesData = {};
  if (data?.value) {
    try {
      images = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
    } catch {
      images = {};
    }
  }

  if (remove) {
    if (images[zone]) {
      delete images[zone][yearMonth];
    }
  } else {
    if (!image) {
      return NextResponse.json({ error: 'Bild-Daten erforderlich.' }, { status: 400 });
    }
    if (!images[zone]) {
      images[zone] = {};
    }
    images[zone][yearMonth] = image;
  }

  // Speichern
  const { error } = await supabase
    .from('admin_settings')
    .upsert({
      key: 'seasonal_images',
      value: JSON.stringify(images),
      updated_at: new Date().toISOString(),
    });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, images });
}
