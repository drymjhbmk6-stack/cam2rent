import { NextRequest, NextResponse } from 'next/server';
import { getCurrentAdminUser } from '@/lib/admin-auth';
import { getPushMutedForUser, setPushMuted } from '@/lib/admin-users';
import {
  notificationTypesForUser,
  NOTIFICATION_TYPE_KEYS,
} from '@/lib/notification-types';

export const runtime = 'nodejs';

/**
 * GET  /api/admin/push/preferences — eigene Push-Einstellungen
 * PUT  /api/admin/push/preferences — eigene Push-Einstellungen setzen
 *
 * Jeder eingeloggte Admin darf seine EIGENEN Push-Typen steuern (kein
 * mitarbeiter_verwalten noetig). Owner koennen zusaetzlich pro Mitarbeiter
 * ueber die Mitarbeiter-Verwaltung einstellen.
 */

export async function GET() {
  const me = await getCurrentAdminUser();
  if (!me) return NextResponse.json({ error: 'Nicht angemeldet.' }, { status: 401 });

  const types = notificationTypesForUser(me).map((t) => ({
    type: t.type,
    label: t.label,
    group: t.group,
  }));

  // Der ENV-Notfall-Login hat keine DB-Zeile → keine speicherbaren Prefs.
  if (me.id === 'legacy-env') {
    return NextResponse.json({ legacy: true, types, muted: [] });
  }

  const muted = await getPushMutedForUser(me.id);
  return NextResponse.json({ types, muted });
}

export async function PUT(req: NextRequest) {
  const me = await getCurrentAdminUser();
  if (!me) return NextResponse.json({ error: 'Nicht angemeldet.' }, { status: 401 });
  if (me.id === 'legacy-env') {
    return NextResponse.json(
      { error: 'Der ENV-Notfall-Login kann keine persönlichen Einstellungen speichern.' },
      { status: 400 },
    );
  }

  const body = (await req.json().catch(() => null)) as { muted?: unknown } | null;
  if (!body || !Array.isArray(body.muted)) {
    return NextResponse.json({ error: 'Ungültige Anfrage.' }, { status: 400 });
  }

  // Nur bekannte Typen zulassen.
  const muted = body.muted.filter(
    (m): m is string => typeof m === 'string' && NOTIFICATION_TYPE_KEYS.includes(m),
  );

  try {
    await setPushMuted(me.id, muted);
    return NextResponse.json({ success: true, muted });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Fehler beim Speichern.';
    const status = msg.startsWith('Migration') ? 503 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
