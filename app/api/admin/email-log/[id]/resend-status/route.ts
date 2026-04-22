import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';

/**
 * GET /api/admin/email-log/[id]/resend-status
 *
 * Holt den tatsaechlichen Zustellstatus direkt von Resend.
 * Unser eigener email_log.status sagt nur aus, ob die API den Call
 * akzeptiert hat — die wahre Information (delivered / bounced /
 * complained / delivery_delayed / clicked) lebt bei Resend.
 *
 * Response:
 *   {
 *     last_event: "delivered" | "bounced" | ...,
 *     created_at: ISO,
 *     to: string[],
 *     subject: string,
 *     bounce?: { message, subType, type },  // falls bounced
 *   }
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }

  const { id } = await params;
  const supabase = createServiceClient();

  const { data: logEntry } = await supabase
    .from('email_log')
    .select('resend_message_id')
    .eq('id', id)
    .maybeSingle();

  if (!logEntry?.resend_message_id) {
    return NextResponse.json(
      { error: 'Keine Resend-Message-ID hinterlegt — E-Mail wurde nicht via Resend versendet oder der Versand ist fehlgeschlagen.' },
      { status: 404 },
    );
  }

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: 'RESEND_API_KEY nicht konfiguriert.' }, { status: 500 });
  }

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    // Resend SDK expose only .emails.get() — liefert den aktuellen Event-Status
    const res = await resend.emails.get(logEntry.resend_message_id);
    if (res.error) {
      return NextResponse.json({ error: res.error.message || 'Resend-API-Fehler' }, { status: 502 });
    }
    const data = res.data as unknown as Record<string, unknown> | null;
    if (!data) {
      return NextResponse.json({ error: 'Keine Antwort von Resend.' }, { status: 502 });
    }
    return NextResponse.json({
      last_event: data.last_event ?? null,
      created_at: data.created_at ?? null,
      to: data.to ?? null,
      subject: data.subject ?? null,
      bounce: data.bounce ?? null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Resend-Fehler: ${msg}` }, { status: 502 });
  }
}
