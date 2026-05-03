import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { createAdminNotification } from '@/lib/admin-notifications';
import { getCurrentAdminUser } from '@/lib/admin-auth';

/**
 * POST /api/admin/notifications/create
 * Erstellt eine neue Admin-Benachrichtigung.
 * Body: { type, title, message?, link? }
 *
 * NUR Owner-Login — Mitarbeiter mit z.B. content-Permission koennen damit
 * sonst dem Owner gefaelschte payment_failed-Pushes mit Phishing-Links
 * zustellen.
 */
const ALLOWED_TYPES = new Set([
  'new_booking', 'booking_cancelled', 'new_damage', 'new_message', 'new_customer',
  'overdue_return', 'new_review', 'payment_failed', 'new_waitlist', 'blog_ready',
  'social_ready', 'reel_ready', 'new_ugc', 'coupon_race',
]);

export async function POST(req: NextRequest) {
  try {
    const me = await getCurrentAdminUser();
    if (!me || me.role !== 'owner') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();

    if (!body.type || !body.title) {
      return NextResponse.json(
        { error: 'type und title sind erforderlich.' },
        { status: 400 }
      );
    }

    // Nur bekannte Typen — verhindert beliebige Routing-Werte ueber TYPE_TO_PERMISSION.
    if (!ALLOWED_TYPES.has(body.type)) {
      return NextResponse.json({ error: 'Unbekannter Typ.' }, { status: 400 });
    }

    const supabase = createServiceClient();

    await createAdminNotification(supabase, {
      type: body.type,
      title: String(body.title).slice(0, 200),
      message: body.message ? String(body.message).slice(0, 500) : undefined,
      link: body.link ? String(body.link).slice(0, 500) : undefined,
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: 'Fehler beim Erstellen der Benachrichtigung.' },
      { status: 500 }
    );
  }
}
