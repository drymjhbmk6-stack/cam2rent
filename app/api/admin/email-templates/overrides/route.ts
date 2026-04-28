import { NextRequest, NextResponse } from 'next/server';
import { checkAdminAuth } from '@/lib/admin-auth';
import {
  getEmailTemplateOverrides,
  setEmailTemplateOverride,
} from '@/lib/email-template-overrides';
import { getTemplateById } from '@/lib/email-previews';
import { logAudit } from '@/lib/audit';

/**
 * GET /api/admin/email-templates/overrides
 * Liefert alle aktiven Overrides als Map { templateId: { subject?, introHtml? } }.
 *
 * PUT /api/admin/email-templates/overrides
 * Body: { id: string, subject?: string, introHtml?: string }
 * Setzt oder aktualisiert das Override fuer eine Template-ID.
 * Leere Felder werden ignoriert; sind beide Felder leer wird das Override
 * geloescht (Standard wiederhergestellt).
 *
 * DELETE /api/admin/email-templates/overrides?id=<templateId>
 * Loescht das Override fuer eine Template-ID.
 */

export async function GET() {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }
  const overrides = await getEmailTemplateOverrides();
  return NextResponse.json({ overrides });
}

export async function PUT(req: NextRequest) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }

  let body: { id?: string; subject?: string; introHtml?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Ungültiger Request-Body.' }, { status: 400 });
  }

  const id = (body.id ?? '').trim();
  if (!id) {
    return NextResponse.json({ error: 'Template-ID fehlt.' }, { status: 400 });
  }

  const template = getTemplateById(id);
  if (!template) {
    return NextResponse.json({ error: 'Vorlage nicht gefunden.' }, { status: 404 });
  }

  try {
    const overrides = await setEmailTemplateOverride(id, {
      subject: typeof body.subject === 'string' ? body.subject : undefined,
      introHtml: typeof body.introHtml === 'string' ? body.introHtml : undefined,
    });

    await logAudit({
      action: 'email_template.update',
      entityType: 'email_template',
      entityId: id,
      entityLabel: template.name,
      changes: {
        subject_set: Boolean(overrides[id]?.subject),
        intro_set: Boolean(overrides[id]?.introHtml),
      },
      request: req,
    });

    return NextResponse.json({ override: overrides[id] ?? null, overrides });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Speichern fehlgeschlagen.' },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const id = (searchParams.get('id') ?? '').trim();
  if (!id) {
    return NextResponse.json({ error: 'Template-ID fehlt.' }, { status: 400 });
  }

  const template = getTemplateById(id);
  if (!template) {
    return NextResponse.json({ error: 'Vorlage nicht gefunden.' }, { status: 404 });
  }

  try {
    const overrides = await setEmailTemplateOverride(id, null);
    await logAudit({
      action: 'email_template.reset',
      entityType: 'email_template',
      entityId: id,
      entityLabel: template.name,
      request: req,
    });
    return NextResponse.json({ overrides });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Löschen fehlgeschlagen.' },
      { status: 500 },
    );
  }
}
