/**
 * Adress-Aufloesung fuer Buchungen.
 *
 * Quellen-Reihenfolge (hoechste Prioritaet zuerst):
 *  1. Per-Order-Override (im Checkout fuer diese Buchung eingegeben)
 *  2. Abweichende Standard-Adresse aus dem Profil (delivery_* / billing_*)
 *  3. Haupt-Adresse aus dem Profil (address_*) — nur fuer die Lieferadresse
 *
 * Die Rechnungsadresse faellt ohne Override/Standard auf `null` zurueck — der
 * Rechnungs-Builder nutzt dann seinerseits die Lieferadresse bzw. die
 * Profil-Hauptadresse (siehe lib/build-invoice-data.ts).
 */

import type { SupabaseClient } from '@supabase/supabase-js';

const FULL_ADDRESS_COLS =
  'address_street, address_zip, address_city, ' +
  'delivery_name, delivery_street, delivery_zip, delivery_city, ' +
  'billing_name, billing_street, billing_zip, billing_city';

/**
 * Laedt die Adress-Spalten eines Profils inkl. der abweichenden Liefer-/
 * Rechnungsadresse. Defensiver Retry ohne die abweichenden Spalten
 * (delivery_, billing_), falls die Migration
 * `supabase-profiles-deviating-addresses.sql` noch nicht gelaufen ist (sonst
 * wuerde ein Schema-Fehler auch die Hauptadresse verlieren).
 */
export async function loadProfileAddressRow(
  supabase: SupabaseClient,
  userId: string,
): Promise<ProfileAddressRow | null> {
  const first = await supabase.from('profiles').select(FULL_ADDRESS_COLS).eq('id', userId).maybeSingle();
  if (!first.error) return (first.data as ProfileAddressRow) ?? null;
  if (/column|schema cache|PGRST|42703/i.test(first.error.message ?? '')) {
    const retry = await supabase
      .from('profiles')
      .select('address_street, address_zip, address_city')
      .eq('id', userId)
      .maybeSingle();
    return (retry.data as ProfileAddressRow) ?? null;
  }
  return null;
}

export interface ProfileAddressRow {
  address_street?: string | null;
  address_zip?: string | null;
  address_city?: string | null;
  delivery_name?: string | null;
  delivery_street?: string | null;
  delivery_zip?: string | null;
  delivery_city?: string | null;
  billing_name?: string | null;
  billing_street?: string | null;
  billing_zip?: string | null;
  billing_city?: string | null;
}

/** Baut "Strasse, PLZ Ort" — leere Teile werden weggelassen, leer => null. */
export function formatAddress(
  street?: string | null,
  zip?: string | null,
  city?: string | null,
): string | null {
  const s = (street ?? '').trim();
  const z = (zip ?? '').trim();
  const c = (city ?? '').trim();
  const line2 = [z, c].filter(Boolean).join(' ');
  const out = [s, line2].filter(Boolean).join(', ');
  return out || null;
}

/** Wie formatAddress, aber mit optionalem Namen als erster Zeile. */
export function formatNamedAddress(
  name?: string | null,
  street?: string | null,
  zip?: string | null,
  city?: string | null,
): string | null {
  const n = (name ?? '').trim();
  const rest = formatAddress(street, zip, city);
  if (!rest) return null;
  return n ? `${n}, ${rest}` : rest;
}

/**
 * Lieferadresse fuer eine Buchung.
 * @param perOrder bereits formatierte, im Checkout eingegebene Adresse (oder null)
 */
export function resolveShippingAddress(
  profile: ProfileAddressRow | null | undefined,
  perOrder?: string | null,
): string | null {
  const over = (perOrder ?? '').trim();
  if (over) return over;
  if (profile) {
    const dev = formatAddress(profile.delivery_street, profile.delivery_zip, profile.delivery_city);
    if (dev) return dev;
    const main = formatAddress(profile.address_street, profile.address_zip, profile.address_city);
    if (main) return main;
  }
  return null;
}

/**
 * Abweichende Rechnungsadresse (Empfaenger + Adresse) fuer eine Buchung.
 * Reihenfolge: Per-Order-Override > Profil-Standard (billing_*) > null.
 * `null` bedeutet: keine abweichende Rechnungsadresse -> Default-Verhalten.
 */
export function resolveInvoiceAddress(
  profile: ProfileAddressRow | null | undefined,
  perOrder?: { name?: string | null; address?: string | null } | null,
): { invoice_name: string | null; invoice_address: string | null } | null {
  const oName = (perOrder?.name ?? '').trim();
  const oAddr = (perOrder?.address ?? '').trim();
  if (oAddr) {
    return { invoice_name: oName || null, invoice_address: oAddr };
  }
  if (profile) {
    const addr = formatAddress(profile.billing_street, profile.billing_zip, profile.billing_city);
    if (addr) {
      return { invoice_name: (profile.billing_name ?? '').trim() || null, invoice_address: addr };
    }
  }
  return null;
}
