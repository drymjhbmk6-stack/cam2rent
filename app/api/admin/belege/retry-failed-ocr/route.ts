import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { isTestMode } from '@/lib/env-mode';
import { logAudit } from '@/lib/audit';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * POST /api/admin/belege/retry-failed-ocr?max=5
 *
 * Re-triggert OCR fuer Belege mit ocr_status='failed' im aktuellen Modus.
 * Verarbeitet bis zu 5 Belege sequenziell (mit kleinem Delay zwischen den
 * Calls), gibt dann zurueck wieviele uebrig sind. UI ruft den Endpoint in
 * einer Schleife, bis remaining=0.
 *
 * Warum nicht alle auf einmal: Anthropic-Rate-Limit. Mit dem in-flight-
 * Semaphor in der OCR-Route + SDK-Retries reichen 5 sequenzielle Aufrufe
 * pro Request locker, ohne ins ITPM-Limit zu rennen.
 */
export async function POST(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const max = Math.min(20, Math.max(1, parseInt(sp.get('max') ?? '5', 10)));

  const supabase = createServiceClient();
  const isTest = await isTestMode();

  const { data: failed } = await supabase
    .from('belege')
    .select('id, beleg_nr')
    .eq('ocr_status', 'failed')
    .neq('status', 'festgeschrieben')
    .eq('is_test', isTest)
    .order('created_at', { ascending: true })
    .limit(max);

  const candidates = (failed ?? []) as Array<{ id: string; beleg_nr: string }>;
  const cookieHeader = req.headers.get('cookie') ?? '';
  const origin = new URL(req.url).origin;

  const results: Array<{ id: string; beleg_nr: string; ok: boolean; error?: string }> = [];

  for (const b of candidates) {
    try {
      // Internal Fetch — Auth-Cookie weiterreichen, damit die OCR-Route die
      // gleiche Session sieht. notify=false, sonst kaeme pro Retry eine
      // Push-Notification.
      const ocrRes = await fetch(`${origin}/api/admin/belege/${b.id}/ocr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: cookieHeader },
        body: JSON.stringify({ notify: false }),
      });
      const data = await ocrRes.json().catch(() => ({}));
      results.push({
        id: b.id,
        beleg_nr: b.beleg_nr,
        ok: ocrRes.ok,
        error: ocrRes.ok ? undefined : ((data as { error?: string }).error ?? 'OCR fehlgeschlagen'),
      });
    } catch (err) {
      results.push({ id: b.id, beleg_nr: b.beleg_nr, ok: false, error: (err as Error).message });
    }
    // 1 s Pause zwischen den Calls — Atempause fuer die Anthropic-Tokens
    await new Promise((r) => setTimeout(r, 1000));
  }

  // Wieviele sind noch uebrig?
  const { count } = await supabase
    .from('belege')
    .select('*', { count: 'exact', head: true })
    .eq('ocr_status', 'failed')
    .neq('status', 'festgeschrieben')
    .eq('is_test', isTest);

  await logAudit({
    action: 'beleg.retry_failed_ocr',
    entityType: 'beleg',
    entityId: 'bulk',
    changes: {
      retried: results.length,
      succeeded: results.filter((r) => r.ok).length,
      remaining: count ?? 0,
    },
    request: req,
  });

  return NextResponse.json({
    retried: results.length,
    succeeded: results.filter((r) => r.ok).length,
    remaining: count ?? 0,
    results,
  });
}
