import { NextRequest, NextResponse } from 'next/server';
import { sendPushToCustomers } from '@/lib/customer-push';
import { logAudit } from '@/lib/audit';

export const runtime = 'nodejs';

/**
 * POST /api/admin/customer-push/send
 * Body: { title, body?, url?, topic? }
 * Verschickt eine Push-Notification an alle registrierten Endkunden-Geraete.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const title = String(body?.title ?? '').trim();
    const message = body?.body ? String(body.body).trim() : '';
    const url = body?.url ? String(body.url).trim() : '/';
    const topic = body?.topic ? String(body.topic).trim() : undefined;

    if (!title || title.length < 2) {
      return NextResponse.json({ error: 'Titel zu kurz.' }, { status: 400 });
    }
    if (title.length > 80) {
      return NextResponse.json({ error: 'Titel zu lang (max. 80 Zeichen).' }, { status: 400 });
    }

    await sendPushToCustomers(
      {
        title,
        body: message,
        url,
        tag: 'admin_announcement',
      },
      topic ? { topic } : undefined,
    );

    await logAudit({
      action: 'customer_push.send',
      entityType: 'customer_push',
      changes: { title, body: message, url, topic },
      request: req,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message || 'Fehler' },
      { status: 500 },
    );
  }
}
