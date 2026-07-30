import { NextRequest, NextResponse } from 'next/server';
import { loadCustomerUgc } from '@/lib/admin/load-customer-ugc';

export const runtime = 'nodejs';

/**
 * GET /api/admin/customer-ugc?status=pending
 * Liste aller UGC-Einreichungen mit optionalem Status-Filter.
 * Auth: Admin-Middleware.
 */
export async function GET(req: NextRequest) {
  // Kernlogik in lib/admin/load-customer-ugc.ts — geteilt mit der
  // server-gerenderten /admin/kunden-material-Page.
  const status = req.nextUrl.searchParams.get('status');
  const limit = Number(req.nextUrl.searchParams.get('limit') ?? 100);
  const { entries, counts, error } = await loadCustomerUgc({ status, limit });
  if (error) {
    return NextResponse.json({ error }, { status: 500 });
  }
  return NextResponse.json({ entries, counts });
}
