import { NextRequest, NextResponse } from 'next/server';
import { getCurrentAdminUser } from '@/lib/admin-auth';
import {
  createAdminUser,
  listAdminUsers,
  hasPermission,
  getInboxAddressMap,
  setInboxAddress,
  PERMISSION_KEYS,
  type PermissionKey,
} from '@/lib/admin-users';
import { logAudit } from '@/lib/audit';

export const runtime = 'nodejs';

/**
 * GET  /api/admin/employees                  — alle Mitarbeiter (nur Owner/mitarbeiter_verwalten)
 * POST /api/admin/employees                  — neuen Mitarbeiter anlegen
 */

export async function GET() {
  const me = await getCurrentAdminUser();
  if (!hasPermission(me, 'mitarbeiter_verwalten')) {
    return NextResponse.json({ error: 'Keine Berechtigung.' }, { status: 403 });
  }
  try {
    const users = await listAdminUsers();
    const inboxMap = await getInboxAddressMap();
    const enriched = users.map((u) => ({ ...u, inbox_address: inboxMap[u.id] ?? null }));
    return NextResponse.json({ users: enriched });
  } catch (err) {
    console.error('[employees] list', err);
    return NextResponse.json({ error: 'Fehler beim Laden.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const me = await getCurrentAdminUser();
  if (!hasPermission(me, 'mitarbeiter_verwalten')) {
    return NextResponse.json({ error: 'Keine Berechtigung.' }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as {
    email?: string;
    username?: string | null;
    name?: string;
    password?: string;
    role?: 'owner' | 'employee';
    permissions?: string[];
    inbox_address?: string | null;
  } | null;

  if (!body) return NextResponse.json({ error: 'Ungültige Anfrage.' }, { status: 400 });
  const { email, username, name, password, role, permissions } = body;
  if (!email || !name || !password) {
    return NextResponse.json({ error: 'E-Mail, Name und Passwort sind Pflicht.' }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'Passwort muss mindestens 8 Zeichen haben.' }, { status: 400 });
  }
  // Nur echte Owner duerfen andere zu Owner machen
  const targetRole: 'owner' | 'employee' = role === 'owner' && me?.role === 'owner' ? 'owner' : 'employee';
  const filteredPerms = (permissions ?? []).filter((p): p is PermissionKey =>
    (PERMISSION_KEYS as readonly string[]).includes(p)
  );

  try {
    const user = await createAdminUser({
      email,
      username: username ?? null,
      name,
      password,
      role: targetRole,
      permissions: filteredPerms,
      createdBy: me?.id ?? null,
    });
    // Postfach-Adresse separat setzen (nicht Teil des Login-kritischen
    // admin_users-Kern-Schemas). Fehler hier rollt den User nicht zurueck —
    // die Adresse kann im Bearbeiten-Dialog nachgetragen werden.
    let inboxWarning: string | undefined;
    if (body.inbox_address !== undefined) {
      try {
        await setInboxAddress(user.id, body.inbox_address);
      } catch (e) {
        inboxWarning = e instanceof Error ? e.message : 'Postfach-Adresse nicht gesetzt.';
      }
    }
    await logAudit({
      action: 'admin_user.create',
      entityType: 'admin_user',
      entityId: user.id,
      entityLabel: `${user.name} (${user.email})`,
      changes: { role: user.role, permissions: user.permissions },
      request: req,
    });
    return NextResponse.json({
      user: { ...user, inbox_address: inboxWarning ? null : (body.inbox_address ?? null) },
      ...(inboxWarning ? { warning: inboxWarning } : {}),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unbekannter Fehler.';
    const status = msg.includes('bereits verwendet') ? 409 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
