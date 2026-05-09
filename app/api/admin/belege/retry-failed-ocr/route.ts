import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { isTestMode } from '@/lib/env-mode';
import { logAudit } from '@/lib/audit';
import { runOcrForBeleg } from '@/lib/buchhaltung/run-ocr';

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
 * WICHTIG: Wir rufen `runOcrForBeleg()` als direkte Funktion auf — KEIN
 * internal-fetch. Internal-fetch wuerde das UA-Binding (Sweep 6/7) triggern,
 * weil Node-Fetch einen anderen UA sendet als der Browser. Folge: die
 * Middleware loescht die admin_sessions-Row, der Admin wird hart ausgeloggt,
 * alle Retries scheitern.
 *
 * Throttle-Quelle der Wahrheit ist der Semaphor in lib/buchhaltung/run-ocr.ts
 * (max 3 parallel). Hier reicht ein kleiner Delay zwischen sequenziellen
 * Aufrufen, um die Anthropic-Tokens zu schonen.
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
  const results: Array<{ id: string; beleg_nr: string; ok: boolean; error?: string }> = [];

  for (const b of candidates) {
    try {
      const r = await runOcrForBeleg(supabase, b.id);
      results.push({
        id: b.id,
        beleg_nr: b.beleg_nr,
        ok: r.ok,
        error: r.ok ? undefined : r.error,
      });
    } catch (err) {
      // runOcrForBeleg sollte nie throwen, defensiv trotzdem
      results.push({ id: b.id, beleg_nr: b.beleg_nr, ok: false, error: (err as Error).message });
    }
    // 500 ms Pause zwischen den sequenziellen Calls — Atempause fuer die
    // Anthropic-Tokens zusaetzlich zum 3er-Semaphor.
    await new Promise((r) => setTimeout(r, 500));
  }

  // Wieviele sind noch uebrig?
  const { count } = await supabase
    .from('belege')
    .select('*', { count: 'exact', head: true })
    .eq('ocr_status', 'failed')
    .neq('status', 'festgeschrieben')
    .eq('is_test', isTest);

  const succeeded = results.filter((r) => r.ok).length;

  await logAudit({
    action: 'beleg.retry_failed_ocr',
    entityType: 'beleg',
    entityId: 'bulk',
    changes: {
      retried: results.length,
      succeeded,
      remaining: count ?? 0,
    },
    request: req,
  });

  return NextResponse.json({
    retried: results.length,
    succeeded,
    remaining: count ?? 0,
    results,
  });
}
