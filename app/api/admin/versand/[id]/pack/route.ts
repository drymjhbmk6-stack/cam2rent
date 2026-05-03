import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { getCurrentAdminUser } from '@/lib/admin-auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { logAudit } from '@/lib/audit';

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

  // Substitutionen aus dem Scanner-Workflow: der Packer hat ein anderes
  // Exemplar gleicher Kategorie gescannt als urspruenglich reserviert. Wir
  // schreiben unit_id / accessory_unit_ids entsprechend um, damit Schadens-
  // Tracking und Vertrag spaeter auf das tatsaechlich versandte Stueck zeigen.
  type SubstitutionInput = { itemKey: string; kind: 'camera' | 'accessory'; newUnitId: string };
  const substitutions: SubstitutionInput[] = Array.isArray(body.substitutions)
    ? (body.substitutions as unknown[])
        .filter((s): s is SubstitutionInput =>
          !!s && typeof s === 'object'
          && typeof (s as SubstitutionInput).itemKey === 'string'
          && ((s as SubstitutionInput).kind === 'camera' || (s as SubstitutionInput).kind === 'accessory')
          && typeof (s as SubstitutionInput).newUnitId === 'string'
          && (s as SubstitutionInput).newUnitId.length > 0,
        )
    : [];

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

  // ── Substitutionen anwenden (vor dem Pack-Status-Update) ─────────────────
  // Wir brauchen die aktuelle Buchung um:
  //   - bei Kamera den alten unit_id zu kennen (fuer Status-Reset auf available)
  //   - bei Zubehoer den ersten passenden alten unit_id im accessory_unit_ids
  //     auszutauschen (gleiche accessory_id wie das gescannte neue Exemplar)
  if (substitutions.length > 0) {
    const { data: bookingBefore } = await supabase
      .from('bookings')
      .select('unit_id, accessory_unit_ids')
      .eq('id', id)
      .maybeSingle();
    if (!bookingBefore) {
      return NextResponse.json({ error: 'Buchung nicht gefunden.' }, { status: 404 });
    }

    // 1) Kamera-Substitution
    const cameraSub = substitutions.find((s) => s.kind === 'camera');
    if (cameraSub) {
      const oldCameraUnitId = bookingBefore.unit_id as string | null;
      const newCameraUnitId = cameraSub.newUnitId;
      if (oldCameraUnitId !== newCameraUnitId) {
        await supabase.from('bookings').update({ unit_id: newCameraUnitId }).eq('id', id);
        // Status-Tausch best-effort — Tabelle hat ggf. keinen 'rented'-Workflow.
        if (oldCameraUnitId) {
          await supabase.from('product_units')
            .update({ status: 'available' })
            .eq('id', oldCameraUnitId)
            .eq('status', 'rented');
        }
        await supabase.from('product_units')
          .update({ status: 'rented' })
          .eq('id', newCameraUnitId)
          .in('status', ['available', 'rented']);
      }
    }

    // 2) Zubehoer-Substitutionen: pro Eintrag genau eine alte UUID derselben
    //    accessory_id im Array durch die neue ersetzen.
    const accessorySubs = substitutions.filter((s) => s.kind === 'accessory');
    if (accessorySubs.length > 0) {
      const currentAccUnitIds = ((bookingBefore.accessory_unit_ids as string[] | null) ?? []).slice();
      // accessory_id pro neuer Unit nachladen — wir brauchen das, um die alte
      // unit_id im Array zu finden (gleiche Kategorie).
      const newUnitIds = accessorySubs.map((s) => s.newUnitId);
      const { data: newUnits } = await supabase
        .from('accessory_units')
        .select('id, accessory_id')
        .in('id', newUnitIds);
      const newUnitIdToAccId = new Map<string, string>();
      for (const u of newUnits ?? []) newUnitIdToAccId.set(u.id as string, u.accessory_id as string);

      // accessory_id der bestehenden alten Units laden (um den Tausch nach
      // Kategorie zu treffen).
      const { data: oldUnits } = await supabase
        .from('accessory_units')
        .select('id, accessory_id')
        .in('id', currentAccUnitIds.length > 0 ? currentAccUnitIds : ['00000000-0000-0000-0000-000000000000']);
      const oldUnitIdToAccId = new Map<string, string>();
      for (const u of oldUnits ?? []) oldUnitIdToAccId.set(u.id as string, u.accessory_id as string);

      const releasedOldIds: string[] = [];
      const claimedNewIds: string[] = [];

      for (const sub of accessorySubs) {
        const accId = newUnitIdToAccId.get(sub.newUnitId);
        if (!accId) continue; // unbekannte Unit — wir lassen die Buchung in Ruhe
        // Wenn die neue Unit-ID schon im Array steht, nichts zu tun.
        if (currentAccUnitIds.includes(sub.newUnitId)) continue;
        // Eine alte Unit gleicher Kategorie suchen, die noch nicht ersetzt wurde.
        const idx = currentAccUnitIds.findIndex((uid) =>
          oldUnitIdToAccId.get(uid) === accId && !releasedOldIds.includes(uid),
        );
        if (idx >= 0) {
          releasedOldIds.push(currentAccUnitIds[idx]);
          currentAccUnitIds[idx] = sub.newUnitId;
        } else {
          // Keine passende alte Unit → einfach hinten anhaengen
          currentAccUnitIds.push(sub.newUnitId);
        }
        claimedNewIds.push(sub.newUnitId);
      }

      await supabase.from('bookings')
        .update({ accessory_unit_ids: currentAccUnitIds })
        .eq('id', id);

      if (releasedOldIds.length > 0) {
        await supabase.from('accessory_units')
          .update({ status: 'available' })
          .in('id', releasedOldIds)
          .eq('status', 'rented');
      }
      if (claimedNewIds.length > 0) {
        await supabase.from('accessory_units')
          .update({ status: 'rented' })
          .in('id', claimedNewIds)
          .in('status', ['available', 'rented']);
      }
    }
  }

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
