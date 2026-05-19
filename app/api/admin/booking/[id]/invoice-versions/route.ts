import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import { logAudit } from '@/lib/audit';
import { sendInvoiceAdjustment } from '@/lib/email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function migrationMissing(msg: string | undefined): boolean {
  return /invoice_versions|relation .* does not exist|42P01|PGRST205|schema cache/i.test(msg || '');
}

// Liste aller Rechnungsversionen + frische Signed-URLs (Re-Download).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }
  const { id } = await params;
  const supabase = createServiceClient();

  const { data: rows, error } = await supabase
    .from('invoice_versions')
    .select('id, version_number, is_current, gross_amount, reason, trigger_source, pdf_path, created_at, sent_to_customer_at, sent_to_email')
    .eq('booking_id', id)
    .order('version_number', { ascending: true });

  if (error) {
    if (migrationMissing(error.message)) {
      return NextResponse.json({ versions: [], migrationPending: true });
    }
    console.error('[invoice-versions] list error:', error);
    return NextResponse.json({ error: 'Laden fehlgeschlagen.' }, { status: 500 });
  }

  const versions = await Promise.all((rows ?? []).map(async (r) => {
    let url: string | null = null;
    if (r.pdf_path) {
      const { data: signed } = await supabase.storage
        .from('contracts')
        .createSignedUrl(r.pdf_path as string, 60 * 10);
      url = signed?.signedUrl ?? null;
    }
    return {
      id: r.id,
      version: r.version_number,
      isCurrent: r.is_current,
      gross: r.gross_amount,
      reason: r.reason,
      triggerSource: r.trigger_source,
      createdAt: r.created_at,
      sentAt: r.sent_to_customer_at,
      sentTo: r.sent_to_email,
      pdfUrl: url,
    };
  }));

  return NextResponse.json({ versions });
}

// Aktuelle (oder angegebene) Fassung an den Kunden senden.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const versionId: string | undefined = body?.versionId;
  const supabase = createServiceClient();

  const { data: booking } = await supabase
    .from('bookings')
    .select('id, customer_name, customer_email')
    .eq('id', id)
    .maybeSingle();
  if (!booking) {
    return NextResponse.json({ error: 'Buchung nicht gefunden.' }, { status: 404 });
  }
  if (!booking.customer_email) {
    return NextResponse.json({ error: 'Keine E-Mail-Adresse beim Kunden hinterlegt.' }, { status: 400 });
  }

  let q = supabase
    .from('invoice_versions')
    .select('id, version_number, reason, pdf_path')
    .eq('booking_id', id);
  q = versionId ? q.eq('id', versionId) : q.eq('is_current', true);
  const { data: ver, error: verErr } = await q.maybeSingle();

  if (verErr && migrationMissing(verErr.message)) {
    return NextResponse.json(
      { error: 'Rechnungs-Archiv noch nicht bereit — DB-Migration steht aus.' },
      { status: 503 },
    );
  }
  if (!ver) {
    return NextResponse.json({ error: 'Keine Rechnungsversion gefunden.' }, { status: 404 });
  }
  if (!ver.pdf_path) {
    return NextResponse.json({ error: 'Für diese Fassung liegt kein PDF vor.' }, { status: 409 });
  }

  const { data: file, error: dlErr } = await supabase.storage
    .from('contracts')
    .download(ver.pdf_path as string);
  if (dlErr || !file) {
    return NextResponse.json({ error: 'PDF konnte nicht geladen werden.' }, { status: 500 });
  }
  const pdfBuffer = Buffer.from(await file.arrayBuffer());

  try {
    await sendInvoiceAdjustment({
      bookingId: booking.id as string,
      customerName: (booking.customer_name as string) || '',
      customerEmail: booking.customer_email as string,
      version: ver.version_number as number,
      reason: (ver.reason as string) || undefined,
      pdfBuffer,
    });
  } catch (mailErr) {
    console.error('[invoice-versions] E-Mail-Versand fehlgeschlagen:', mailErr);
    return NextResponse.json({
      success: false,
      error: 'PDF liegt bereit, E-Mail fehlgeschlagen — bitte erneut versuchen.',
    }, { status: 200 });
  }

  await supabase
    .from('invoice_versions')
    .update({
      sent_to_customer_at: new Date().toISOString(),
      sent_to_email: booking.customer_email,
    })
    .eq('id', ver.id);

  await logAudit({
    action: 'booking.invoice_send',
    entityType: 'booking',
    entityId: booking.id as string,
    changes: { version: ver.version_number, sent_to: booking.customer_email },
    request: req,
  }).catch(() => { /* best-effort */ });

  return NextResponse.json({ success: true, sentTo: booking.customer_email, version: ver.version_number });
}
