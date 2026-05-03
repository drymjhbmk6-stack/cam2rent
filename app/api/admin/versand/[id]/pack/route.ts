import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { getCurrentAdminUser } from '@/lib/admin-auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { logAudit } from '@/lib/audit';
import { applyScannedUnits, parseScannedUnits } from '@/lib/scan-substitutions';

/**
 * POST /api/admin/versand/[id]/pack
 * Schritt 1 — Packer hat das Paket gepackt + signiert.
 *
 * Body: {
 *   packedBy: string,
 *   packedItems: string[],          // abgehakte Item-Schluessel
 *   condition: { tested?: boolean; noVisibleDamage?: boolean; note?: string },
 *   signatureDataUrl: string | null
 * }
 */

const limiter = rateLimit({ maxAttempts: 30, windowMs: 60 * 1000 });

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentAdminUser();
  if (!user) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }
  if (!limiter.check(getClientIp(req)).success) {
    return NextResponse.json({ error: 'Zu viele Anfragen.' }, { status: 429 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const packedBy = typeof body.packedBy === 'string' ? body.packedBy.trim() : '';
  const packedItems = Array.isArray(body.packedItems) ? body.packedItems.filter((s: unknown) => typeof s === 'string') : [];
  const condition = body.condition && typeof body.condition === 'object' ? body.condition : {};
  const signatureDataUrl = typeof body.signatureDataUrl === 'string' && body.signatureDataUrl.startsWith('data:image/')
    ? body.signatureDataUrl : null;

  // Gescannte Unit-IDs aus dem Scanner-Workflow: alle Codes die der Packer
  // wirklich gescannt hat (sowohl die urspruenglich reservierten als auch
  // Substitute). Die Reihenfolge-egal-Logik in applyScannedUnits matched
  // anschliessend missings (reserviert, nicht gescannt) gegen extras
  // (gescannt, nicht reserviert) nach accessory_id und tauscht die Buchungs-
  // Zuordnung aus, damit Schadens-Tracking auf das tatsaechlich versandte
  // Stueck zeigt.
  const scannedUnits = parseScannedUnits(body.scannedUnits);

  if (!packedBy || packedBy.length < 2) {
    return NextResponse.json({ error: 'Bitte deinen vollen Namen eintragen.' }, { status: 400 });
  }
  if (!signatureDataUrl) {
    return NextResponse.json({ error: 'Signatur fehlt.' }, { status: 400 });
  }

  // Mitarbeiter-Account-User-ID fuer harte 4-Augen-Pruefung mitschreiben.
  // Beim Master-Passwort-Login ist user.id = 'legacy-env' (kein UUID) -> NULL,
  // dann faellt die Check-API auf den weichen Namensvergleich zurueck.
  const packedByUserId = user.id !== 'legacy-env' ? user.id : null;

  const supabase = createServiceClient();

  await applyScannedUnits(supabase, id, scannedUnits);

  const { error } = await supabase
    .from('bookings')
    .update({
      pack_status: 'packed',
      pack_packed_by: packedBy,
      pack_packed_by_user_id: packedByUserId,
      pack_packed_at: new Date().toISOString(),
      pack_packed_signature: signatureDataUrl,
      pack_packed_items: packedItems,
      pack_packed_condition: condition,
      // Falls vorher schon eine Kontrolle stattgefunden hat (z.B. Re-Pack),
      // setzen wir die Kontroll-Felder zurueck — sonst wuerde der Status
      // 'checked' direkt aus der vorherigen Runde stehen bleiben.
      pack_checked_by: null,
      pack_checked_by_user_id: null,
      pack_checked_at: null,
      pack_checked_signature: null,
      pack_checked_items: null,
      pack_checked_notes: null,
      pack_photo_url: null,
    })
    .eq('id', id);

  if (error) {
    console.error('[versand/pack] error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logAudit({
    action: 'versand.pack',
    entityType: 'pack',
    entityId: id,
    entityLabel: packedBy,
    request: req,
  });

  return NextResponse.json({ success: true, status: 'packed' });
}
