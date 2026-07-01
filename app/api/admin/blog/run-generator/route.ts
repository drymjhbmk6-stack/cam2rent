import { NextRequest, NextResponse } from 'next/server';
import { checkAdminAuth } from '@/lib/admin-auth';
import { POST as runBlogGenerateCron } from '@/app/api/cron/blog-generate/route';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * POST /api/admin/blog/run-generator
 *
 * Manueller "Jetzt generieren"-Trigger fuer den Blog-Dashboard-Button.
 * Ruft die echte Cron-Generierungslogik in-process mit force=true auf und
 * gibt deren exakte Antwort zurueck — damit der Admin sieht, WARUM nichts
 * generiert wird (Test-Modus, fehlender API-Key, Anthropic-Fehler, kein
 * faelliger Eintrag) statt nur "keine Beitraege".
 *
 * Umgeht bewusst den Cron-Trigger (Crontab/Cloudflare) — ist damit auch ein
 * Notfall-Weg, um sofort einen Artikel zu erzeugen.
 */
export async function POST() {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Nicht authentifiziert.' }, { status: 401 });
  }

  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { ok: false, status: 500, result: { error: 'CRON_SECRET ist auf dem Server nicht gesetzt.' } },
      { status: 200 },
    );
  }

  // Synthetische Cron-Anfrage: Header-Auth + Scheduler-Bypass (force).
  const cronReq = new NextRequest(new URL('https://cam2rent.de/api/cron/blog-generate'), {
    method: 'POST',
    headers: {
      'x-cron-secret': secret,
      'x-force-generate': 'true',
    },
  });

  try {
    const res = await runBlogGenerateCron(cronReq);
    const data = await res.json().catch(() => ({}));
    return NextResponse.json({ ok: res.status < 400, status: res.status, result: data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unbekannter Fehler';
    return NextResponse.json(
      { ok: false, status: 500, result: { error: `Generator-Lauf abgebrochen: ${message}` } },
      { status: 200 },
    );
  }
}
