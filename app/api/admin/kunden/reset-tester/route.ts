import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';
import { invalidateTesterCache } from '@/lib/tester-mode';
import { getCurrentAdminUser } from '@/lib/admin-auth';

/**
 * POST /api/admin/kunden/reset-tester
 *
 * Setzt ein TESTER-Konto zurueck, damit man sich mit derselben E-Mail erneut
 * registrieren kann (frischer Test-Durchlauf).
 *
 * Ansatz: Der Auth-User wird NICHT hart geloescht (das scheitert an
 * Foreign-Keys, z.B. bookings.user_id → "Database error deleting user").
 * Stattdessen wird die E-Mail auf eine geparkte Adresse umbenannt + der User
 * gebannt (analog anonymize-customer). Dadurch ist die urspruengliche E-Mail
 * sofort wieder frei fuer eine Neuregistrierung, ohne FK-Probleme. Profil +
 * Ausweis-/UGC-Dateien werden danach geloescht, damit das alte Konto aus der
 * Kundenliste (profil-basiert) verschwindet.
 *
 * Hartes Sicherheits-Gate:
 *  - Owner-only.
 *  - NUR Konten mit profiles.is_tester = true. Ein echtes Kundenkonto (hat
 *    immer ein Profil) kann ueber diesen Button NIEMALS getroffen werden.
 *  - Keine Selbst-Zuruecksetzung.
 *
 * Body: { userId?: string }  — normaler Fall aus der Kundenliste.
 *       { email?: string }   — Recovery: gibt eine bereits halb-geloeschte
 *                              Test-E-Mail frei (Profil schon weg, Auth-User
 *                              haengt noch mit Originaladresse).
 *
 * Buchungen bleiben bewusst unberuehrt (FK-/Buchhaltungs-Risiko). Der neu
 * registrierte Kunde bekommt eine neue user_id → alte Test-Buchungen tauchen
 * unter dem frischen Konto nicht mehr auf.
 */
export async function POST(req: NextRequest) {
  try {
    const me = await getCurrentAdminUser();
    if (!me || me.role !== 'owner') {
      return NextResponse.json(
        { error: 'Nur Owner dürfen Test-Konten zurücksetzen.' },
        { status: 403 },
      );
    }

    const body = (await req.json().catch(() => ({}))) as { userId?: string; email?: string };
    const supabase = createServiceClient();

    // ── Ziel-Auth-User ermitteln ───────────────────────────────────────────
    let authId = typeof body.userId === 'string' ? body.userId.trim() : '';
    const emailInput = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';

    if (!authId && emailInput) {
      // Recovery-Pfad: Auth-User per E-Mail finden.
      const { data: list } = await supabase.auth.admin.listUsers({ perPage: 1000 });
      const hit = (list?.users ?? []).find(
        (u) => (u.email || '').toLowerCase() === emailInput,
      );
      if (!hit) {
        return NextResponse.json(
          { error: 'Kein Konto mit dieser E-Mail gefunden.' },
          { status: 404 },
        );
      }
      authId = hit.id;
    }

    if (!authId) {
      return NextResponse.json({ error: 'Ungültige Anfrage.' }, { status: 400 });
    }

    if (me.id !== 'legacy-env' && me.id === authId) {
      return NextResponse.json({ error: 'Selbst-Zurücksetzen nicht erlaubt.' }, { status: 400 });
    }

    // ── Tester-Gate ─────────────────────────────────────────────────────────
    // Ein echter Kunde hat IMMER ein Profil (handle_new_user-Trigger). Existiert
    // ein Profil, muss is_tester=true sein. Fehlt das Profil komplett, ist es
    // ein verwaister Auth-User aus einem fehlgeschlagenen Reset (Recovery) →
    // erlaubt.
    const { data: profile, error: profErr } = await supabase
      .from('profiles')
      .select('is_tester')
      .eq('id', authId)
      .maybeSingle();

    if (profErr && /column .*is_tester/i.test(profErr.message)) {
      return NextResponse.json(
        { error: 'Migration fehlt: supabase/supabase-profiles-is-tester.sql ausführen.' },
        { status: 500 },
      );
    }
    if (profile && !profile.is_tester) {
      return NextResponse.json(
        { error: 'Nur Tester-Konten können zurückgesetzt werden.' },
        { status: 403 },
      );
    }

    // Original-E-Mail fuer die Rueckmeldung merken.
    let email: string | undefined;
    try {
      const { data: authUser } = await supabase.auth.admin.getUserById(authId);
      email = authUser?.user?.email ?? undefined;
    } catch { /* egal */ }

    // ── 1) Kritischer Schritt: E-Mail freigeben (umbenennen + bannen) ────────
    // Schlaegt das fehl, brechen wir VOR dem Loeschen des Profils ab, damit
    // nichts halb-kaputt zurueckbleibt.
    if (!email || !email.endsWith('@anonymisiert.local')) {
      const { error: renameErr } = await supabase.auth.admin.updateUserById(authId, {
        email: `reset_${authId}@anonymisiert.local`,
        ban_duration: '876000h', // ~100 Jahre = effektiv permanent
        user_metadata: { reset_tester: true },
      });
      if (renameErr) {
        console.error('[reset-tester] rename error:', renameErr);
        return NextResponse.json(
          { error: 'E-Mail konnte nicht freigegeben werden: ' + renameErr.message },
          { status: 500 },
        );
      }
    }

    // ── 2) Storage-Dateien loeschen (best-effort) ────────────────────────────
    try {
      const { data: idFiles } = await supabase.storage.from('id-documents').list(authId);
      if (idFiles && idFiles.length > 0) {
        await supabase.storage
          .from('id-documents')
          .remove(idFiles.map((f) => `${authId}/${f.name}`));
      }
    } catch (e) {
      console.warn('[reset-tester] id-documents cleanup:', e);
    }
    try {
      const { data: ugcRows } = await supabase
        .from('customer_ugc_submissions')
        .select('file_paths')
        .eq('user_id', authId);
      for (const ugc of ugcRows ?? []) {
        const paths = (ugc.file_paths ?? []) as string[];
        if (paths.length > 0) await supabase.storage.from('customer-ugc').remove(paths);
      }
    } catch (e) {
      console.warn('[reset-tester] customer-ugc cleanup:', e);
    }

    // ── 3) Leichte konto-gebundene Hilfstabellen leeren (best-effort) ────────
    const childTables = [
      'cart_holds',
      'customer_login_history',
      'customer_push_subscriptions',
      'customer_ugc_submissions',
    ];
    for (const table of childTables) {
      try {
        await supabase.from(table).delete().eq('user_id', authId);
      } catch (e) {
        console.warn(`[reset-tester] cleanup ${table}:`, e);
      }
    }

    // ── 4) Profil-Zeile loeschen → verschwindet aus der Kundenliste ──────────
    try {
      await supabase.from('profiles').delete().eq('id', authId);
    } catch (e) {
      console.warn('[reset-tester] profile delete:', e);
    }

    invalidateTesterCache(authId);

    await logAudit({
      action: 'customer.reset_tester',
      entityType: 'customer',
      entityId: authId,
      changes: { email: email ?? null },
      request: req,
    });

    return NextResponse.json({ success: true, email: email ?? null });
  } catch (err) {
    console.error('POST /api/admin/kunden/reset-tester error:', err);
    return NextResponse.json({ error: 'Serverfehler.' }, { status: 500 });
  }
}
