import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

/**
 * GET /api/home-reviews
 * Gibt die neuesten genehmigten Reviews über alle Produkte zurück (für die Startseite).
 */
export async function GET() {
  try {
    const supabase = createServiceClient();

    const { data: reviews, error } = await supabase
      .from('reviews')
      .select('id, product_id, rating, title, text, created_at')
      .eq('approved', true)
      .order('created_at', { ascending: false })
      .limit(12);

    if (error) {
      return NextResponse.json({ reviews: [] });
    }

    return NextResponse.json({ reviews: reviews ?? [] });
  } catch {
    return NextResponse.json({ reviews: [] });
  }
}
