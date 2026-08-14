import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';
import { sanitizeSearchInput } from '@/lib/search-sanitize';
import {
  loadShipmentGroupSiblings,
  propagateShipmentFields,
} from '@/lib/shipment-group';

/**
 * Verknüpfte Bestellungen — gemeinsamer Versand/Retoure für mehrere Buchungen
 * desselben Kunden (`bookings.shipment_group_id`, siehe lib/shipment-group.ts).
 * Auth über die Middleware (Prefix /api/admin/booking → tagesgeschaeft).
 *
 * GET  ?q=<Suche>   → Kandidaten zum Verknüpfen (bei gesetztem q) + aktuelle
 *                     Gruppenmitglieder (immer).
 * POST { target_id } → verknüpft `id` mit `target_id` (merged bestehende
 *                     Gruppen beider Buchungen zusammen).
 * DELETE              → löst `id` aus ihrer Gruppe.
 */

const SEARCH_COLS =
  'id, customer_name, customer_email, product_name, status, delivery_mode, rental_from, rental_to, shipment_group_id';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = createServiceClient();

  const { data: self, error } = await supabase
    .from('bookings')
    .select('id')
    .eq('id', id)
    .maybeSingle();
  if (error && /shipment_group_id/i.test(error.message || '')) {
    return NextResponse.json({ migration_pending: true, siblings: [], candidates: [] });
  }
  if (!self) {
    return NextResponse.json({ error: 'Buchung nicht gefunden.' }, { status: 404 });
  }

  const siblings = await loadShipmentGroupSiblings(supabase, id);

  const q = sanitizeSearchInput(req.nextUrl.searchParams.get('q'));
  let candidates: Record<string, unknown>[] = [];
  if (q.length >= 2) {
    const like = `%${q}%`;
    const excludeIds = new Set([id, ...siblings.map((s) => s.id)]);
    const { data } = await supabase
      .from('bookings')
      .select(SEARCH_COLS)
      .or(`id.ilike.${like},customer_name.ilike.${like},customer_email.ilike.${like},product_name.ilike.${like}`)
      .order('created_at', { ascending: false })
      .limit(20);
    candidates = (data ?? []).filter((b) => !excludeIds.has(b.id as string));
  }

  return NextResponse.json({ siblings, candidates });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const targetId = typeof body?.target_id === 'string' ? body.target_id.trim() : '';
  if (!targetId) {
    return NextResponse.json({ error: 'target_id fehlt.' }, { status: 400 });
  }
  if (targetId === id) {
    return NextResponse.json({ error: 'Eine Buchung kann nicht mit sich selbst verknüpft werden.' }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data: rows, error } = await supabase
    .from('bookings')
    .select('id, status, shipment_group_id')
    .in('id', [id, targetId]);
  if (error && /shipment_group_id/i.test(error.message || '')) {
    return NextResponse.json(
      { error: 'Migration `supabase-bookings-shipment-group.sql` steht noch aus.' },
      { status: 503 },
    );
  }
  const source = rows?.find((r) => r.id === id) as { id: string; status: string; shipment_group_id: string | null } | undefined;
  const target = rows?.find((r) => r.id === targetId) as { id: string; status: string; shipment_group_id: string | null } | undefined;
  if (!source || !target) {
    return NextResponse.json({ error: 'Buchung nicht gefunden.' }, { status: 404 });
  }
  const TERMINAL = ['cancelled', 'completed', 'returned'];
  if (TERMINAL.includes(source.status) || TERMINAL.includes(target.status)) {
    return NextResponse.json(
      { error: 'Abgeschlossene oder stornierte Buchungen können nicht verknüpft werden.' },
      { status: 409 },
    );
  }

  // Beide bestehenden Gruppen vollständig einsammeln, damit ein Verknüpfen
  // von zwei bereits-gruppierten Clustern beide Cluster zu EINEM verschmilzt.
  const memberIds = new Set([id, targetId]);
  for (const gid of [source.shipment_group_id, target.shipment_group_id]) {
    if (!gid) continue;
    const { data: members } = await supabase.from('bookings').select('id').eq('shipment_group_id', gid);
    for (const m of members ?? []) memberIds.add((m as { id: string }).id);
  }

  const finalGroupId = source.shipment_group_id ?? target.shipment_group_id ?? crypto.randomUUID();

  const { error: updErr } = await supabase
    .from('bookings')
    .update({ shipment_group_id: finalGroupId })
    .in('id', [...memberIds]);
  if (updErr) {
    return NextResponse.json({ error: 'Verknüpfen fehlgeschlagen.' }, { status: 500 });
  }

  // Bereits vorhandene Trackingdaten der Quelle sofort auf die neue Gruppe
  // spiegeln (nützlich, wenn eine bereits versandte Buchung nachträglich mit
  // einer zweiten verknüpft wird).
  const { data: srcFull } = await supabase
    .from('bookings')
    .select(
      'tracking_number, tracking_url, tracking_carrier, sendcloud_parcel_id, label_url, return_tracking_number, return_tracking_url, return_tracking_carrier, return_label_url',
    )
    .eq('id', id)
    .maybeSingle();
  if (srcFull) {
    await propagateShipmentFields(supabase, id, srcFull as Record<string, unknown>);
  }

  await logAudit({
    action: 'booking.link_shipment',
    entityType: 'booking',
    entityId: id,
    changes: { target_id: targetId, group_id: finalGroupId, members: [...memberIds] },
    request: req,
  });

  const siblings = await loadShipmentGroupSiblings(supabase, id);
  return NextResponse.json({ success: true, siblings });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = createServiceClient();

  const { data: booking, error } = await supabase
    .from('bookings')
    .select('id, shipment_group_id')
    .eq('id', id)
    .maybeSingle();
  if (error && /shipment_group_id/i.test(error.message || '')) {
    return NextResponse.json(
      { error: 'Migration `supabase-bookings-shipment-group.sql` steht noch aus.' },
      { status: 503 },
    );
  }
  if (!booking) {
    return NextResponse.json({ error: 'Buchung nicht gefunden.' }, { status: 404 });
  }
  const gid = (booking as { shipment_group_id: string | null }).shipment_group_id;
  if (!gid) {
    return NextResponse.json({ success: true, siblings: [] });
  }

  await supabase.from('bookings').update({ shipment_group_id: null }).eq('id', id);

  // Bleibt nur noch EIN Mitglied in der Gruppe übrig, ist die Verknüpfung
  // ohnehin sinnlos geworden — auflösen, damit die Gruppen-ID nicht verwaist.
  const { data: remaining } = await supabase.from('bookings').select('id').eq('shipment_group_id', gid);
  if (remaining && remaining.length === 1) {
    await supabase.from('bookings').update({ shipment_group_id: null }).eq('id', remaining[0].id);
  }

  await logAudit({
    action: 'booking.unlink_shipment',
    entityType: 'booking',
    entityId: id,
    changes: { group_id: gid },
    request: req,
  });

  return NextResponse.json({ success: true, siblings: [] });
}
