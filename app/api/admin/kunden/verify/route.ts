import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';

/**
 * POST /api/admin/kunden/verify
 * Verifiziert oder lehnt einen Kunden ab.
 * Body: { userId: string, action: 'verify' | 'reject' }
 */
export async function POST(req: NextRequest) {
  try {
    const { userId, action } = (await req.json()) as {
      userId: string;
      action: 'verify' | 'reject';
    };

    if (!userId || !['verify', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'Ungültige Anfrage.' }, { status: 400 });
    }

    const supabase = createServiceClient();

    if (action === 'verify') {
      const { error } = await supabase
        .from('profiles')
        .update({
          verification_status: 'verified',
          verified_at: new Date().toISOString(),
          verified_by: 'admin',
        })
        .eq('id', userId);

      if (error) {
        console.error('Verify error:', error);
        return NextResponse.json({ error: 'Fehler beim Verifizieren.' }, { status: 500 });
      }
    } else {
      // Ablehnen: Status zurücksetzen, Dokumente löschen
      const { data: profile } = await supabase
        .from('profiles')
        .select('id_front_url, id_back_url')
        .eq('id', userId)
        .maybeSingle();

      // Dateien aus Storage löschen
      if (profile?.id_front_url || profile?.id_back_url) {
        const filesToDelete = [profile.id_front_url, profile.id_back_url].filter(Boolean) as string[];
        if (filesToDelete.length > 0) {
          await supabase.storage.from('id-documents').remove(filesToDelete);
        }
      }

      const { error } = await supabase
        .from('profiles')
        .update({
          verification_status: 'rejected',
          id_front_url: null,
          id_back_url: null,
          verified_at: null,
          verified_by: null,
        })
        .eq('id', userId);

      if (error) {
        console.error('Reject error:', error);
        return NextResponse.json({ error: 'Fehler beim Ablehnen.' }, { status: 500 });
      }
    }

    await logAudit({
      action: action === 'verify' ? 'customer.verify' : 'customer.reject_verification',
      entityType: 'customer',
      entityId: userId,
      request: req,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('POST /api/admin/kunden/verify error:', err);
    return NextResponse.json({ error: 'Serverfehler.' }, { status: 500 });
  }
}
