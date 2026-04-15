import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }

  const { id } = await params;
  const supabase = createServiceClient();

  const { data: invoice } = await supabase
    .from('invoices')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (!invoice) {
    return NextResponse.json({ error: 'Rechnung nicht gefunden.' }, { status: 404 });
  }

  if (!invoice.sent_to_email) {
    return NextResponse.json({ error: 'Keine E-Mail-Adresse hinterlegt.' }, { status: 400 });
  }

  if (!invoice.pdf_url) {
    return NextResponse.json({ error: 'Kein PDF vorhanden.' }, { status: 400 });
  }

  // E-Mail über Resend versenden
  try {
    const { Resend } = await import('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);

    // PDF herunterladen
    const pdfRes = await fetch(invoice.pdf_url);
    if (!pdfRes.ok) {
      return NextResponse.json({ error: 'PDF konnte nicht geladen werden.' }, { status: 500 });
    }
    const pdfBuffer = Buffer.from(await pdfRes.arrayBuffer());

    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'buchung@cam2rent.de',
      to: invoice.sent_to_email,
      subject: `Rechnung ${invoice.invoice_number} — cam2rent`,
      html: `<p>Hallo,</p><p>anbei findest du deine Rechnung ${invoice.invoice_number}.</p><p>Viele Grüße,<br/>cam2rent</p>`,
      attachments: [
        {
          filename: `${invoice.invoice_number}.pdf`,
          content: pdfBuffer,
        },
      ],
    });

    // sent_at aktualisieren
    await supabase
      .from('invoices')
      .update({ sent_at: new Date().toISOString() })
      .eq('id', id);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Resend Fehler:', err);
    return NextResponse.json({ error: 'E-Mail-Versand fehlgeschlagen.' }, { status: 500 });
  }
}
