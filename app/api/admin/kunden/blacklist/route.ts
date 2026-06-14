import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';
import { getCurrentAdminUser } from '@/lib/admin-auth';

/**
 * POST /api/admin/kunden/blacklist
 * Sperrt oder entsperrt einen Kunden.
 * Body: { userId: string, blacklisted: boolean, reason?: string }
 *
 * Sweep 9: Owner-Schutz — verhindert dass ein Mitarbeiter mit `kunden`-
 * Permission Owner-Accounts blacklistet (Self-Lock-Out / Sabotage).
 */
export async function POST(req: NextRequest) {
  try {
    const me = await getCurrentAdminUser();
    if (!me) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { userId, blacklisted, reason } = (await req.json()) as {
      userId: string;
      blacklisted: boolean;
      reason?: string;
    };

    if (!userId || typeof blacklisted !== 'boolean') {
      return NextResponse.json({ error: 'Ungültige Anfrage.' }, { status: 400 });
    }

    const supabase = createServiceClient();

    // Pruefen ob das Ziel ein Owner-Admin-Account ist — Owner duerfen nicht
    // blacklistet werden, ausser ein anderer Owner macht es bewusst.
    const { data: targetAdmin } = await supabase
      .from('admin_users')
      .select('role')
      .eq('id', userId)
      .maybeSingle();
    if (targetAdmin?.role === 'owner' && me.role !== 'owner') {
      return NextResponse.json(
        { error: 'Owner-Accounts duerfen nur von Owner-Accounts gesperrt werden.' },
        { status: 403 },
      );
    }
    // Self-Block fuer Owner ebenfalls verhindern (versehentliche Selbst-Lockout)
    if (me.id === userId && blacklisted) {
      return NextResponse.json(
        { error: 'Selbst-Sperrung nicht erlaubt.' },
        { status: 400 },
      );
    }

    const updateData: Record<string, unknown> = {
      blacklisted,
    };

    if (blacklisted) {
      updateData.blacklist_reason = reason || '';
      updateData.blacklisted_at = new Date().toISOString();
    } else {
      updateData.blacklist_reason = null;
      updateData.blacklisted_at = null;
    }

    const { error } = await supabase
      .from('profiles')
      .update(updateData)
      .eq('id', userId);

    if (error) {
      console.error('Blacklist update error:', error);
      return NextResponse.json({ error: 'Fehler beim Aktualisieren.' }, { status: 500 });
    }

    // Auth-User bannen/entbannen → blockt das LOGIN. Der profiles.blacklisted-
    // Flag allein verhindert nur die Buchung (Payment-Intent-Check), nicht das
    // Anmelden — Supabase Auth kennt das Profil-Flag nicht. Beim Sperren wird
    // der Auth-User ~100 Jahre gebannt (kann sich nicht mehr einloggen, ein
    // bestehendes Token läuft binnen ~1 h aus); beim Entsperren wieder frei.
    let authWarning: string | null = null;
    try {
      const { error: banErr } = await supabase.auth.admin.updateUserById(userId, {
        ban_duration: blacklisted ? '876000h' : 'none',
      });
      if (banErr) {
        console.error('[blacklist] ban update error:', banErr);
        authWarning = banErr.message;
      }
    } catch (e) {
      console.error('[blacklist] ban update exception:', e);
      authWarning = e instanceof Error ? e.message : 'unbekannt';
    }

    await logAudit({
      action: blacklisted ? 'customer.block' : 'customer.unblock',
      entityType: 'customer',
      entityId: userId,
      changes: blacklisted ? { reason } : undefined,
      request: req,
    });

    return NextResponse.json({ success: true, authWarning });
  } catch (err) {
    console.error('POST /api/admin/kunden/blacklist error:', err);
    return NextResponse.json({ error: 'Serverfehler.' }, { status: 500 });
  }
}
