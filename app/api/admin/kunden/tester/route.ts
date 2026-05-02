import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';
import { invalidateTesterCache } from '@/lib/tester-mode';

/**
 * POST /api/admin/kunden/tester
 *
 * Aktiviert oder deaktiviert das Tester-Konto-Flag fuer einen Kunden.
 * Tester-Konten:
 *  - Buchungen mit is_test=true (raus aus Reports/EUeR/DATEV)
 *  - Stripe-PaymentIntents mit Test-Keys (echte Karten/PayPal werden NICHT
 *    belastet — nur Test-Karten 4242... funktionieren)
 *  - Verifizierungs-Pflicht uebersprungen
 *
 * Permission: 'kunden' (siehe middleware.ts API_PATH_PERMISSIONS).
 *
 * Body: { userId: string, isTester: boolean }
 */
export async function POST(req: NextRequest) {
  try {
    const { userId, isTester } = (await req.json()) as {
      userId: string;
      isTester: boolean;
    };

    if (!userId || typeof isTester !== 'boolean') {
      return NextResponse.json({ error: 'Ungültige Anfrage.' }, { status: 400 });
    }

    const supabase = createServiceClient();

    const { error } = await supabase
      .from('profiles')
      .update({ is_tester: isTester })
      .eq('id', userId);

    // Defensiv: Wenn die Migration noch nicht durch ist, schlaegt das Update
    // mit einem 42703-Fehler fehl. Klare Fehlermeldung an den Admin.
    if (error && /column .*is_tester/i.test(error.message)) {
      return NextResponse.json(
        {
          error:
            'Migration noch nicht ausgeführt: bitte supabase/supabase-profiles-is-tester.sql in Supabase laufen lassen.',
        },
        { status: 500 }
      );
    }
    if (error) {
      console.error('[admin/kunden/tester] update error:', error);
      return NextResponse.json({ error: 'Fehler beim Aktualisieren.' }, { status: 500 });
    }

    invalidateTesterCache(userId);

    await logAudit({
      action: isTester ? 'customer.set_tester' : 'customer.unset_tester',
      entityType: 'customer',
      entityId: userId,
      request: req,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('POST /api/admin/kunden/tester error:', err);
    return NextResponse.json({ error: 'Serverfehler.' }, { status: 500 });
  }
}
