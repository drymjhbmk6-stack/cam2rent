import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';
import { getCurrentAdminUser } from '@/lib/admin-auth';

/**
 * POST /api/admin/kunden/special-discount
 *
 * Setzt oder entfernt die Sonderkondition (individueller Prozent-Rabatt) eines
 * Kunden. Greift automatisch im Checkout und ersetzt dort die anderen
 * Auto-Rabatte. Maßgeblich ist immer der serverseitig aus `profiles` gelesene
 * Wert — der Client-Wert ist nur Anzeige.
 *
 * Body: { userId: string, percent: number | null, reason?: string, validUntil?: string | null }
 * percent null/0 → Sonderkondition entfernen.
 *
 * Permission `kunden` (Pfad /api/admin/kunden/* ist in middleware.ts gemappt).
 */
export async function POST(req: NextRequest) {
  try {
    const me = await getCurrentAdminUser();
    if (!me) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { userId, percent, reason, validUntil } = (await req.json()) as {
      userId: string;
      percent: number | null;
      reason?: string;
      validUntil?: string | null;
    };

    if (!userId) {
      return NextResponse.json({ error: 'Ungültige Anfrage.' }, { status: 400 });
    }

    // Sanitize
    let pct: number | null = null;
    if (percent !== null && percent !== undefined) {
      const n = Math.round(Number(percent));
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        return NextResponse.json(
          { error: 'Prozentsatz muss zwischen 0 und 100 liegen.' },
          { status: 400 },
        );
      }
      pct = n > 0 ? n : null;
    }

    const cleanReason =
      typeof reason === 'string' && reason.trim() ? reason.trim().slice(0, 300) : null;

    let cleanValidUntil: string | null = null;
    if (pct !== null && validUntil) {
      const m = String(validUntil).slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(m)) {
        return NextResponse.json(
          { error: 'Ungültiges Datum (gültig bis).' },
          { status: 400 },
        );
      }
      cleanValidUntil = m;
    }

    const supabase = createServiceClient();

    const updateData =
      pct === null
        ? {
            special_discount_percent: null,
            special_discount_reason: null,
            special_discount_valid_until: null,
            special_discount_set_by: null,
            special_discount_set_at: null,
          }
        : {
            special_discount_percent: pct,
            special_discount_reason: cleanReason,
            special_discount_valid_until: cleanValidUntil,
            special_discount_set_by: me.name || me.email || 'admin',
            special_discount_set_at: new Date().toISOString(),
          };

    const { error } = await supabase.from('profiles').update(updateData).eq('id', userId);

    // Defensiv: Wenn die Migration noch nicht durch ist, klare Meldung.
    if (error && /column .*special_discount/i.test(error.message)) {
      return NextResponse.json(
        {
          error:
            'Migration noch nicht ausgeführt: bitte supabase/supabase-profiles-special-discount.sql in Supabase laufen lassen.',
        },
        { status: 503 },
      );
    }
    if (error) {
      console.error('[admin/kunden/special-discount] update error:', error);
      return NextResponse.json({ error: 'Fehler beim Aktualisieren.' }, { status: 500 });
    }

    await logAudit({
      action: pct === null ? 'customer.unset_special_discount' : 'customer.set_special_discount',
      entityType: 'customer',
      entityId: userId,
      changes: pct === null ? undefined : { percent: pct, reason: cleanReason, validUntil: cleanValidUntil },
      request: req,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('POST /api/admin/kunden/special-discount error:', err);
    return NextResponse.json({ error: 'Serverfehler.' }, { status: 500 });
  }
}
