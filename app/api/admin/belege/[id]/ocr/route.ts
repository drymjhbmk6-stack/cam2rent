import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { runOcrForBeleg } from '@/lib/buchhaltung/run-ocr';
import { logAudit } from '@/lib/audit';
import { createAdminNotification } from '@/lib/admin-notifications';

export const runtime = 'nodejs';
// Bulk-Upload feuert bis zu 50 OCR-Calls fire-and-forget — Coolify-Default-
// Timeout greift sonst mitten in der Vision-Analyse.
export const maxDuration = 300;

/**
 * POST /api/admin/belege/[id]/ocr
 * Body: { anhang_id?: uuid, notify?: boolean }
 *
 * Duenner Wrapper um lib/buchhaltung/run-ocr.ts. Die eigentliche Logik (Storage-
 * Download, Claude-Vision, Lieferant-Resolve, Positionen, Duplikat-Check) lebt
 * in der Lib, damit der Bulk-Retry-Endpoint sie direkt aufrufen kann statt
 * via Internal-HTTP-Fetch — das wuerde sonst durch das UA-Binding (Sweep 6/7)
 * die Admin-Session toeten.
 *
 * Bei `notify: true` (Bulk-Pfad) wird am Ende eine Admin-Notification
 * erzeugt — fuer Admins mit `finanzen`-Permission gibt's dann auch einen
 * Web-Push, sodass der User die Seite verlassen kann und trotzdem informiert
 * wird, sobald die Analyse fertig ist.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({})) as { anhang_id?: string; notify?: boolean };
  const supabase = createServiceClient();

  const result = await runOcrForBeleg(supabase, id, { anhangId: body.anhang_id });

  await logAudit({
    action: 'beleg.ocr',
    entityType: 'beleg',
    entityId: id,
    changes: {
      items: result.items_extracted ?? 0,
      duplicate_kind: result.duplicate?.kind ?? null,
      ok: result.ok,
    },
    request: req,
  });

  if (body.notify && result.beleg_nr) {
    if (!result.ok) {
      await createAdminNotification(supabase, {
        type: 'beleg_failed',
        title: `Beleg-Analyse fehlgeschlagen: ${result.beleg_nr}`,
        message: (result.error ?? 'Unbekannter Fehler').slice(0, 200),
        link: `/admin/buchhaltung/belege/${id}`,
      }).catch(() => {});
    } else if (result.duplicate) {
      await createAdminNotification(supabase, {
        type: 'beleg_duplicate',
        title: `⚠ Verdacht auf Duplikat: ${result.beleg_nr}`,
        message: `${result.supplier ?? 'unbekannt'} — ${result.duplicate.reason}. Bitte pruefen.`,
        link: `/admin/buchhaltung/belege/${id}`,
      }).catch(() => {});
    } else {
      const itemsLabel = (result.items_extracted ?? 0) === 1 ? '1 Position' : `${result.items_extracted ?? 0} Positionen`;
      await createAdminNotification(supabase, {
        type: 'beleg_ready',
        title: `Beleg analysiert: ${result.beleg_nr}`,
        message: `${result.supplier ?? 'unbekannt'} · ${itemsLabel} erkannt — bitte klassifizieren.`,
        link: `/admin/buchhaltung/belege/${id}`,
      }).catch(() => {});
    }
  }

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    ok: true,
    items_extracted: result.items_extracted ?? 0,
    supplier: result.supplier ?? null,
    duplicate: result.duplicate
      ? { kind: result.duplicate.kind, existing_beleg_nr: result.duplicate.existing.beleg_nr }
      : null,
  });
}
