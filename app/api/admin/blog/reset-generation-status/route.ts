import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';

/**
 * POST /api/admin/blog/reset-generation-status
 *
 * Setzt einen festhängenden Blog-Generator zurück. Tritt auf wenn
 * der Cron-Job (Anthropic + 3x Faktencheck + DALL-E) länger lief
 * als der Function-Timeout zulässt — dann wird setGenerationStatus('idle')
 * nie aufgerufen, der Lock bleibt für immer auf 'generating' und das
 * Frontend zeigt "Läuft seit X Sekunden" mit X im Stunden-Bereich.
 *
 * Setzt zusätzlich blog_schedule.status zurück auf 'planned', falls
 * der Eintrag noch auf 'generating' steht (sonst kommt das Thema nie
 * wieder in die Cron-Auswahl rein).
 */
export async function POST() {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Nicht authentifiziert.' }, { status: 401 });
  }

  const supabase = createServiceClient();

  // Generator-Status auf idle
  await supabase.from('admin_settings').upsert({
    key: 'blog_generation_status',
    value: JSON.stringify({
      status: 'idle',
      topic: '',
      started_at: null,
      finished_at: new Date().toISOString(),
      reset_at: new Date().toISOString(),
    }),
    updated_at: new Date().toISOString(),
  });

  // Hängende Schedule-Einträge zurücksetzen
  const { data: stuckSchedules } = await supabase
    .from('blog_schedule')
    .update({ status: 'planned' })
    .eq('status', 'generating')
    .select('id');

  return NextResponse.json({
    ok: true,
    reset_schedules: stuckSchedules?.length ?? 0,
  });
}
