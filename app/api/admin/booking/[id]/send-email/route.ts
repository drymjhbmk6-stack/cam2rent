import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import { BUSINESS } from '@/lib/business-config';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();
  const { to, attachRechnung, attachVertrag } = body;

  if (!to) {
    return NextResponse.json({ error: 'Empfänger-E-Mail fehlt.' }, { status: 400 });
  }

  if (!attachRechnung && !attachVertrag) {
    return NextResponse.json({ error: 'Mindestens ein Dokument auswählen.' }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Buchung laden
  const { data: booking } = await supabase
    .from('bookings')
    .select('id, product_name, customer_name, rental_from, rental_to, price_total, contract_signed')
    .eq('id', id)
    .maybeSingle();

  if (!booking) {
    return NextResponse.json({ error: 'Buchung nicht gefunden.' }, { status: 404 });
  }

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: 'Resend API-Key nicht konfiguriert.' }, { status: 500 });
  }

  try {
    const { Resend } = await import('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);

    const attachments: Array<{ filename: string; content: Buffer }> = [];

    // Rechnung PDF generieren
    if (attachRechnung) {
      const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
      const invoiceRes = await fetch(`${baseUrl}/api/invoice/${id}`, {
        headers: { cookie: req.headers.get('cookie') || '' },
      });
      if (invoiceRes.ok) {
        const pdfBuffer = Buffer.from(await invoiceRes.arrayBuffer());
        attachments.push({ filename: `Rechnung-${id}.pdf`, content: pdfBuffer });
      }
    }

    // Mietvertrag PDF
    if (attachVertrag && booking.contract_signed) {
      const { data: agreement } = await supabase
        .from('rental_agreements')
        .select('pdf_url')
        .eq('booking_id', id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (agreement?.pdf_url) {
        const pdfRes = await fetch(agreement.pdf_url);
        if (pdfRes.ok) {
          const pdfBuffer = Buffer.from(await pdfRes.arrayBuffer());
          attachments.push({ filename: `Mietvertrag-${id}.pdf`, content: pdfBuffer });
        }
      }
    }

    if (attachments.length === 0) {
      return NextResponse.json({ error: 'Keine Dokumente konnten generiert werden.' }, { status: 500 });
    }

    // Dokumentliste für E-Mail-Text
    const docNames = attachments.map(a => a.filename.split('-')[0]).join(' und ');

    const von = booking.rental_from ? new Date(booking.rental_from).toLocaleDateString('de-DE') : '';
    const bis = booking.rental_to ? new Date(booking.rental_to).toLocaleDateString('de-DE') : '';

    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'buchung@cam2rent.de',
      to,
      subject: `Deine Dokumente — Buchung ${id}`,
      html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#1a1a1a;">
        <h2 style="color:#0f172a;">Deine Dokumente von cam2rent</h2>
        <p>Hallo ${booking.customer_name || 'Kunde'},</p>
        <p>anbei findest du ${docNames} zu deiner Buchung:</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
          <tr><td style="padding:6px 0;color:#64748b;">Buchungs-Nr.</td><td style="padding:6px 0;font-weight:600;">${id}</td></tr>
          <tr><td style="padding:6px 0;color:#64748b;">Produkt</td><td style="padding:6px 0;">${booking.product_name || ''}</td></tr>
          <tr><td style="padding:6px 0;color:#64748b;">Zeitraum</td><td style="padding:6px 0;">${von} — ${bis}</td></tr>
          <tr><td style="padding:6px 0;color:#64748b;">Gesamtbetrag</td><td style="padding:6px 0;font-weight:600;">${(booking.price_total || 0).toFixed(2).replace('.', ',')} €</td></tr>
        </table>
        <p>Bei Fragen erreichst du uns jederzeit unter <a href="mailto:${BUSINESS.emailKontakt}" style="color:#06b6d4;">${BUSINESS.emailKontakt}</a>.</p>
        <p>Viele Grüße,<br/><strong>cam2rent</strong></p>
      </div>`,
      attachments,
    });

    // E-Mail im Log speichern
    await supabase.from('email_log').insert({
      booking_id: id,
      email_type: 'manual_documents',
      subject: `Deine Dokumente — Buchung ${id}`,
      customer_email: to,
      status: 'sent',
    });

    return NextResponse.json({ ok: true, sent: attachments.length });
  } catch (err) {
    console.error('E-Mail senden Fehler:', err);
    return NextResponse.json({ error: 'E-Mail konnte nicht gesendet werden.' }, { status: 500 });
  }
}
