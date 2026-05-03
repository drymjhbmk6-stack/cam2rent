import { NextRequest, NextResponse } from 'next/server';
import { getCurrentAdminUser } from '@/lib/admin-auth';
import {
  countOwners,
  deleteAdminUser,
  deleteAllSessionsForUser,
  getAdminUserById,
  hasPermission,
  PERMISSION_KEYS,
  type PermissionKey,
  updateAdminUser,
} from '@/lib/admin-users';
import { logAudit } from '@/lib/audit';

export const runtime = 'nodejs';

/**
 * PATCH  /api/admin/employees/[id]   — name/email/role/permissions/is_active/password
 * DELETE /api/admin/employees/[id]   — Mitarbeiter loeschen
 */

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const me = await getCurrentAdminUser();
  if (!hasPermission(me, 'mitarbeiter_verwalten')) {
    return NextResponse.json({ error: 'Keine Berechtigung.' }, { status: 403 });
  }
  const { id } = await ctx.params;
  if (id === 'legacy-env') {
    return NextResponse.json({ error: 'Der ENV-Admin kann nicht bearbeitet werden.' }, { status: 400 });
  }
  const target = await getAdminUserById(id);
  if (!target) return NextResponse.json({ error: 'Mitarbeiter nicht gefunden.' }, { status: 404 });

  // Privesc-Schutz (Sweep 7 Vuln 1): Nicht-Owner duerfen Owner-Accounts nicht
  // veraendern — sonst koennte ein Mitarbeiter mit `mitarbeiter_verwalten` das
  // Owner-Passwort zuruecksetzen und sich dann selbst einloggen.
  if (target.role === 'owner' && me?.role !== 'owner') {
    return NextResponse.json(
      { error: 'Nur Owner dürfen Owner-Accounts bearbeiten.' },
      { status: 403 }
    );
  }

  const body = (await req.json().catch(() => null)) as {
    name?: string;
    email?: string;
    username?: string | null;
    role?: 'owner' | 'employee';
    permissions?: string[];
    is_active?: boolean;
    password?: string;
  } | null;
  if (!body) return NextResponse.json({ error: 'Ungültige Anfrage.' }, { status: 400 });

  // Privesc-Schutz (Sweep 7 Vuln 1): Nicht-Owner duerfen sich nicht selbst die
  // Permissions erweitern oder die Rolle aendern — sonst waere mit
  // `mitarbeiter_verwalten` allein bereits Self-Privesc auf alle 9 Permissions
  // moeglich (de facto Owner-Aequivalent).
  if (me?.id === id && me?.role !== 'owner') {
    if (body.permissions !== undefined) {
      return NextResponse.json(
        { error: 'Du kannst deine eigenen Berechtigungen nicht ändern.' },
        { status: 403 }
      );
    }
    if (body.role !== undefined && body.role !== me.role) {
      return NextResponse.json(
        { error: 'Du kannst deine eigene Rolle nicht ändern.' },
        { status: 403 }
      );
    }
    if (body.is_active === false) {
      return NextResponse.json(
        { error: 'Du kannst dich nicht selbst deaktivieren.' },
        { status: 403 }
      );
    }
  }

  const patch: {
    name?: string; email?: string; username?: string | null; role?: 'owner' | 'employee';
    permissions?: PermissionKey[]; is_active?: boolean; password?: string;
  } = {};

  if (body.name !== undefined) patch.name = body.name;
  if (body.email !== undefined) patch.email = body.email;
  if (body.username !== undefined) patch.username = body.username;
  if (body.password !== undefined) {
    if (!body.password || body.password.length < 8) {
      return NextResponse.json({ error: 'Passwort muss mindestens 8 Zeichen haben.' }, { status: 400 });
    }
    patch.password = body.password;
  }

  // Rolle/Aktiv-Aenderung an Owner: letzten Owner schuetzen
  if (body.role !== undefined || body.is_active !== undefined) {
    if (target.role === 'owner') {
      const owners = await countOwners();
      const willDemote = body.role !== undefined && body.role !== 'owner';
      const willDeactivate = body.is_active === false;
      if (owners <= 1 && (willDemote || willDeactivate)) {
        return NextResponse.json(
          { error: 'Der letzte aktive Owner kann nicht herabgestuft oder deaktiviert werden.' },
          { status: 400 }
        );
      }
    }
    // Nur Owner duerfen einen anderen zu Owner machen
    if (body.role === 'owner' && me?.role !== 'owner') {
      return NextResponse.json({ error: 'Nur Owner dürfen Owner ernennen.' }, { status: 403 });
    }
    if (body.role !== undefined) patch.role = body.role;
    if (body.is_active !== undefined) patch.is_active = body.is_active;
  }

  if (body.permissions !== undefined) {
    patch.permissions = body.permissions.filter((p): p is PermissionKey =>
      (PERMISSION_KEYS as readonly string[]).includes(p)
    );
  }

  try {
    const updated = await updateAdminUser(id, patch);
    // Sicherheits-Invalidierung: bei Deaktivierung, Passwort-Wechsel, Rollen-/
    // Permission-Aenderung muessen alle bestehenden Sessions sofort enden,
    // damit ein deaktivierter oder herabgestufter Mitarbeiter nicht mit alter
    // Session weiterarbeiten kann.
    const mustInvalidate =
      patch.is_active === false ||
      patch.password !== undefined ||
      patch.role !== undefined ||
      patch.permissions !== undefined;
    if (mustInvalidate) {
      try {
        await deleteAllSessionsForUser(id);
      } catch (e) {
        console.error('[employees PATCH] Session-Invalidation fehlgeschlagen:', e);
      }
    }
    await logAudit({
      action: 'admin_user.update',
      entityType: 'admin_user',
      entityId: updated.id,
      entityLabel: `${updated.name} (${updated.email})`,
      changes: Object.keys(patch).reduce<Record<string, unknown>>((acc, k) => {
        if (k === 'password') acc[k] = '[changed]';
        else acc[k] = (patch as Record<string, unknown>)[k];
        return acc;
      }, {}),
      request: req,
    });
    return NextResponse.json({ user: updated });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unbekannter Fehler.';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const me = await getCurrentAdminUser();
  if (!hasPermission(me, 'mitarbeiter_verwalten')) {
    return NextResponse.json({ error: 'Keine Berechtigung.' }, { status: 403 });
  }
  const { id } = await ctx.params;
  if (id === 'legacy-env') {
    return NextResponse.json({ error: 'Der ENV-Admin kann nicht gelöscht werden.' }, { status: 400 });
  }
  if (me?.id === id) {
    return NextResponse.json({ error: 'Du kannst dich nicht selbst löschen.' }, { status: 400 });
  }
  const target = await getAdminUserById(id);
  if (!target) return NextResponse.json({ error: 'Mitarbeiter nicht gefunden.' }, { status: 404 });
  if (target.role === 'owner') {
    const owners = await countOwners();
    if (owners <= 1) {
      return NextResponse.json(
        { error: 'Der letzte aktive Owner kann nicht gelöscht werden.' },
        { status: 400 }
      );
    }
  }
  try {
    await deleteAllSessionsForUser(id);
    await deleteAdminUser(id);
    await logAudit({
      action: 'admin_user.delete',
      entityType: 'admin_user',
      entityId: id,
      entityLabel: `${target.name} (${target.email})`,
      request: req,
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unbekannter Fehler.';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
