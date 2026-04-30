import { createElement, type ReactElement } from 'react';
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer';
import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import { LegalDocumentPDF, type LegalPDFData } from '@/lib/legal-pdf';
import { logAudit } from '@/lib/audit';

/**
 * POST /api/admin/legal/publish — Neue Version veröffentlichen
 * Body: { document_id, content, content_format?, change_note? }
 * Nutzt die Postgres-Funktion publish_legal_version für atomare Versionierung.
 * Nach Publish: PDF generieren und in Supabase Storage archivieren.
 */
export async function POST(req: Request) {
  if (!await checkAdminAuth()) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { document_id, content, content_format, change_note } = body;

  if (!document_id || !content) {
    return NextResponse.json({ error: 'document_id und content erforderlich' }, { status: 400 });
  }

  const supabase = createServiceClient();

  // 1. Neue Version atomar veröffentlichen
  const { data, error } = await supabase.rpc('publish_legal_version', {
    p_document_id: document_id,
    p_content: content,
    p_format: content_format || 'markdown',
    p_change_note: change_note || null,
    p_user_id: null,
  });

  if (error) {
    console.error('publish_legal_version Fehler:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 2. Dokument-Slug + neue Versionsnummer nachschlagen
  const { data: doc } = await supabase
    .from('legal_documents')
    .select('slug, title')
    .eq('id', document_id)
    .single();

  const { data: newVersion } = await supabase
    .from('legal_document_versions')
    .select('version_number, published_at')
    .eq('id', data)
    .single();

  // 3. Revalidation-Tag auslösen (ISR)
  if (doc?.slug) {
    try {
      const { revalidateTag } = await import('next/cache');
      revalidateTag(`legal:${doc.slug}`);
    } catch {
      // Revalidation nicht verfügbar in allen Umgebungen
    }
  }

  // 4. PDF im Hintergrund generieren und in Storage archivieren (non-blocking)
  if (doc && newVersion) {
    archivePDF(supabase, {
      title: doc.title,
      slug: doc.slug,
      content,
      versionNumber: newVersion.version_number,
      publishedAt: newVersion.published_at,
    }).catch((err) => console.error('PDF-Archivierung fehlgeschlagen:', err));
  }

  // 5. Erinnerung erstellen: Vertragsparagraphen prüfen
  if (doc?.slug) {
    const SLUG_TO_PARAGRAPHS: Record<string, string> = {
      agb: '§1-6, §10-12, §15, §17-19',
      haftungsausschluss: '§7-9, §14',
      widerruf: '§13',
      datenschutz: '§16',
    };
    const affectedParagraphs = SLUG_TO_PARAGRAPHS[doc.slug];
    if (affectedParagraphs) {
      try {
        const { createAdminNotification } = await import('@/lib/admin-notifications');
        await createAdminNotification(supabase, {
          type: 'new_message',
          title: `Vertragsparagraphen prüfen: ${doc.title} geändert`,
          message: `Die ${doc.title} wurden aktualisiert. Bitte prüfe ob die Vertragsparagraphen (${affectedParagraphs}) noch aktuell sind.`,
          link: '/admin/legal/vertragsparagraphen',
        });
      } catch {
        // Notification nicht kritisch
      }
    }
  }

  await logAudit({
    action: 'legal.publish',
    entityType: 'legal',
    entityId: document_id,
    entityLabel: doc?.title,
    changes: {
      slug: doc?.slug,
      version_number: newVersion?.version_number,
      change_note: change_note || null,
    },
    request: req,
  });

  return NextResponse.json({ success: true, version_id: data });
}

/**
 * Generiert ein PDF und lädt es in Supabase Storage hoch.
 * Bucket: legal-documents, Pfad: {slug}/v{version}.pdf
 */
async function archivePDF(
  supabase: ReturnType<typeof createServiceClient>,
  data: LegalPDFData
) {
  const pdfBuffer = await renderToBuffer(
    createElement(LegalDocumentPDF, { data }) as ReactElement<DocumentProps>
  );

  const filePath = `${data.slug}/v${data.versionNumber}.pdf`;

  // Bucket erstellen falls noch nicht vorhanden (idempotent)
  await supabase.storage.createBucket('legal-documents', {
    public: false,
    fileSizeLimit: 5 * 1024 * 1024, // 5 MB
  });

  const { error } = await supabase.storage
    .from('legal-documents')
    .upload(filePath, Buffer.from(pdfBuffer), {
      contentType: 'application/pdf',
      upsert: true,
    });

  if (error) {
    console.error(`Storage-Upload fehlgeschlagen (${filePath}):`, error.message);
  } else {
    console.log(`Legal-PDF archiviert: ${filePath}`);
  }
}
