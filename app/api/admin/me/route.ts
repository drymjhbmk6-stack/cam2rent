import { NextResponse } from 'next/server';
import { getCurrentAdminUser } from '@/lib/admin-auth';

export const runtime = 'nodejs';

/**
 * GET /api/admin/me
 * Liefert den aktuell eingeloggten Admin-User (ohne Passwort-Hash).
 * Wird vom Client z.B. fuer Sidebar-Filter + Feature-Gates genutzt.
 */
export async function GET() {
  const user = await getCurrentAdminUser();
  if (!user) {
    return NextResponse.json({ error: 'Nicht angemeldet.' }, { status: 401 });
  }
  return NextResponse.json({ user });
}
