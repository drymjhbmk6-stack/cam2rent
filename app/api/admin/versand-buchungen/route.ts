import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

/**
 * GET /api/admin/versand-buchungen
 * Gibt alle Versand-Buchungen zurück (confirmed + shipped).
 * Inkl. vollständiger Felder für Fulfillment-Hub.
 */
export async function GET() {
  const supabase = createServiceClient();

  const { data: bookings, error } = await supabase
    .from('bookings')
    .select(
      'id, product_id, product_name, rental_from, rental_to, days, customer_name, customer_email, user_id, shipping_method, shipping_address, status, tracking_number, tracking_url, shipped_at, accessories, haftung, price_total, deposit, return_condition, return_notes, returned_at, created_at, label_url, return_label_url, unit_id, pack_status'
    )
    .eq('delivery_mode', 'versand')
    .in('status', ['confirmed', 'shipped'])
    .order('rental_from', { ascending: true });

  if (error) {
    console.error('versand-buchungen error:', error);
    return NextResponse.json({ bookings: [] });
  }

  // Seriennummern für zugeordnete Units laden — bevorzugt aus inventar_units
  // (neue Welt) ueber migration_audit. Fallback auf product_units.
  const unitIds = (bookings ?? []).map((b) => b.unit_id).filter(Boolean) as string[];
  const unitMap: Record<string, string> = {};
  if (unitIds.length > 0) {
    try {
      const { data: auditRows } = await supabase
        .from('migration_audit')
        .select('alte_id, neue_id')
        .eq('alte_tabelle', 'product_units')
        .eq('neue_tabelle', 'inventar_units')
        .in('alte_id', unitIds);
      const auditMap = new Map<string, string>();
      for (const row of (auditRows ?? []) as Array<{ alte_id: string; neue_id: string }>) {
        auditMap.set(row.alte_id, row.neue_id);
      }
      if (auditMap.size > 0) {
        const { data: invUnits } = await supabase
          .from('inventar_units')
          .select('id, seriennummer, inventar_code')
          .in('id', Array.from(auditMap.values()));
        const invById = new Map<string, { seriennummer: string | null; inventar_code: string | null }>();
        for (const u of (invUnits ?? []) as Array<{ id: string; seriennummer: string | null; inventar_code: string | null }>) {
          invById.set(u.id, { seriennummer: u.seriennummer, inventar_code: u.inventar_code });
        }
        for (const [legacyId, neueId] of auditMap.entries()) {
          const inv = invById.get(neueId);
          if (inv) unitMap[legacyId] = inv.seriennummer ?? inv.inventar_code ?? '';
        }
      }
    } catch {
      // migration_audit fehlt — Fallback unten greift fuer alle
    }
    // Fuer alle unit_ids ohne Inventar-Eintrag: alte product_units lesen.
    const missing = unitIds.filter((u) => !unitMap[u]);
    if (missing.length > 0) {
      const { data: units } = await supabase
        .from('product_units')
        .select('id, serial_number')
        .in('id', missing);
      for (const u of (units ?? []) as Array<{ id: string; serial_number: string }>) {
        unitMap[u.id] = u.serial_number;
      }
    }
  }

  // Verification-Flags defensiv nachladen (nur falls Migration bereits durch ist).
  // Faellt sauber zurueck auf leere Map wenn Spalten noch nicht existieren.
  const bookingIds = (bookings ?? []).map((b) => b.id);
  const verifyMap: Record<string, { verification_required: boolean; verification_gate_passed_at: string | null }> = {};
  if (bookingIds.length > 0) {
    try {
      const { data: verifyRows, error: verifyErr } = await supabase
        .from('bookings')
        .select('id, verification_required, verification_gate_passed_at')
        .in('id', bookingIds);
      if (!verifyErr && verifyRows) {
        for (const row of verifyRows) {
          verifyMap[row.id] = {
            verification_required: !!row.verification_required,
            verification_gate_passed_at: row.verification_gate_passed_at ?? null,
          };
        }
      }
    } catch {
      // Migration noch nicht durch — Felder existieren nicht, OK
    }
  }

  // Kunden-Verifizierungs-Status defensiv zu jeder Buchung holen
  const userIds = [...new Set((bookings ?? []).map((b) => b.user_id).filter(Boolean))] as string[];
  const profileMap: Record<string, string> = {};
  if (userIds.length > 0) {
    try {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, verification_status')
        .in('id', userIds);
      if (profiles) {
        for (const p of profiles) profileMap[p.id] = p.verification_status ?? 'unverified';
      }
    } catch {
      // ignore
    }
  }

  const enriched = (bookings ?? []).map((b) => {
    const v = verifyMap[b.id];
    const profileStatus = b.user_id ? profileMap[b.user_id] : null;
    return {
      ...b,
      serial_number: b.unit_id ? unitMap[b.unit_id] ?? null : null,
      verification_required: v?.verification_required ?? false,
      verification_gate_passed_at: v?.verification_gate_passed_at ?? null,
      customer_verification_status: profileStatus,
    };
  });

  return NextResponse.json({ bookings: enriched });
}
