import { NextRequest, NextResponse } from 'next/server';
import { sendPushToCustomers } from '@/lib/customer-push';
import { logAudit } from '@/lib/audit';
import { getCurrentAdminUser } from '@/lib/admin-auth';

export const runtime = 'nodejs';

/**
 * Prueft, ob die URL fuer Endkunden-Pushes erlaubt ist.
 * Erlaubt sind:
 *  - relative Pfade (`/`, `/kameras/...`)
 *  - absolute URLs auf cam2rent.de (oder Subdomains)
 *
 * Externe Hosts werden geblockt, damit Mitarbeiter (oder gehackte Accounts)
 * keine Phishing-Pushes mit cam2rent-Branding rausjagen koennen.
 */
function isAllowedPushUrl(url: string): boolean {
  if (!url) return false;
  if (url.startsWith('/')) return !url.startsWith('//');
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return false;
    const host = u.hostname.toLowerCase();
    return host === 'cam2rent.de' || host.endsWith('.cam2rent.de');
  } catch {
    return false;
  }
}

/**
 * POST /api/admin/customer-push/send
 * Body: { title, body?, url?, topic? }
 * Verschickt eine Push-Notification an alle registrierten Endkunden-Geraete.
 *
 * Owner-only (Sweep 7 Vuln 3): Massenversand an alle Endkunden mit
 * cam2rent-Branding ist eine Phishing-Waffe, wenn sie an Mitarbeiter
 * delegiert wird. Plus URL-Allowlist als Defense-in-Depth.
 */
export async function POST(req: NextRequest) {
  try {
    const me = await getCurrentAdminUser();
    if (!me || me.role !== 'owner') {
      return NextResponse.json(
        { error: 'Nur Owner dürfen Endkunden-Pushes verschicken.' },
        { status: 403 },
      );
    }

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
    if (!isAllowedPushUrl(url)) {
      return NextResponse.json(
        { error: 'URL muss relativ (z.B. /kameras) oder auf cam2rent.de sein.' },
        { status: 400 },
      );
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
