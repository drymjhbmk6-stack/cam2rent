import { createElement, type ReactElement } from 'react';
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer';
import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import { LegalDocumentPDF, type LegalPDFData } from '@/lib/legal-pdf';

/**
 * GET /api/admin/legal/pdf?slug=agb — PDF on-demand generieren und herunterladen
 * Optional: ?version=3 — bestimmte Version statt aktueller
 */
export async function GET(req: Request) {
  if (!await checkAdminAuth()) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const slug = searchParams.get('slug');
  const versionParam = searchParams.get('version');

  if (!slug) {
    return NextResponse.json({ error: 'slug Parameter erforderlich' }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Dokument laden
  const { data: doc, error: docErr } = await supabase
    .from('legal_documents')
    .select('id, slug, title, current_version_id')
    .eq('slug', slug)
    .single();

  if (docErr || !doc) {
    return NextResponse.json({ error: 'Dokument nicht gefunden' }, { status: 404 });
  }

  // Version laden (bestimmte oder aktuelle)
  let versionQuery = supabase
    .from('legal_document_versions')
    .select('id, version_number, content, content_format, published_at')
    .eq('document_id', doc.id);

  if (versionParam) {
    versionQuery = versionQuery.eq('version_number', parseInt(versionParam, 10));
  } else {
    versionQuery = versionQuery.eq('id', doc.current_version_id!);
  }

  const { data: version, error: verErr } = await versionQuery.single();

  if (verErr || !version) {
    return NextResponse.json({ error: 'Version nicht gefunden' }, { status: 404 });
  }

  // PDF generieren
  const pdfData: LegalPDFData = {
    title: doc.title,
    slug: doc.slug,
    content: version.content,
    versionNumber: version.version_number,
    publishedAt: version.published_at,
  };

  try {
    const pdfBuffer = await renderToBuffer(
      createElement(LegalDocumentPDF, { data: pdfData }) as ReactElement<DocumentProps>
    );

    const filename = `cam2rent-${slug}-v${version.version_number}.pdf`;

    return new Response(Buffer.from(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${filename}"`,
      },
    });
  } catch (err) {
    console.error('Legal-PDF Fehler:', err);
    return NextResponse.json({ error: 'PDF-Generierung fehlgeschlagen' }, { status: 500 });
  }
}
