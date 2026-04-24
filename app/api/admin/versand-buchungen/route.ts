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

  // Seriennummern für zugeordnete Units laden
  const unitIds = (bookings ?? []).map((b) => b.unit_id).filter(Boolean);
  let unitMap: Record<string, string> = {};
  if (unitIds.length > 0) {
    const { data: units } = await supabase
      .from('product_units')
      .select('id, serial_number')
      .in('id', unitIds);
    if (units) {
      unitMap = Object.fromEntries(units.map((u) => [u.id, u.serial_number]));
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
