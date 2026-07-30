import { NextRequest, NextResponse } from 'next/server';
import { loadAlleBuchungen } from '@/lib/admin/load-alle-buchungen';

/**
 * GET /api/admin/alle-buchungen
 * Query params:
 *   status: 'confirmed' | 'shipped' | 'completed' | 'cancelled' | 'all' (default: all)
 *   limit: number (default: 100)
 *
 * Gibt alle Buchungen zurück, sortiert nach Erstellungsdatum (neueste zuerst).
 * Kernlogik in `lib/admin/load-alle-buchungen.ts` — geteilt mit der
 * server-gerenderten /admin/buchungen-Page.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const status = searchParams.get('status') ?? 'all';
  const limit = parseInt(searchParams.get('limit') ?? '100', 10);

  const { bookings, error } = await loadAlleBuchungen({ status, limit });
  if (error) {
    return NextResponse.json({ error }, { status: 500 });
  }
  return NextResponse.json({ bookings });
}
