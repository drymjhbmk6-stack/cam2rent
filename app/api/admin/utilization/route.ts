import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import { computeCameraUtilization } from '@/lib/camera-utilization';

/**
 * GET /api/admin/utilization?days=30
 * Gibt Auslastungsdaten für alle Kameras zurück.
 */
export async function GET(req: NextRequest) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }

  try {
    const supabase = createServiceClient();
    const daysParam = req.nextUrl.searchParams.get('days');
    const days = [30, 90, 365].includes(Number(daysParam)) ? Number(daysParam) : 30;

    const products = await computeCameraUtilization(supabase, days);
    return NextResponse.json({ products });
  } catch (err) {
    console.error('GET /api/admin/utilization error:', err);
    return NextResponse.json(
      { error: 'Auslastungsdaten konnten nicht geladen werden.' },
      { status: 500 }
    );
  }
}
