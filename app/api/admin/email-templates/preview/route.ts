import { NextRequest, NextResponse } from 'next/server';
import { checkAdminAuth } from '@/lib/admin-auth';
import { getTemplateById } from '@/lib/email-previews';

/**
 * GET /api/admin/email-templates/preview?id=<templateId>&format=html|json
 * Rendert die ausgewählte E-Mail-Vorlage mit Dummy-Daten.
 *
 * format=html (default): liefert das gerenderte HTML direkt, zur Anzeige
 *   im Browser (z.B. via <iframe src="...">).
 * format=json: liefert { subject, html } als JSON.
 */
export async function GET(req: NextRequest) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  const format = searchParams.get('format') === 'json' ? 'json' : 'html';

  if (!id) {
    return NextResponse.json({ error: 'Parameter "id" fehlt.' }, { status: 400 });
  }

  const template = getTemplateById(id);
  if (!template) {
    return NextResponse.json({ error: 'Vorlage nicht gefunden.' }, { status: 404 });
  }

  try {
    const { subject, html } = await template.render();

    if (format === 'json') {
      return NextResponse.json({ id, subject, html });
    }

    // HTML direkt — optional mit Subject-Banner als Header-Block oben
    const wrapped = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>${escapeHtml(subject)}</title><style>
  body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #e5e7eb; }
  .preview-banner { background: #0f172a; color: #e2e8f0; padding: 12px 20px; font-size: 13px; border-bottom: 1px solid #1e293b; position: sticky; top: 0; z-index: 10; }
  .preview-banner strong { color: #06b6d4; }
  .preview-content { padding: 20px; }
</style></head><body>
<div class="preview-banner">
  <strong>Betreff:</strong> ${escapeHtml(subject)}
  <span style="float:right;opacity:0.6;">Vorschau mit Dummy-Daten — nicht gesendet</span>
</div>
<div class="preview-content">${html}</div>
</body></html>`;

    return new NextResponse(wrapped, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('Preview render error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Vorschau konnte nicht erzeugt werden.' },
      { status: 500 },
    );
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
