import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import { getParagraphen } from '@/lib/contracts/contract-template';
import { logAudit } from '@/lib/audit';

/**
 * GET — Vertragsparagraphen laden (DB oder Fallback auf hardcoded)
 * POST — Vertragsparagraphen in admin_settings speichern
 * DELETE — Auf Standard zurücksetzen (DB-Eintrag löschen)
 */
export async function GET() {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }

  const supabase = createServiceClient();

  // Versuche aus DB zu laden
  const { data } = await supabase
    .from('admin_settings')
    .select('value')
    .eq('key', 'contract_paragraphs')
    .maybeSingle();

  if (data?.value) {
    try {
      const parsed = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
      if (Array.isArray(parsed) && parsed.length > 0) {
        return NextResponse.json({ paragraphs: parsed, source: 'custom' });
      }
    } catch {
      // Fallback
    }
  }

  // Fallback: hardcoded Paragraphen
  return NextResponse.json({ paragraphs: getParagraphen(200), source: 'default' });
}

export async function POST(req: NextRequest) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }

  const body = await req.json();
  const { paragraphs } = body;

  if (!Array.isArray(paragraphs) || paragraphs.length === 0) {
    return NextResponse.json({ error: 'Paragraphen-Array erforderlich.' }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { error } = await supabase
    .from('admin_settings')
    .upsert({
      key: 'contract_paragraphs',
      value: JSON.stringify(paragraphs),
      updated_at: new Date().toISOString(),
    });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logAudit({
    action: 'legal.update_contract_paragraphs',
    entityType: 'contract_paragraphs',
    changes: { count: paragraphs.length },
    request: req,
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }

  const supabase = createServiceClient();

  await supabase
    .from('admin_settings')
    .delete()
    .eq('key', 'contract_paragraphs');

  await logAudit({
    action: 'legal.reset_contract_paragraphs',
    entityType: 'contract_paragraphs',
    request: req,
  });

  // Standard-Paragraphen zurückgeben
  return NextResponse.json({ paragraphs: getParagraphen(200), source: 'default' });
}
