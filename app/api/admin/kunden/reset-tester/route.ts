import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';
import { invalidateTesterCache } from '@/lib/tester-mode';
import { getCurrentAdminUser } from '@/lib/admin-auth';

/**
 * POST /api/admin/kunden/reset-tester
 *
 * Setzt ein TESTER-Konto vollstaendig zurueck, damit man sich mit derselben
 * E-Mail erneut registrieren kann (frischer Test-Durchlauf). Loescht den
 * Auth-User (gibt die E-Mail frei), das Profil, hochgeladene Ausweis-Scans
 * und UGC-Dateien sowie leichte konto-gebundene Hilfstabellen.
 *
 * Hartes Sicherheits-Gate:
 *  - Owner-only (analog Tester-Flag-Endpoint — destruktiv).
 *  - NUR Konten mit profiles.is_tester = true. Ein echtes Kundenkonto kann
 *    ueber diesen Button NIEMALS geloescht werden (Schutz gegen Fehlklick).
 *  - Keine Selbst-Loeschung.
 *
 * Buchungen werden bewusst NICHT geloescht (FK-/Buchhaltungs-Risiko). Da der
 * neu registrierte Kunde eine neue user_id bekommt, tauchen alte Test-
 * Buchungen unter dem frischen Konto ohnehin nicht mehr auf.
 *
 * Body: { userId: string }
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

    const { userId } = (await req.json()) as { userId?: string };
    if (!userId || typeof userId !== 'string') {
      return NextResponse.json({ error: 'Ungültige Anfrage.' }, { status: 400 });
    }

    if (me.id !== 'legacy-env' && me.id === userId) {
      return NextResponse.json({ error: 'Selbst-Zurücksetzen nicht erlaubt.' }, { status: 400 });
    }

    const supabase = createServiceClient();

    // Hartes Tester-Gate: Profil laden + is_tester pruefen.
    const { data: profile, error: profErr } = await supabase
      .from('profiles')
      .select('is_tester')
      .eq('id', userId)
      .maybeSingle();

    if (profErr && /column .*is_tester/i.test(profErr.message)) {
      return NextResponse.json(
        { error: 'Migration fehlt: supabase/supabase-profiles-is-tester.sql ausführen.' },
        { status: 500 },
      );
    }
    if (!profile) {
      return NextResponse.json({ error: 'Konto nicht gefunden.' }, { status: 404 });
    }
    if (!profile.is_tester) {
      return NextResponse.json(
        { error: 'Nur Tester-Konten können zurückgesetzt werden.' },
        { status: 403 },
      );
    }

    // E-Mail fuer die Rueckmeldung merken.
    let email: string | undefined;
    try {
      const { data: authUser } = await supabase.auth.admin.getUserById(userId);
      email = authUser?.user?.email ?? undefined;
    } catch { /* egal */ }

    // 1) Storage-Dateien loeschen (Ausweis-Scans + UGC) — best-effort.
    try {
      const { data: idFiles } = await supabase.storage.from('id-documents').list(userId);
      if (idFiles && idFiles.length > 0) {
        await supabase.storage
          .from('id-documents')
          .remove(idFiles.map((f) => `${userId}/${f.name}`));
      }
    } catch (e) {
      console.warn('[reset-tester] id-documents cleanup:', e);
    }
    try {
      const { data: ugcRows } = await supabase
        .from('customer_ugc_submissions')
        .select('file_paths')
        .eq('user_id', userId);
      for (const ugc of ugcRows ?? []) {
        const paths = (ugc.file_paths ?? []) as string[];
        if (paths.length > 0) await supabase.storage.from('customer-ugc').remove(paths);
      }
    } catch (e) {
      console.warn('[reset-tester] customer-ugc cleanup:', e);
    }

    // 2) Leichte konto-gebundene Hilfstabellen leeren — best-effort, jede
    //    einzeln, damit eine fehlende Tabelle/Migration nichts blockiert.
    const childTables = [
      'cart_holds',
      'customer_login_history',
      'customer_push_subscriptions',
      'customer_ugc_submissions',
    ];
    for (const table of childTables) {
      try {
        await supabase.from(table).delete().eq('user_id', userId);
      } catch (e) {
        console.warn(`[reset-tester] cleanup ${table}:`, e);
      }
    }

    // 3) Profil-Zeile loeschen (falls kein Cascade greift).
    try {
      await supabase.from('profiles').delete().eq('id', userId);
    } catch (e) {
      console.warn('[reset-tester] profile delete:', e);
    }

    // 4) Auth-User hart loeschen — gibt die E-Mail fuer eine erneute
    //    Registrierung frei. Das ist der kritische Schritt.
    const { error: delErr } = await supabase.auth.admin.deleteUser(userId);
    if (delErr) {
      console.error('[reset-tester] deleteUser error:', delErr);
      return NextResponse.json(
        { error: 'Auth-Konto konnte nicht gelöscht werden: ' + delErr.message },
        { status: 500 },
      );
    }

    invalidateTesterCache(userId);

    await logAudit({
      action: 'customer.reset_tester',
      entityType: 'customer',
      entityId: userId,
      changes: { email: email ?? null },
      request: req,
    });

    return NextResponse.json({ success: true, email: email ?? null });
  } catch (err) {
    console.error('POST /api/admin/kunden/reset-tester error:', err);
    return NextResponse.json({ error: 'Serverfehler.' }, { status: 500 });
  }
}
