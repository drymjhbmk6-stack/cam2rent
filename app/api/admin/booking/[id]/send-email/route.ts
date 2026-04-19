import { NextRequest, NextResponse } from 'next/server';
import { createElement, type ReactElement } from 'react';
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import { InvoicePDF, type InvoiceData } from '@/lib/invoice-pdf';
import { LegalDocumentPDF } from '@/lib/legal-pdf';
import { ensureBusinessConfig } from '@/lib/load-business-config';
import { BUSINESS } from '@/lib/business-config';
import QRCode from 'qrcode';

const LEGAL_SLUG_MAP: Record<string, string> = {
  agb: 'agb',
  widerruf: 'widerruf',
  haftung: 'haftungsausschluss',
  datenschutz: 'datenschutz',
  impressum: 'impressum',
};

const LEGAL_LABELS: Record<string, string> = {
  agb: 'AGB',
  widerruf: 'Widerrufsbelehrung',
  haftung: 'Haftungsbedingungen',
  datenschutz: 'Datenschutzerklaerung',
  impressum: 'Impressum',
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();
  const { to, attachRechnung, attachVertrag, legalDocs } = body;
  const requestedLegalDocs: string[] = Array.isArray(legalDocs) ? legalDocs : [];

  if (!to) {
    return NextResponse.json({ error: 'Empfänger-E-Mail fehlt.' }, { status: 400 });
  }

  if (!attachRechnung && !attachVertrag && requestedLegalDocs.length === 0) {
    return NextResponse.json({ error: 'Mindestens ein Dokument auswählen.' }, { status: 400 });
  }

  await ensureBusinessConfig();
  const supabase = createServiceClient();

  // Buchung laden
  const { data: booking } = await supabase
    .from('bookings')
    .select('*')
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

    // Rechnung PDF direkt generieren (kein interner HTTP-Call)
    if (attachRechnung) {
      try {
        // Tax Config
        const { data: taxSettings } = await supabase
          .from('admin_settings')
          .select('key, value')
          .in('key', ['tax_mode', 'tax_rate', 'ust_id']);
        const taxMap: Record<string, string> = {};
        for (const s of taxSettings ?? []) taxMap[s.key] = s.value;

        // Kundenadresse
        let customerAddress = booking.shipping_address ?? '';
        if (!customerAddress && booking.user_id) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('address_street, address_zip, address_city')
            .eq('id', booking.user_id)
            .maybeSingle();
          if (profile?.address_street) {
            customerAddress = `${profile.address_street}, ${profile.address_zip} ${profile.address_city}`;
          }
        }

        const invoiceNumber = booking.id.replace(/^(C2R|BK)-/, 'RE-');
        const raw = booking.created_at ? new Date(booking.created_at) : new Date();
        const invoiceDate = raw.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

        const invoiceData: InvoiceData = {
          bookingId: booking.id,
          invoiceNumber,
          invoiceDate,
          customerName: booking.customer_name ?? '',
          customerEmail: booking.customer_email ?? to,
          customerAddress,
          productName: booking.product_name ?? '',
          rentalFrom: booking.rental_from ?? '',
          rentalTo: booking.rental_to ?? '',
          days: booking.days ?? 1,
          deliveryMode: booking.delivery_mode ?? 'versand',
          shippingMethod: booking.shipping_method ?? undefined,
          haftung: booking.haftung ?? 'none',
          accessories: Array.isArray(booking.accessories) ? booking.accessories : [],
          priceRental: booking.price_rental ?? 0,
          priceAccessories: booking.price_accessories ?? 0,
          priceHaftung: booking.price_haftung ?? 0,
          shippingPrice: booking.shipping_price ?? 0,
          priceTotal: booking.price_total ?? 0,
          deposit: booking.deposit ?? 0,
          taxMode: (taxMap['tax_mode'] as 'kleinunternehmer' | 'regelbesteuerung') || 'kleinunternehmer',
          taxRate: parseFloat(taxMap['tax_rate'] || '19'),
          ustId: taxMap['ust_id'] || '',
          paymentMethod: booking.payment_intent_id?.startsWith('MANUAL') ? 'Ueberweisung' : 'Stripe',
          paymentStatus: booking.payment_intent_id?.includes('UNPAID') ? 'unpaid' : undefined,
        };

        // QR-Code
        try {
          const epcData = ['BCD', '002', '1', 'SCT', BUSINESS.bic, BUSINESS.owner, BUSINESS.iban,
            `EUR${invoiceData.priceTotal.toFixed(2)}`, '', '', `${invoiceNumber} ${invoiceData.customerName}`].join('\n');
          invoiceData.qrCodeDataUrl = await QRCode.toDataURL(epcData, { width: 200, margin: 1, color: { dark: '#000000', light: '#ffffff' } });
        } catch { /* QR optional */ }

        const pdfBuffer = await renderToBuffer(
          createElement(InvoicePDF, { data: invoiceData }) as ReactElement<DocumentProps>
        );
        attachments.push({ filename: `Rechnung-${id}.pdf`, content: Buffer.from(pdfBuffer) });
      } catch (err) {
        console.error('Rechnung-PDF Fehler:', err);
      }
    }

    // Mietvertrag PDF — nur das unterschriebene Original aus Storage
    if (attachVertrag && booking.contract_signed) {
      try {
        const { data: agreement } = await supabase
          .from('rental_agreements')
          .select('pdf_url')
          .eq('booking_id', id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (agreement?.pdf_url) {
          const storagePath = agreement.pdf_url.replace(/^contracts\//, '');
          const { data: fileData } = await supabase.storage
            .from('contracts')
            .download(storagePath);

          if (fileData) {
            attachments.push({ filename: `Mietvertrag-${id}.pdf`, content: Buffer.from(await fileData.arrayBuffer()) });
          }
        }
      } catch (err) {
        console.error('Vertrag-PDF Fehler:', err);
      }
    }

    // Rechtliche Dokumente als PDFs generieren
    for (const docKey of requestedLegalDocs) {
      const slug = LEGAL_SLUG_MAP[docKey];
      const label = LEGAL_LABELS[docKey];
      if (!slug || !label) continue;

      try {
        const { data: legalDoc } = await supabase
          .from('legal_documents')
          .select('title, current_version_id')
          .eq('slug', slug)
          .maybeSingle();

        if (!legalDoc?.current_version_id) continue;

        const { data: version } = await supabase
          .from('legal_document_versions')
          .select('content, version_number, published_at')
          .eq('id', legalDoc.current_version_id)
          .maybeSingle();

        if (!version?.content) continue;

        const legalPdfBuffer = await renderToBuffer(
          createElement(LegalDocumentPDF, {
            data: {
              title: legalDoc.title,
              slug,
              content: version.content,
              versionNumber: version.version_number,
              publishedAt: version.published_at,
            },
          }) as ReactElement<DocumentProps>
        );
        attachments.push({ filename: `${label}.pdf`, content: Buffer.from(legalPdfBuffer) });
      } catch (err) {
        console.error(`Legal-PDF ${slug} Fehler:`, err);
      }
    }

    if (attachments.length === 0) {
      return NextResponse.json({ error: 'Keine Dokumente konnten generiert werden.' }, { status: 500 });
    }

    const docNames = attachments.map(a => a.filename.replace(/-.+\.pdf$/, '')).join(' und ');
    const von = booking.rental_from ? new Date(booking.rental_from).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' }) : '';
    const bis = booking.rental_to ? new Date(booking.rental_to).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' }) : '';

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
