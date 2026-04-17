import { NextResponse } from 'next/server';
import { checkAdminAuth } from '@/lib/admin-auth';
import { EMAIL_TEMPLATE_CATALOG } from '@/lib/email-previews';

/**
 * GET /api/admin/email-templates
 * Liefert die Liste aller E-Mail-Vorlagen mit Metadaten (ohne HTML).
 */
export async function GET() {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }

  const templates = EMAIL_TEMPLATE_CATALOG.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    recipient: t.recipient,
  }));

  return NextResponse.json({ templates });
}
