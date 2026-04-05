import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { createAdminNotification } from '@/lib/admin-notifications';

/**
 * POST /api/admin/notifications/create
 * Erstellt eine neue Admin-Benachrichtigung.
 * Body: { type, title, message?, link? }
 *
 * Wird von anderen API-Routes oder Webhooks aufgerufen.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (!body.type || !body.title) {
      return NextResponse.json(
        { error: 'type und title sind erforderlich.' },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();

    await createAdminNotification(supabase, {
      type: body.type,
      title: body.title,
      message: body.message,
      link: body.link,
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: 'Fehler beim Erstellen der Benachrichtigung.' },
      { status: 500 }
    );
  }
}
