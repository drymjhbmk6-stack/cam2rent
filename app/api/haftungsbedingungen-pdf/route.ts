import { createElement, type ReactElement } from 'react';
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer';
import { HaftungsbedingungenPDF } from '@/lib/haftungsbedingungen-pdf';

export async function GET() {
  try {
    const pdfBuffer = await renderToBuffer(
      createElement(HaftungsbedingungenPDF) as ReactElement<DocumentProps>
    );

    return new Response(Buffer.from(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline; filename="cam2rent-haftungsbedingungen.pdf"',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (err) {
    console.error('Haftungsbedingungen-PDF Fehler:', err);
    return Response.json({ error: 'PDF-Generierung fehlgeschlagen' }, { status: 500 });
  }
}
