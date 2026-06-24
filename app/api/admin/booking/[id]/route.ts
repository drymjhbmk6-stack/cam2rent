import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';
import { sendCancellationConfirmation, sendAdminCancellationNotification, sendAndLog, sendShippingConfirmation } from '@/lib/email';
import { buildTrackingUrl, isAllowedCarrier, type TrackingCarrier } from '@/lib/tracking-url';
import { releaseAccessoryUnitsFromBooking } from '@/lib/accessory-unit-assignment';
import { dispatchCompletionEmail } from '@/lib/booking-completion-email';
import { getStripe, buildPaymentDescription } from '@/lib/stripe';
import { DEFAULT_HAFTUNG, DEFAULT_SHIPPING, getEigenbeteiligung, calcHaftungTieredPrice, type HaftungConfig } from '@/lib/price-config';
import { computeReplacementValue, loadReplacementValueConfig } from '@/lib/replacement-value';
import { getInventarWbwByLegacyUnitIds, getInventarWbwForBookingAccessories, getInventarWbwAverageByLegacyProductId } from '@/lib/inventar/wbw-bridge';
import { resolveBookingCameras, buildCameraSkeleton, type DesiredCamera } from '@/lib/booking-cameras';
import { getProducts } from '@/lib/get-products';
import { parseWeightToGrams, computePackWeightKg } from '@/lib/pack-weight';
import { resolveAccessoryItems, applyAccessoryComposition, type ResolvedItem } from '@/lib/booking-accessory-apply';
import { getPriceForDays } from '@/data/products';
import { calcShipping } from '@/data/shipping';
import { assignCamerasToBooking } from '@/lib/camera-unit-assignment';
import { assignUnitToBooking } from '@/lib/unit-assignment';
import { createAdminNotification } from '@/lib/admin-notifications';
import { buildBookingAdjustmentEmail } from '@/lib/booking-adjustment-email';
import { getSiteUrl } from '@/lib/env-mode';
import { RESERVING_BOOKING_STATUSES } from '@/lib/booking-statuses';
import { snapshotInvoiceVersion } from '@/lib/invoice-versions';
import { sanitizeOverrideDate } from '@/lib/booking-buffer';
import { createCancellationCreditNote, dispatchCreditNoteDocument } from '@/lib/buchhaltung/credit-note-document';

const PACK_RESET_FIELDS = {
  pack_status: null,
  pack_packed_by: null,
  pack_packed_by_user_id: null,
  pack_packed_at: null,
  pack_packed_signature: null,
  pack_packed_items: null,
  pack_packed_condition: null,
  pack_checked_by: null,
  pack_checked_by_user_id: null,
  pack_checked_at: null,
  pack_checked_signature: null,
  pack_checked_items: null,
  pack_checked_notes: null,
  pack_photo_url: null,
} as const;

/**
 * Pack-Workflow-Snapshot zuruecksetzen, wenn die Buchungs-Komposition
 * geaendert wird — die 4-Augen-Signaturen wuerden sonst den ALTEN Inhalt
 * bescheinigen. Packliste-PDF/HTML liest live aus accessory_items und zieht
 * automatisch nach. Gibt die zu mergenden Update-Felder zurueck (leer wenn
 * nichts zurueckgesetzt wird) und loescht best-effort das Pack-Foto.
 *
 * WICHTIG: Ein bereits ABGESCHLOSSENER Pack-Vorgang (pack_status='checked',
 * d.h. Packer + Kontrolleur haben unterschrieben / 4-Augen erledigt) wird
 * NICHT zurueckgesetzt. Die unterschriebene Packliste ist der Nachweis
 * dessen, was physisch tatsaechlich gepackt wurde — eine spaetere
 * Buchungs-Aenderung darf diesen abgeschlossenen Nachweis nicht
 * rueckwirkend loeschen. Nur ein UNFERTIGER Snapshot ('packed' /
 * Zwischenstand) wird zurueckgesetzt, weil er sonst falschen Inhalt
 * bescheinigen wuerde. Die neue Komposition fliesst ueber die live
 * gerenderte Packliste-PDF/HTML ohnehin nach.
 */
async function resetPackWorkflow(
  supabase: ReturnType<typeof createServiceClient>,
  booking: { pack_status?: unknown; pack_photo_url?: unknown },
): Promise<Record<string, unknown>> {
  const ps = booking.pack_status;
  if (!ps || ps === 'checked') return {};
  if (booking.pack_photo_url) {
    await supabase.storage
      .from('packing-photos')
      .remove([booking.pack_photo_url as string])
      .catch(() => { /* best-effort */ });
  }
  return { ...PACK_RESET_FIELDS };
}

/**
 * Zaehlt, wieviele physische Kameras des Produkts im Zeitraum bereits durch
 * ANDERE reservierende Buchungen belegt sind (Multi-Kamera-aware, Legacy-
 * Fallback ueber product_name-Split). Spiegelt /api/availability — wird als
 * harter Pre-Check vor einer Mietzeitraum-/Kamera-Aenderung genutzt.
 */
async function reservedCameraCount(
  supabase: ReturnType<typeof createServiceClient>,
  productId: string,
  from: string,
  to: string,
  excludeBookingId: string,
  isTest: boolean,
): Promise<number> {
  const sel = 'id, product_id, product_name, unit_id, cameras, status';
  let q1 = supabase
    .from('bookings')
    .select(sel)
    .eq('product_id', productId)
    .in('status', [...RESERVING_BOOKING_STATUSES])
    .neq('id', excludeBookingId)
    .lte('rental_from', to)
    .gte('rental_to', from);
  let q2 = supabase
    .from('bookings')
    .select(sel)
    .contains('cameras', [{ product_id: productId }])
    .in('status', [...RESERVING_BOOKING_STATUSES])
    .neq('id', excludeBookingId)
    .lte('rental_from', to)
    .gte('rental_to', from);
  if (!isTest) {
    q1 = q1.not('is_test', 'is', true);
    q2 = q2.not('is_test', 'is', true);
  }
  const [r1, r2] = await Promise.all([q1, q2]);
  const byId = new Map<string, Record<string, unknown>>();
  for (const b of [...(r1.data ?? []), ...(r2.error ? [] : r2.data ?? [])]) {
    byId.set((b as { id: string }).id, b as Record<string, unknown>);
  }
  let count = 0;
  for (const b of byId.values()) {
    const cams = resolveBookingCameras(b);
    count += cams.filter((c) => (c.product_id ?? (b.product_id as string | null)) === productId).length;
  }
  return count;
}

/**
 * GET /api/admin/booking/[id]
 * Gibt eine einzelne Buchung mit allen Feldern + Kundenprofil +
 * Vertragsdaten (rental_agreements) + E-Mail-Verlauf (email_log) zurück.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createServiceClient();

  const { data: booking, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    return NextResponse.json({ error: 'Buchung nicht gefunden.' }, { status: 404 });
  }

  // Seriennummer pro Kamera-Einheit auflösen — bevorzugt aus inventar_units
  // (neue Welt) via migration_audit-Mapping, Fallback product_units.
  const resolveSerialForUnit = async (unitId: string): Promise<string | null> => {
    try {
      const { data: audit } = await supabase
        .from('migration_audit')
        .select('neue_id')
        .eq('alte_tabelle', 'product_units')
        .eq('alte_id', unitId)
        .eq('neue_tabelle', 'inventar_units')
        .maybeSingle();
      if ((audit as { neue_id?: string } | null)?.neue_id) {
        const { data: invUnit } = await supabase
          .from('inventar_units')
          .select('seriennummer, inventar_code, bezeichnung')
          .eq('id', (audit as { neue_id: string }).neue_id)
          .maybeSingle();
        const u = invUnit as { seriennummer: string | null; inventar_code: string | null; bezeichnung: string } | null;
        const s = u?.seriennummer ?? u?.inventar_code ?? u?.bezeichnung ?? null;
        if (s) return s;
      }
    } catch {
      // migration_audit fehlt → Fallback
    }
    const { data: unit } = await supabase
      .from('product_units')
      .select('serial_number')
      .eq('id', unitId)
      .maybeSingle();
    return unit?.serial_number ?? null;
  };

  // Multi-Kamera: pro physischer Kamera eigene Seriennummer. Legacy /
  // cameras=NULL → Resolver liefert eine Kamera = bisheriges Verhalten.
  const bookingCameras = resolveBookingCameras(booking);
  const camerasResolved = await Promise.all(
    bookingCameras.map(async (c) => ({
      product_id: c.product_id,
      product_name: c.product_name,
      unit_id: c.unit_id,
      serial_number: c.unit_id ? await resolveSerialForUnit(c.unit_id) : null,
    })),
  );
  booking.cameras_resolved = camerasResolved;
  booking.serial_number =
    camerasResolved.find((c) => c.serial_number)?.serial_number ?? null;

  // Zubehoer + Sets aufloesen — fuer Packliste, Uebergabeprotokoll, Vertrag.
  // accessory_items hat Vorrang (qty-aware), sonst accessories[] mit qty=1.
  // Fuer jedes Element wird der Name aus accessories ODER sets aufgeloest.
  // Bei Sets werden zusaetzlich die enthaltenen accessory_items expandiert,
  // damit die Packliste das vollstaendige Inventar zeigt.
  // included_parts (Bestandteile) werden mitgeladen — Pack-Workflow zeigt sie
  // als Hinweis an, sie sind kein eigenes Inventar.
  const rawItems: { accessory_id: string; qty: number }[] = Array.isArray(booking.accessory_items) && booking.accessory_items.length > 0
    ? (booking.accessory_items as { accessory_id: string; qty: number }[])
    : (Array.isArray(booking.accessories) ? booking.accessories as string[] : []).map((aid) => ({ accessory_id: aid, qty: 1 }));

  // Set-Default in Upgrade-Gruppe ausblenden, wenn der Kunde in derselben
  // Gruppe eine Upgrade-Variante direkt gewaehlt hat (z.B. Basic-Set enthaelt
  // 128 GB, Buchung hat 512 GB als eigenes Item → 128 GB faellt aus Packliste/
  // Uebergabe/Retoure raus). Gleiche Logik wie applyAccessoryComposition.
  const skipUpgradeGroups = new Set<string>();
  if (rawItems.length > 0) {
    const rawIds = [...new Set(rawItems.map((r) => r.accessory_id))];
    try {
      const { data: setRows } = await supabase.from('sets').select('id').in('id', rawIds);
      const setIds = new Set((setRows ?? []).map((s) => s.id as string));
      const directAccIds = rawIds.filter((id) => !setIds.has(id));
      if (directAccIds.length > 0 && setIds.size > 0) {
        const { data: directAccs } = await supabase
          .from('accessories')
          .select('id, upgrade_group')
          .in('id', directAccIds);
        for (const a of directAccs ?? []) {
          const g = (a.upgrade_group as string | null) ?? null;
          if (g) skipUpgradeGroups.add(g);
        }
      }
    } catch {
      // upgrade_group-Spalte fehlt → kein Skip, Default-Verhalten.
    }
  }

  const resolved = await resolveAccessoryItems(
    supabase,
    rawItems,
    skipUpgradeGroups.size > 0 ? { skipUpgradeGroups } : undefined,
  );
  booking.resolved_items = resolved;

  // Zubehoer-Exemplar-Codes laden — fuer den Scanner-Workflow auf der Pack-
  // Seite, damit ein gescannter Code direkt einem accessory_id zugeordnet
  // werden kann. Defensiv bei fehlender Spalte / leeren UUIDs.
  type UnitCode = { id: string; accessory_id: string; exemplar_code: string };
  let unitCodes: UnitCode[] = [];
  const accUnitIds: string[] = Array.isArray(booking.accessory_unit_ids)
    ? (booking.accessory_unit_ids as string[]).filter(Boolean)
    : [];
  if (accUnitIds.length > 0) {
    try {
      const { data: units } = await supabase
        .from('accessory_units')
        .select('id, accessory_id, exemplar_code')
        .in('id', accUnitIds);
      unitCodes = (units ?? []) as UnitCode[];
    } catch {
      // Tabelle fehlt (Migration nicht durch) — Scanner-Match laeuft dann
      // nur fuer Kamera-Seriennummer, nicht fuer Zubehoer.
    }
  }
  booking.unit_codes = unitCodes;

  // Paketgewicht-Schaetzung fuer den Versand-Workflow: Kamera-Gewicht
  // (Produkt-Spec `weight`) + Zubehoer-Gewicht (accessories.specs.weight_g).
  // Defensiv: fehlen Specs/Spalten, bleibt der Anteil 0; bei komplett
  // unbekannten Gewichten liefert computePackWeightKg() null.
  try {
    const leafAccIds = [...new Set(
      (resolved as ResolvedItem[])
        .filter((r) => r.accessory_id)
        .map((r) => r.accessory_id as string),
    )];
    const accWeightById: Record<string, number> = {};
    if (leafAccIds.length > 0) {
      const accSpecs = await supabase
        .from('accessories')
        .select('id, specs')
        .in('id', leafAccIds);
      for (const a of accSpecs.data ?? []) {
        const w = (a as { specs?: { weight_g?: number } | null }).specs?.weight_g;
        if (typeof w === 'number' && w > 0) accWeightById[(a as { id: string }).id] = w;
      }
    }
    const accessoriesForWeight = (resolved as ResolvedItem[])
      .filter((r) => r.accessory_id)
      .map((r) => ({ grams: accWeightById[r.accessory_id as string] ?? 0, qty: r.qty }));

    let cameraGrams: number[] = [];
    try {
      const products = await getProducts();
      const weightByPid: Record<string, number> = {};
      for (const p of products) {
        const g = parseWeightToGrams((p.specs as { weight?: string } | undefined)?.weight);
        if (g > 0) weightByPid[p.id] = g;
      }
      cameraGrams = (camerasResolved ?? []).map((c) =>
        c.product_id ? (weightByPid[c.product_id] ?? 0) : 0,
      );
    } catch { /* Produkt-Load fehlgeschlagen → Kamera-Anteil 0 */ }

    booking.pack_weight_estimate_kg = computePackWeightKg({
      cameraGrams,
      accessories: accessoriesForWeight,
    });
  } catch {
    booking.pack_weight_estimate_kg = null;
  }

  // Kundenprofil laden
  let customer = null;
  if (booking.user_id) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, full_name, email, phone, address_street, address_zip, address_city, blacklisted, verification_status')
      .eq('id', booking.user_id)
      .maybeSingle();
    customer = profile;
  }

  // Vertragsdaten laden (rental_agreements)
  let agreement = null;
  const { data: agreementData } = await supabase
    .from('rental_agreements')
    .select('id, pdf_url, contract_hash, signed_by_name, signed_at, ip_address, signature_method, created_at')
    .eq('booking_id', id)
    .maybeSingle();
  if (agreementData) agreement = agreementData;

  // Self-Heal Stufe 1: rental_agreements existiert, aber bookings.contract_signed
  // ist false (storeContract zwischen Step 3 und Step 4 abgebrochen, oder
  // after()-Race) → beide Datenpunkte synchronisieren.
  if (agreement && !booking.contract_signed) {
    await supabase
      .from('bookings')
      .update({
        contract_signed: true,
        contract_signed_at: agreement.signed_at,
      })
      .eq('id', id);
    booking.contract_signed = true;
    booking.contract_signed_at = agreement.signed_at;
  }

  // Self-Heal Stufe 2: Kein agreements-Eintrag, aber das PDF liegt schon im
  // Storage. Passiert wenn der after()-Block storeContract gestartet hat und
  // der Storage-Upload durchging, der DB-Insert in rental_agreements aber nicht
  // mehr (Container-Restart, RLS-Hiccup). Wir tragen den Eintrag nach und
  // synchronisieren contract_signed.
  if (!agreement && !booking.contract_signed) {
    // Berlin-Jahr berechnen — storeContract nutzt es ebenfalls. Plus Vorjahr
    // als Fallback für Buchungen rund um Silvester.
    const berlinYear = parseInt(
      new Date().toLocaleDateString('en-CA', { year: 'numeric', timeZone: 'Europe/Berlin' }),
      10,
    );
    for (const year of [berlinYear, berlinYear - 1]) {
      const path = `${year}/${id}.pdf`;
      const { data: file } = await supabase.storage.from('contracts').download(path);
      if (!file) continue;
      // PDF gefunden → agreements-Row + contract_signed nachtragen.
      const signedAt = booking.created_at || new Date().toISOString();
      const signerName = booking.contract_signer_name || booking.customer_name || 'Unbekannt';
      const { data: inserted } = await supabase
        .from('rental_agreements')
        .insert({
          booking_id: id,
          pdf_url: `contracts/${path}`,
          contract_hash: 'restored-from-storage',
          signed_by_name: signerName,
          signed_at: signedAt,
          ip_address: 'unknown',
          signature_method: 'canvas',
        })
        .select('id, pdf_url, contract_hash, signed_by_name, signed_at, ip_address, signature_method, created_at')
        .single();
      if (inserted) {
        agreement = inserted;
        await supabase
          .from('bookings')
          .update({ contract_signed: true, contract_signed_at: signedAt })
          .eq('id', id);
        booking.contract_signed = true;
        booking.contract_signed_at = signedAt;
        console.log('[booking-detail] Storage-Scan-Self-Heal erfolgreich für', id, path);
      }
      break;
    }
  }

  // E-Mail-Verlauf laden (email_log)
  const { data: emails } = await supabase
    .from('email_log')
    .select('id, email_type, subject, status, customer_email, resend_message_id, error_message, created_at')
    .eq('booking_id', id)
    .order('created_at', { ascending: false })
    .limit(20);

  // Wiederbeschaffungswert + Haftungsgrenze (intern fuer Admin)
  booking.liability_summary = await computeLiabilitySummary(supabase, booking, resolved);

  // Zahlungsstatus — gleiche Logik wie der Bezahlt-Haken im Dashboard:
  //  1. Stripe-Abgleich (echter Zahlungseingang),
  //  2. Buchhaltung (invoices auf bezahlt),
  //  3. Fallback aus payment_intent_id-Prefix + Status.
  try {
    const piId = String(booking.payment_intent_id ?? '');
    const stLower = String(booking.status ?? '').toLowerCase();
    const isUnpaidDerived =
      /MANUAL-UNPAID/i.test(piId) ||
      /^PENDING-/i.test(piId) ||
      stLower === 'awaiting_payment' ||
      stLower === 'pending_verification';
    const [stripeRes, invRes] = await Promise.all([
      supabase
        .from('stripe_transactions')
        .select('id')
        .eq('booking_id', id)
        .in('match_status', ['matched', 'manual'])
        .limit(1),
      supabase
        .from('invoices')
        .select('id')
        .eq('booking_id', id)
        .or('status.eq.paid,payment_status.eq.paid')
        .limit(1),
    ]);
    const paidViaStripe = (stripeRes.data?.length ?? 0) > 0;
    const paidViaInvoice = (invRes.data?.length ?? 0) > 0;
    booking.paid = paidViaStripe || paidViaInvoice || !isUnpaidDerived;
    booking.paid_via = paidViaStripe ? 'stripe' : paidViaInvoice ? 'invoice' : !isUnpaidDerived ? 'derived' : null;
  } catch {
    booking.paid = null;
    booking.paid_via = null;
  }

  return NextResponse.json({ booking, customer, agreement, emails: emails ?? [] });
}

/**
 * Berechnet pro Buchung den realen Wiederbeschaffungswert (Kamera +
 * jedes Zubehoer) und wieviel der Kunde maximal haftet (je nach
 * gewaehlter Schadenspauschale).
 *
 * Quellen:
 *   - Kamera-WBW: assets.replacement_value_estimate (mit Vorrang) ODER
 *     assets.current_value via product_units.id, Fallback product.deposit
 *   - Zubehoer-WBW pro Position:
 *     a) wenn accessory_unit_ids gesetzt: assets pro accessory_unit_id
 *     b) sonst: accessories.replacement_value pro accessory_id × qty
 */
async function computeLiabilitySummary(
  supabase: ReturnType<typeof createServiceClient>,
  booking: Record<string, unknown>,
  resolvedItems: Array<{ id: string; name: string; qty: number; isFromSet?: boolean; setName?: string }>,
) {
  type Line = { name: string; qty: number; unit_value: number; total_value: number; source: 'asset' | 'accessory_replacement' | 'product_deposit' | 'unknown' };

  // Manuelle Anpassung (intern, NUR fuer diese Box). Aendert nichts an der
  // echten Buchung — bestimmt nur, welche Katalog-Kamera bzw. welches
  // Zubehoer fuer die Wiederbeschaffungswert-Berechnung herangezogen wird.
  const override = booking.liability_override && typeof booking.liability_override === 'object'
    ? booking.liability_override as { camera_product_id?: string | null; accessories?: { id: string; qty: number }[] | null }
    : null;

  // admin_config.products — fuer Override-Kamera (Name/Kaution/Kategorie)
  // und fuer die Eigenbeteiligungs-Kategorie weiter unten.
  const { data: cfgRow } = await supabase
    .from('admin_config')
    .select('products')
    .eq('id', 1)
    .maybeSingle();
  const allProducts = Array.isArray(cfgRow?.products)
    ? cfgRow!.products as Array<{ id: string; name?: string; deposit?: number; category?: string }>
    : [];

  const cameraOverridden = !!(override?.camera_product_id && override.camera_product_id !== booking.product_id);
  const overrideProduct = cameraOverridden
    ? allProducts.find((p) => p.id === override!.camera_product_id)
    : undefined;

  const cameraId = cameraOverridden ? override!.camera_product_id! : booking.product_id as string;
  const cameraName = cameraOverridden ? (overrideProduct?.name ?? cameraId) : booking.product_name as string;
  const productDeposit = cameraOverridden
    ? Number(overrideProduct?.deposit ?? 0)
    : Number(booking.deposit ?? 0);
  const haftung = (booking.haftung as string | null) ?? null;

  // 1. Kamera-WBW pro physischer Kamera (linear -> Floor).
  // Pro Kamera wird DEREN eigene unit_id aufgelöst (Asset → Inventar-Unit →
  // Inventar-Schnitt je Produkt → Kaution). Gemischte Modelle bekommen so
  // jeweils ihren echten Wert. Bei Override (interne Box) genau eine Zeile
  // ohne unit_id-Pfad (die unit_id gehört zur Original-Kamera).
  const wbwConfig = await loadReplacementValueConfig(supabase);

  const resolveCamWbw = async (
    unitId: string | null,
    pid: string | null,
    deposit: number,
  ): Promise<{ value: number; source: Line['source'] }> => {
    let value = 0;
    let source: Line['source'] = 'unknown';
    if (unitId) {
      const primary = await supabase
        .from('assets')
        .select('purchase_price, purchase_date, current_value, replacement_value_estimate')
        .eq('unit_id', unitId)
        .eq('status', 'active')
        .maybeSingle();
      let row: { purchase_price?: number | null; purchase_date?: string | null; current_value?: number | null; replacement_value_estimate?: number | null } | null = primary.data;
      if (primary.error && /replacement_value_estimate/i.test(primary.error.message)) {
        const fb = await supabase
          .from('assets')
          .select('purchase_price, purchase_date, current_value')
          .eq('unit_id', unitId)
          .eq('status', 'active')
          .maybeSingle();
        row = fb.data;
      }
      if (row && row.purchase_date && row.purchase_price != null) {
        value = computeReplacementValue({
          purchase_price: row.purchase_price,
          purchase_date: row.purchase_date,
          replacement_value_estimate: row.replacement_value_estimate ?? null,
        }, wbwConfig);
        source = 'asset';
      }
      if (value === 0) {
        try {
          const m = await getInventarWbwByLegacyUnitIds(supabase, [unitId], 'product_units');
          const v = m.get(unitId);
          if (v && v > 0) { value = v; source = 'asset'; }
        } catch { /* nächster Fallback */ }
      }
    }
    if (value === 0 && pid) {
      try {
        const avg = await getInventarWbwAverageByLegacyProductId(supabase, pid);
        if (avg && avg > 0) { value = avg; source = 'asset'; }
      } catch { /* Deposit-Fallback */ }
    }
    if (value === 0) {
      value = deposit;
      source = deposit > 0 ? 'product_deposit' : 'unknown';
    }
    return { value, source };
  };

  let cameraLines: Line[];
  if (cameraOverridden) {
    const { value, source } = await resolveCamWbw(null, cameraId, productDeposit);
    cameraLines = [{
      name: String(cameraName), qty: 1,
      unit_value: value, total_value: value, source,
    }];
  } else {
    const cams = resolveBookingCameras(booking);
    cameraLines = await Promise.all(
      cams.map(async (c) => {
        const pid = c.product_id ?? (booking.product_id as string | null) ?? null;
        const dep = pid
          ? Number(allProducts.find((p) => p.id === pid)?.deposit ?? booking.deposit ?? 0)
          : Number(booking.deposit ?? 0);
        const { value, source } = await resolveCamWbw(c.unit_id, pid, dep);
        return {
          name: c.product_name, qty: 1,
          unit_value: value, total_value: value, source,
        } as Line;
      }),
    );
    if (cameraLines.length === 0) {
      const { value, source } = await resolveCamWbw(
        (booking.unit_id as string | null) ?? null, cameraId, productDeposit,
      );
      cameraLines = [{
        name: String(cameraName), qty: 1,
        unit_value: value, total_value: value, source,
      }];
    }
  }
  const cameraLine: Line = cameraLines[0];

  // 2. Zubehoer + Sets (auf Sub-Items expandiert) → Set-Container ueberspringen,
  // weil wir die Sub-Items mitgezaehlt haben (vermeidet Doppelzaehlung).
  // Bei Override-Zubehoer wird die manuell gewaehlte Liste statt der
  // echten Buchungs-Positionen aufgeloest (nur fuer diese Box).
  const accessoriesOverridden = Array.isArray(override?.accessories);
  const effectiveResolved = accessoriesOverridden
    ? await resolveAccessoryItems(
        supabase,
        (override!.accessories ?? []).map((a) => ({ accessory_id: a.id, qty: a.qty })),
      )
    : resolvedItems;
  const setContainerNames = new Set(
    effectiveResolved.filter((i) => i.isFromSet).map((i) => i.setName ?? ''),
  );
  const physicalAccItems = effectiveResolved.filter((i) => !setContainerNames.has(i.name) || i.isFromSet);

  const accIds = [...new Set(physicalAccItems.map((i) => i.id))];

  // Asset-Lookup ueber accessory_unit_ids (genauer, wenn vorhanden).
  // Ergebnis: Map accessory_id -> Liste aller Asset-Werte (= Anzahl Units mit Asset).
  // Bei Override-Zubehoer keine exemplar-genaue Asset-Aufloesung — die
  // accessory_unit_ids gehoeren zur Original-Buchung, nicht zur manuellen
  // Auswahl. Dann zaehlt der accessories.replacement_value / Inventar-Pfad.
  const accUnitIds: string[] = !accessoriesOverridden && Array.isArray(booking.accessory_unit_ids)
    ? (booking.accessory_unit_ids as string[]).filter(Boolean)
    : [];
  const assetValuesPerAccId = new Map<string, number[]>();
  if (accUnitIds.length > 0) {
    const { data: units } = await supabase
      .from('accessory_units')
      .select('id, accessory_id')
      .in('id', accUnitIds);
    const unitToAcc = new Map<string, string>();
    for (const u of units ?? []) unitToAcc.set(u.id as string, u.accessory_id as string);

    const primary = await supabase
      .from('assets')
      .select('accessory_unit_id, purchase_price, purchase_date, current_value, replacement_value_estimate')
      .in('accessory_unit_id', accUnitIds)
      .eq('status', 'active');
    type AssetRow = { accessory_unit_id: string; purchase_price: number | null; purchase_date: string | null; current_value: number | null; replacement_value_estimate: number | null };
    let assetRows: AssetRow[] = (primary.data ?? []).map((a) => ({
      accessory_unit_id: a.accessory_unit_id as string,
      purchase_price: a.purchase_price as number | null,
      purchase_date: a.purchase_date as string | null,
      replacement_value_estimate: (a as { replacement_value_estimate?: number | null }).replacement_value_estimate ?? null,
      current_value: a.current_value as number | null,
    }));
    if (primary.error && /replacement_value_estimate/i.test(primary.error.message)) {
      const fb = await supabase
        .from('assets')
        .select('accessory_unit_id, purchase_price, purchase_date, current_value')
        .in('accessory_unit_id', accUnitIds)
        .eq('status', 'active');
      assetRows = (fb.data ?? []).map((a) => ({
        accessory_unit_id: a.accessory_unit_id as string,
        purchase_price: a.purchase_price as number | null,
        purchase_date: a.purchase_date as string | null,
        replacement_value_estimate: null,
        current_value: a.current_value as number | null,
      }));
    }
    for (const ar of assetRows) {
      const accId = unitToAcc.get(ar.accessory_unit_id);
      if (!accId || !ar.purchase_date || ar.purchase_price == null) continue;
      const v = computeReplacementValue({
        purchase_price: ar.purchase_price,
        purchase_date: ar.purchase_date,
        replacement_value_estimate: ar.replacement_value_estimate,
      }, wbwConfig);
      const arr = assetValuesPerAccId.get(accId) ?? [];
      arr.push(v);
      assetValuesPerAccId.set(accId, arr);
    }
  }

  // accessories.replacement_value als Fallback pro accessory_id
  const accRepMap = new Map<string, number>();
  if (accIds.length > 0) {
    const { data: accs } = await supabase
      .from('accessories')
      .select('id, replacement_value')
      .in('id', accIds);
    for (const a of accs ?? []) {
      accRepMap.set(a.id as string, Number(a.replacement_value ?? 0));
    }
  }

  // Inventar-Bridge (neue Welt): wenn weder Asset noch accessories.replacement_value
  // einen Wert liefern, holen wir den WBW aus inventar_units ueber migration_audit.
  // Vorteil: deckt den Fall ab, dass alle Werte nach der Buchhaltungs-Konsolidierung
  // in der neuen Welt leben und die alten Tabellen 0 zeigen.
  const inventarBridge = await getInventarWbwForBookingAccessories(supabase, {
    accessoryIds: accIds,
    accessoryUnitIds: accUnitIds,
  });

  // Pro physische Position eine Line bauen.
  // Reihenfolge (best-first):
  //   1) Asset-Wert pro Unit (genauester, weil exemplar-spezifisch)
  //   2) inventar_units (neue Welt) — direkt zur Unit oder als Produkt-Durchschnitt
  //   3) accessories.replacement_value (alte, gepflegte Fallback-Werte)
  const accessoryLines: Line[] = [];
  for (const item of physicalAccItems) {
    const assetValues = assetValuesPerAccId.get(item.id) ?? [];
    const assetAvg = assetValues.length > 0
      ? assetValues.reduce((s, v) => s + v, 0) / assetValues.length
      : 0;
    const inventarValue = inventarBridge.perAccessoryId.get(item.id) ?? 0;
    const repValue = accRepMap.get(item.id) ?? 0;

    let unitValue: number;
    let source: Line['source'];
    if (assetAvg > 0) {
      unitValue = assetAvg;
      source = 'asset';
    } else if (inventarValue > 0) {
      unitValue = inventarValue;
      source = 'asset';
    } else if (repValue > 0) {
      unitValue = repValue;
      source = 'accessory_replacement';
    } else {
      unitValue = 0;
      source = 'unknown';
    }

    const totalValue = unitValue * item.qty;
    accessoryLines.push({
      name: item.isFromSet ? `${item.name} (aus Set: ${item.setName})` : item.name,
      qty: item.qty,
      unit_value: Math.round(unitValue * 100) / 100,
      total_value: Math.round(totalValue * 100) / 100,
      source,
    });
  }

  const accessoriesTotal = accessoryLines.reduce((s, l) => s + l.total_value, 0);
  const camerasTotal = cameraLines.reduce((s, l) => s + l.total_value, 0);
  const totalWbw = camerasTotal + accessoriesTotal;

  // 3. Kunden-Maximum je nach Haftungsoption
  // booking.haftung Werte: 'standard' (Basis), 'premium', sonst (null/'none'/'')
  let customerMax = 0;
  let customerMaxLabel = '';
  let customerMaxNote = '';
  if (haftung === 'premium') {
    customerMax = 0;
    customerMaxLabel = 'Premium-Schadenspauschale';
    customerMaxNote = 'Kunde haftet 0 € — alles ueber das Reparaturdepot.';
  } else if (haftung === 'standard') {
    // Eigenbeteiligung ueber haftung_config + product.category
    const { data: setting } = await supabase
      .from('admin_settings')
      .select('value')
      .eq('key', 'haftung_config')
      .maybeSingle();
    const haftungConfig: HaftungConfig = (setting?.value as HaftungConfig) ?? DEFAULT_HAFTUNG;
    // Kategorie der (ggf. ueberschriebenen) Kamera aus dem bereits
    // geladenen admin_config.products bestimmen.
    const category: string | undefined = allProducts.find((p) => p.id === cameraId)?.category;
    customerMax = getEigenbeteiligung(haftungConfig, category);
    customerMaxLabel = 'Basis-Schadenspauschale';
    customerMaxNote = `Eigenbeteiligung des Mieters je Schadensereignis. Restschaden ueber das Reparaturdepot.`;
  } else {
    customerMax = totalWbw;
    customerMaxLabel = 'Ohne Schadenspauschale';
    customerMaxNote = 'Kunde haftet bis zum vollen Wiederbeschaffungswert pro Position. Forderung manuell.';
  }

  return {
    camera: cameraLine,
    cameras: cameraLines,
    accessories: accessoryLines,
    total_wbw: Math.round(totalWbw * 100) / 100,
    accessories_total: Math.round(accessoriesTotal * 100) / 100,
    customer_max_liability: Math.round(customerMax * 100) / 100,
    customer_max_label: customerMaxLabel,
    customer_max_note: customerMaxNote,
    haftung_option: haftung,
    deposit_anchor: productDeposit,
    camera_overridden: cameraOverridden,
    accessories_overridden: accessoriesOverridden,
    override_camera_product_id: cameraOverridden ? cameraId : null,
    override_accessories: accessoriesOverridden ? (override!.accessories ?? []) : null,
  };
}

/**
 * PATCH /api/admin/booking/[id]
 * Body: { status?: string, customer_email?: string }
 * Aktualisiert den Buchungsstatus oder Kundendaten.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const {
    status,
    cancellation_reason,
    refund_amount,
    stripe_refund,
    send_email,
    attach_invoice,
    customer_email,
    verification_gate,
    liability_override,
    tracking_number,
    tracking_carrier,
    return_tracking_number,
    return_tracking_carrier,
    ship_date_override,
    return_due_date_override,
  } = body as {
    status?: string;
    cancellation_reason?: string;
    refund_amount?: number;
    stripe_refund?: boolean;
    send_email?: boolean;
    attach_invoice?: boolean;
    customer_email?: string;
    verification_gate?: 'approve' | 'revoke';
    liability_override?: {
      camera_product_id?: string | null;
      accessories?: { id: string; qty: number }[] | null;
    } | null;
    tracking_number?: string | null;
    tracking_carrier?: string | null;
    return_tracking_number?: string | null;
    return_tracking_carrier?: string | null;
    ship_date_override?: string | null;
    return_due_date_override?: string | null;
  };

  const supabase = createServiceClient();

  // ── Echte Zubehoer-Zusammensetzung bearbeiten ──────────────────────────
  // Eigenstaendiger, frueh zurueckkehrender Zweig. Aendert die ECHTE Buchung
  // (accessory_items / accessory_unit_ids / accessories), schlaegt damit in
  // Packliste, Uebergabeprotokoll, Scan-Workflow, WBW und Verfuegbarkeit
  // durch. Verfuegbarkeit wird hart geprueft (kein Ueberbuchen). Preis nur
  // optional, ohne Stripe-Bewegung. Mietvertrag bleibt unangetastet.
  const accessoryEdit = (body as {
    accessory_edit?: {
      items?: { accessory_id?: string; qty?: number }[];
      reason?: string;
      new_price_total?: number | null;
    };
  }).accessory_edit;
  if (accessoryEdit !== undefined) {
    if (!accessoryEdit || typeof accessoryEdit !== 'object' || !Array.isArray(accessoryEdit.items)) {
      return NextResponse.json({ error: 'Ungültige Anfrage.' }, { status: 422 });
    }
    const reason = typeof accessoryEdit.reason === 'string' ? accessoryEdit.reason.trim() : '';
    if (reason.length < 10) {
      return NextResponse.json(
        { error: 'Bitte einen Grund mit mindestens 10 Zeichen angeben.' },
        { status: 422 },
      );
    }

    const { data: booking } = await supabase
      .from('bookings')
      .select('id, status, rental_from, rental_to, accessory_items, accessory_unit_ids, accessories, notes, price_total, delivery_mode, product_id, pack_status, pack_photo_url')
      .eq('id', id)
      .maybeSingle();
    if (!booking) {
      return NextResponse.json({ error: 'Buchung nicht gefunden.' }, { status: 404 });
    }
    const TERMINAL = ['cancelled', 'completed', 'returned'];
    if (TERMINAL.includes(booking.status)) {
      return NextResponse.json(
        { error: `Buchung im Status „${booking.status}" kann nicht mehr bearbeitet werden.` },
        { status: 409 },
      );
    }

    const applied = await applyAccessoryComposition({
      supabase,
      bookingId: id,
      rentalFrom: String(booking.rental_from),
      rentalTo: String(booking.rental_to),
      productId: booking.product_id ? String(booking.product_id) : null,
      deliveryMode: (booking.delivery_mode as string) || 'versand',
      rawItems: accessoryEdit.items,
      currentItems: (booking.accessory_items as { accessory_id: string; qty: number }[] | null) ?? null,
      currentAccessories: (booking.accessories as string[] | null) ?? null,
      currentUnitIds: (booking.accessory_unit_ids as string[] | null) ?? null,
    });
    if (!applied.ok) {
      return NextResponse.json({ error: applied.error }, { status: applied.status });
    }

    const priceProvided =
      accessoryEdit.new_price_total !== undefined && accessoryEdit.new_price_total !== null;
    const newPrice = priceProvided ? Math.max(0, Number(accessoryEdit.new_price_total)) : null;
    const priceValid = priceProvided && newPrice !== null && Number.isFinite(newPrice);

    const dateStr = new Date().toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' });
    let noteLine = `Zubehör-Anpassung (${dateStr}): ${reason}`;
    if (priceValid) noteLine += ` — Preis neu: ${(newPrice as number).toFixed(2).replace('.', ',')} €`;
    const existingNotes = booking.notes ? `${booking.notes} | ` : '';

    const upd: Record<string, unknown> = {
      accessory_items: applied.newItems,
      accessories: applied.accessories,
      accessory_unit_ids: applied.accessory_unit_ids,
      notes: `${existingNotes}${noteLine}`,
    };
    if (priceValid) upd.price_total = newPrice;

    const packResetFields = await resetPackWorkflow(supabase, booking);
    const packWasStarted = Object.keys(packResetFields).length > 0;
    Object.assign(upd, packResetFields);

    const { error: upErr } = await supabase.from('bookings').update(upd).eq('id', id);
    if (upErr) {
      console.error('[booking-accessory-edit] update failed:', upErr);
      return NextResponse.json({ error: 'Speichern fehlgeschlagen.' }, { status: 500 });
    }

    await logAudit({
      action: 'booking.accessory_edit',
      entityType: 'booking',
      entityId: id,
      changes: {
        old_items: applied.oldItems,
        new_items: applied.newItems,
        price_old: booking.price_total ?? null,
        price_new: priceValid ? newPrice : null,
        reason,
        pack_workflow_reset: packWasStarted,
      },
      request: req,
    });

    // Rechnung intern versionieren (non-blocking — darf den Edit nie kippen).
    await snapshotInvoiceVersion(supabase, id, {
      reason,
      triggerSource: 'accessory_edit',
      previousBooking: booking as Record<string, unknown>,
      request: req,
    }).catch((e) => console.error('[booking-accessory-edit] snapshot failed:', e));

    return NextResponse.json({ success: true });
  }

  // ── Abweichende Rechnungsadresse ───────────────────────────────────────
  // Setzt bookings.invoice_name + invoice_address. NULL bzw. leer = Default
  // (customer_name + shipping_address bzw. Profil). Wirkt sofort auf alle
  // Rechnungs-Renderpfade (Live-PDF, archivierte Versionen, manueller
  // E-Mail-Versand, Verkauf). Loest eine neue Rechnungsversion aus (eigene
  // Fassung mit Adress-Korrektur als Begruendung).
  // Mietvertrag, Versandetikett, Lieferadresse + Packliste bleiben unberuehrt.
  const billingEdit = (body as {
    billing_address?: {
      invoice_name?: string | null;
      invoice_address?: string | null;
      reason?: string;
    };
  }).billing_address;
  if (billingEdit !== undefined) {
    if (!billingEdit || typeof billingEdit !== 'object') {
      return NextResponse.json({ error: 'Ungültige Anfrage.' }, { status: 422 });
    }
    const rawName = typeof billingEdit.invoice_name === 'string' ? billingEdit.invoice_name : '';
    const rawAddr = typeof billingEdit.invoice_address === 'string' ? billingEdit.invoice_address : '';
    const reason = typeof billingEdit.reason === 'string' ? billingEdit.reason.trim() : '';
    // Beide leer = zuruecksetzen auf Default. Sonst muss zumindest die
    // Adresse gesetzt sein (Name allein ist sinnlos ohne Adresse).
    const newName = rawName.trim().slice(0, 200);
    const newAddr = rawAddr.trim().slice(0, 500);
    const isReset = newName.length === 0 && newAddr.length === 0;
    if (!isReset && newAddr.length === 0) {
      return NextResponse.json(
        { error: 'Bitte eine Rechnungsadresse angeben (Name allein reicht nicht).' },
        { status: 422 },
      );
    }

    const { data: prevBooking } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (!prevBooking) {
      return NextResponse.json({ error: 'Buchung nicht gefunden.' }, { status: 404 });
    }

    const upd: Record<string, string | null> = {
      invoice_name: isReset ? null : (newName.length > 0 ? newName : null),
      invoice_address: isReset ? null : newAddr,
    };

    const tryUpdate = async () =>
      supabase.from('bookings').update(upd).eq('id', id);
    const updErr = (await tryUpdate()).error;
    if (updErr) {
      const msg = updErr.message || '';
      if (/invoice_name|invoice_address|column|schema cache|PGRST/i.test(msg)) {
        return NextResponse.json(
          { error: 'Migration ausstehend: supabase-bookings-invoice-address.sql noch nicht ausgeführt.' },
          { status: 503 },
        );
      }
      console.error('[billing_address] update error:', updErr);
      return NextResponse.json({ error: 'Speichern fehlgeschlagen.' }, { status: 500 });
    }

    await logAudit({
      action: 'booking.billing_address',
      entityType: 'booking',
      entityId: id,
      changes: {
        reset: isReset,
        previous_name: (prevBooking.invoice_name as string | null) ?? null,
        previous_address: (prevBooking.invoice_address as string | null) ?? null,
        new_name: upd.invoice_name,
        new_address: upd.invoice_address,
        reason: reason || null,
      },
      request: req,
    }).catch(() => { /* best-effort */ });

    // Neue Rechnungsversion (non-blocking — die Adress-Aenderung selbst ist
    // schon persistiert, die Versionierung soll dabei nie blockieren).
    void snapshotInvoiceVersion(supabase, id, {
      reason: reason || (isReset ? 'Abweichende Rechnungsadresse entfernt' : 'Rechnungsadresse korrigiert'),
      triggerSource: 'manual',
      previousBooking: prevBooking as Record<string, unknown>,
      request: req,
    });

    return NextResponse.json({ success: true });
  }

  // ── Komplette Bestellbearbeitung ───────────────────────────────────────
  // Mietzeitraum / Kamera / Set+Zubehoer / Haftungsschutz in einem Vorgang.
  // Wirkt SOFORT auf die echte Buchung (Packliste, Vertragsdaten-Quelle,
  // Verfuegbarkeit, WBW). Preisdifferenz: Nachzahlung per Stripe-Zahlungslink
  // (automatisch per E-Mail) oder Rueckerstattung (Auto-Refund nur bei pi_,
  // sonst vorgemerkt). Mietvertrag-PDF bleibt das signierte Original — die
  // Aenderung wird in notes + Audit dokumentiert. Eigenstaendiger Zweig.
  const bookingEdit = (body as {
    booking_edit?: {
      rental_from?: string;
      rental_to?: string;
      camera_product_id?: string | null;
      cameras?: { product_id?: string }[] | null;
      haftung?: 'none' | 'standard' | 'premium' | null;
      delivery_mode?: 'versand' | 'abholung' | null;
      shipping_method?: 'standard' | 'express' | null;
      shipping_override?: number | null;
      items?: { id?: string; accessory_id?: string; qty?: number }[] | null;
      reason?: string;
      new_price_total?: number | null;
      discount_mode?: 'none' | 'percent' | 'fixed' | null;
      discount_value?: number | null;
      discount_reason?: string | null;
      settle?: 'auto' | 'none';
      dry_run?: boolean;
    };
  }).booking_edit;
  if (bookingEdit !== undefined) {
    if (!bookingEdit || typeof bookingEdit !== 'object') {
      return NextResponse.json({ error: 'Ungültige Anfrage.' }, { status: 422 });
    }
    const dryRun = bookingEdit.dry_run === true;
    const reason = typeof bookingEdit.reason === 'string' ? bookingEdit.reason.trim() : '';
    if (!dryRun && reason.length < 10) {
      return NextResponse.json(
        { error: 'Bitte einen Grund mit mindestens 10 Zeichen angeben.' },
        { status: 422 },
      );
    }

    const { data: booking } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (!booking) {
      return NextResponse.json({ error: 'Buchung nicht gefunden.' }, { status: 404 });
    }
    const TERMINAL = ['cancelled', 'completed', 'returned'];
    if (TERMINAL.includes(booking.status)) {
      return NextResponse.json(
        { error: `Buchung im Status „${booking.status}" kann nicht mehr bearbeitet werden.` },
        { status: 409 },
      );
    }

    // ── Effektive Werte bestimmen ──────────────────────────────────────
    const dateRe = /^\d{4}-\d{2}-\d{2}$/;
    const rentalFrom = (typeof bookingEdit.rental_from === 'string' && bookingEdit.rental_from.trim())
      ? bookingEdit.rental_from.trim()
      : String(booking.rental_from);
    const rentalTo = (typeof bookingEdit.rental_to === 'string' && bookingEdit.rental_to.trim())
      ? bookingEdit.rental_to.trim()
      : String(booking.rental_to);
    if (!dateRe.test(rentalFrom) || !dateRe.test(rentalTo)) {
      return NextResponse.json({ error: 'Ungültiges Datum (Format YYYY-MM-DD).' }, { status: 422 });
    }
    const dFrom = new Date(`${rentalFrom}T00:00:00Z`);
    const dTo = new Date(`${rentalTo}T00:00:00Z`);
    if (isNaN(dFrom.getTime()) || isNaN(dTo.getTime()) || dTo < dFrom) {
      return NextResponse.json({ error: 'Enddatum muss nach dem Startdatum liegen.' }, { status: 422 });
    }
    const days = Math.round((dTo.getTime() - dFrom.getTime()) / 86400000) + 1;
    if (days < 1 || days > 365) {
      return NextResponse.json({ error: 'Mietdauer muss zwischen 1 und 365 Tagen liegen.' }, { status: 422 });
    }
    const periodChanged = rentalFrom !== String(booking.rental_from) || rentalTo !== String(booking.rental_to);

    const curProductId = booking.product_id ? String(booking.product_id) : '';
    const catalog = await getProducts();

    // Pro-Kamera-Modelle. Vorrang: body.cameras[] (jede Kamera ihr eigenes
    // Modell). Sonst Einzel-camera_product_id auf ALLE Kameras (Legacy).
    // Sonst die bestehende Kamera-Liste der Buchung.
    const existingCams = resolveBookingCameras(booking);
    const existingCamCount = Math.max(1, existingCams.length || 1);
    type CamPick = { product_id: string; name: string };
    let camPicks: CamPick[];
    const camsBody = Array.isArray(bookingEdit.cameras) ? bookingEdit.cameras : null;
    if (camsBody && camsBody.length > 0) {
      const picks: CamPick[] = [];
      for (const c of camsBody) {
        const pid = String(c?.product_id ?? '').trim();
        const p = catalog.find((x) => x.id === pid);
        if (!pid || !p) {
          return NextResponse.json(
            { error: 'Mindestens eine gewählte Kamera ist nicht im Katalog.' },
            { status: 422 },
          );
        }
        picks.push({ product_id: pid, name: p.name });
      }
      camPicks = picks;
    } else {
      const single = typeof bookingEdit.camera_product_id === 'string' && bookingEdit.camera_product_id.trim()
        ? bookingEdit.camera_product_id.trim()
        : '';
      const base = existingCams.length > 0
        ? existingCams.map((c) => (c.product_id ?? curProductId) || '')
        : Array(existingCamCount).fill(curProductId);
      camPicks = base.map((pid) => {
        const finalPid = single || pid || curProductId;
        const p = catalog.find((x) => x.id === finalPid);
        return {
          product_id: finalPid,
          name: p?.name ?? String(booking.product_name ?? finalPid).split(',')[0].trim(),
        };
      });
    }
    const cameraCount = Math.max(1, camPicks.length);
    const newProductId = camPicks[0]?.product_id || curProductId;

    // Gewuenschte Stueckzahl pro distinct Modell
    const wantByPid = new Map<string, { name: string; qty: number }>();
    for (const c of camPicks) {
      const e = wantByPid.get(c.product_id);
      if (e) e.qty += 1;
      else wantByPid.set(c.product_id, { name: c.name, qty: 1 });
    }
    const desiredCameras: DesiredCamera[] = [...wantByPid.entries()].map(
      ([pid, v]) => ({ product_id: pid, product_name: v.name, qty: v.qty }),
    );

    // Hat sich die Kamera-Zusammensetzung (Modelle als Multiset) geaendert?
    const existSorted = existingCams
      .map((c) => (c.product_id ?? curProductId) || '')
      .sort()
      .join(',');
    const newSorted = camPicks.map((c) => c.product_id).sort().join(',');
    const cameraChanged = existSorted !== newSorted;

    // bookings.haftung ist NOT NULL — „keine Haftung" ist der String 'none'
    // (so speichern es auch confirm-cart / manual-booking), niemals null.
    const normHaftung = (v: unknown): 'none' | 'standard' | 'premium' =>
      v === 'standard' ? 'standard' : v === 'premium' ? 'premium' : 'none';
    const effHaftung = bookingEdit.haftung !== undefined
      ? normHaftung(bookingEdit.haftung)
      : normHaftung(booking.haftung);

    // Roh-Auswahl (Accessories + Sets). Wenn items nicht uebergeben →
    // aktuelle Komposition beibehalten (accessory_items kann Set-IDs tragen).
    const itemsProvided = Array.isArray(bookingEdit.items);
    const rawSelection: { accessory_id: string; qty: number }[] = (itemsProvided
      ? (bookingEdit.items as { id?: string; accessory_id?: string; qty?: number }[]).map((x) => ({
          accessory_id: String(x.accessory_id ?? x.id ?? '').trim(),
          qty: Math.min(99, Math.max(1, Math.round(Number(x.qty) || 1))),
        }))
      : (Array.isArray(booking.accessory_items) && booking.accessory_items.length > 0
          ? (booking.accessory_items as { accessory_id: string; qty: number }[])
          : (Array.isArray(booking.accessories) ? booking.accessories as string[] : []).map((a) => ({ accessory_id: a, qty: 1 }))))
      .filter((r) => r.accessory_id);

    // ── Verfuegbarkeit pro Modell ──────────────────────────────────────
    if (cameraChanged || periodChanged) {
      for (const [pid, v] of wantByPid) {
        const prod = catalog.find((p) => p.id === pid);
        if (!prod) {
          return NextResponse.json({ error: 'Gewählte Kamera ist nicht im Katalog.' }, { status: 422 });
        }
        const reserved = await reservedCameraCount(
          supabase, pid, rentalFrom, rentalTo, id, booking.is_test === true,
        );
        if (reserved + v.qty > prod.stock) {
          return NextResponse.json(
            {
              error: `${prod.name} ist im Zeitraum nicht ausreichend verfügbar (benötigt ${v.qty}, frei ${Math.max(0, prod.stock - reserved)}). Änderung wurde NICHT gespeichert.`,
            },
            { status: 409 },
          );
        }
      }
    }

    // ── Preis neu berechnen (Summe je Kamera-Modell) ───────────────────
    let priceRental = Number(booking.price_rental ?? 0);
    {
      let sum = 0;
      let allFound = true;
      for (const c of camPicks) {
        const p = catalog.find((x) => x.id === c.product_id);
        if (!p) { allFound = false; break; }
        sum += getPriceForDays(p, days);
      }
      if (allFound) priceRental = Math.round(sum * 100) / 100;
    }

    const { data: hCfgRow } = await supabase
      .from('admin_settings')
      .select('value')
      .eq('key', 'haftung_config')
      .maybeSingle();
    const hCfg: HaftungConfig = (hCfgRow?.value as HaftungConfig) ?? DEFAULT_HAFTUNG;
    let priceHaftung = 0;
    if (effHaftung === 'standard') priceHaftung = calcHaftungTieredPrice(hCfg.standard, hCfg.standardIncrement, days);
    else if (effHaftung === 'premium') priceHaftung = calcHaftungTieredPrice(hCfg.premium, hCfg.premiumIncrement, days);
    priceHaftung = Math.round(priceHaftung * 100) / 100;

    // Accessories/Sets bepreisen — Set als Set-Preis, Accessory als
    // Accessory-Preis (pro-Tag oder flat), jeweils × qty.
    let priceAccessories = 0;
    if (rawSelection.length > 0) {
      const ids = [...new Set(rawSelection.map((r) => r.accessory_id))];
      const [accRes, setRes] = await Promise.all([
        supabase.from('accessories').select('id, price, pricing_mode').in('id', ids),
        supabase.from('sets').select('id, price, pricing_mode').in('id', ids),
      ]);
      const accMap = new Map<string, { price: number; flat: boolean }>();
      for (const a of accRes.data ?? []) {
        accMap.set(a.id as string, { price: Number(a.price ?? 0), flat: (a.pricing_mode as string) === 'flat' });
      }
      const setMap = new Map<string, { price: number; flat: boolean }>();
      for (const s of setRes.data ?? []) {
        setMap.set(s.id as string, { price: Number(s.price ?? 0), flat: (s.pricing_mode as string) === 'flat' });
      }
      for (const r of rawSelection) {
        const s = setMap.get(r.accessory_id);
        const a = accMap.get(r.accessory_id);
        const def = s ?? a;
        if (!def) continue;
        const line = def.flat ? def.price : def.price * Math.max(1, days);
        priceAccessories += line * r.qty;
      }
      priceAccessories = Math.round(priceAccessories * 100) / 100;
    }

    // Lieferart/Versandart: Body hat Vorrang, sonst Bestand der Buchung.
    const deliveryMode: 'versand' | 'abholung' =
      bookingEdit.delivery_mode === 'abholung' ? 'abholung'
      : bookingEdit.delivery_mode === 'versand' ? 'versand'
      : (booking.delivery_mode as string) === 'abholung' ? 'abholung' : 'versand';
    const shipMethod: 'standard' | 'express' =
      bookingEdit.shipping_method === 'express' ? 'express'
      : bookingEdit.shipping_method === 'standard' ? 'standard'
      : (booking.shipping_method as string) === 'express' ? 'express' : 'standard';

    // Versandpreise aus derselben DB-Quelle wie der Kunden-Checkout
    // (admin_config key 'shipping'), NICHT statisch raten.
    const { data: shipCfgRow } = await supabase
      .from('admin_config')
      .select('value')
      .eq('key', 'shipping')
      .maybeSingle();
    const shipCfg = (shipCfgRow?.value as typeof DEFAULT_SHIPPING) ?? DEFAULT_SHIPPING;

    const subtotal = priceRental + priceAccessories + priceHaftung;

    // Manueller Versand-Override (z. B. 0 € = kostenlos) hat Vorrang.
    const shipOverrideProvided =
      bookingEdit.shipping_override !== undefined && bookingEdit.shipping_override !== null;
    const shipOverrideVal = shipOverrideProvided ? Number(bookingEdit.shipping_override) : null;
    const shipOverrideValid =
      shipOverrideProvided && shipOverrideVal !== null && Number.isFinite(shipOverrideVal) && shipOverrideVal >= 0;
    const shippingPrice = shipOverrideValid
      ? Math.round((shipOverrideVal as number) * 100) / 100
      : Math.round(calcShipping(subtotal, shipMethod, deliveryMode, shipCfg).price * 100) / 100;

    // Rabatt-Behandlung:
    //  - Setzt der Admin einen manuellen Rabatt (Prozent/Festbetrag), ERSETZT
    //    dieser alle bestehenden Auto-Rabatte (duration/loyalty -> 0).
    //  - Ohne manuellen Rabatt bleibt das bisherige Verhalten: bestehende
    //    Rabatte proportional zum neuen Subtotal skalieren, damit ein absoluter
    //    Rabatt nicht stehen bleibt, wenn die Bestellung kleiner wird
    //    (verzerrte Differenz / Ueber-Erstattung).
    const discMode = bookingEdit.discount_mode;
    const discValue = Number(bookingEdit.discount_value);
    const manualDiscountActive =
      (discMode === 'percent' || discMode === 'fixed') &&
      Number.isFinite(discValue) && discValue > 0;

    // Rabatt-Basis wie im Manuelle-Buchung-Formular: nur Miete + Zubehör/Sets
    // (Haftung + Versand bleiben aussen vor).
    const discountBase = priceRental + priceAccessories;

    let scaledDiscountAmount: number;
    let scaledDurationDiscount: number;
    let scaledLoyaltyDiscount: number;
    let discountTotal: number;
    let discountIsManual = false;

    if (manualDiscountActive) {
      let manual = 0;
      if (discMode === 'percent') {
        manual = Math.round(discountBase * Math.min(100, discValue)) / 100;
      } else {
        manual = Math.min(discountBase, Math.round(discValue * 100) / 100);
      }
      if (!(manual > 0)) manual = 0;
      scaledDiscountAmount = manual;
      scaledDurationDiscount = 0;
      scaledLoyaltyDiscount = 0;
      discountTotal = Math.round(manual * 100) / 100;
      discountIsManual = true;
    } else {
      const oldSubtotal =
        Number(booking.price_rental ?? 0) +
        Number(booking.price_accessories ?? 0) +
        Number(booking.price_haftung ?? 0);
      const discScale = oldSubtotal > 0 ? Math.min(1, Math.max(0, subtotal / oldSubtotal)) : 1;
      scaledDiscountAmount = Math.round(Number(booking.discount_amount ?? 0) * discScale * 100) / 100;
      scaledDurationDiscount = Math.round(Number(booking.duration_discount ?? 0) * discScale * 100) / 100;
      scaledLoyaltyDiscount = Math.round(Number(booking.loyalty_discount ?? 0) * discScale * 100) / 100;
      discountTotal =
        Math.round((scaledDiscountAmount + scaledDurationDiscount + scaledLoyaltyDiscount) * 100) / 100;
      discountIsManual = false;
    }
    if (discountTotal > subtotal) discountTotal = subtotal;
    const computedTotal = Math.max(0, Math.round((subtotal + shippingPrice - discountTotal) * 100) / 100);

    const overrideProvided =
      bookingEdit.new_price_total !== undefined && bookingEdit.new_price_total !== null;
    const overrideVal = overrideProvided ? Math.max(0, Number(bookingEdit.new_price_total)) : null;
    const overrideValid = overrideProvided && overrideVal !== null && Number.isFinite(overrideVal);
    const finalTotal = overrideValid ? (overrideVal as number) : computedTotal;

    const oldTotal = Number(booking.price_total ?? 0);
    const diff = Math.round((finalTotal - oldTotal) * 100) / 100;
    const isStripePI = typeof booking.payment_intent_id === 'string'
      && (booking.payment_intent_id as string).startsWith('pi_');
    const settlement = diff > 0.005 ? 'payment_link' : diff < -0.005 ? 'refund' : 'none';

    if (dryRun) {
      return NextResponse.json({
        preview: {
          days,
          camera_count: cameraCount,
          camera_changed: cameraChanged,
          period_changed: periodChanged,
          price_rental: priceRental,
          price_accessories: priceAccessories,
          price_haftung: priceHaftung,
          shipping_price: shippingPrice,
          shipping_overridden: shipOverrideValid,
          delivery_mode: deliveryMode,
          shipping_method: shipMethod,
          discount_total: Math.round(discountTotal * 100) / 100,
          discount_scaled: !discountIsManual && discountTotal > 0,
          discount_manual: discountIsManual,
          computed_total: computedTotal,
          final_total: finalTotal,
          old_total: oldTotal,
          diff,
          settlement,
          is_stripe_payment: isStripePI,
        },
      });
    }

    // ── Mutation ───────────────────────────────────────────────────────
    // Zubehoer/Sets near-atomar anwenden (Verfuegbarkeit gegen den NEUEN
    // Zeitraum, Units neu zuweisen). Schreibt accessory_unit_ids ggf. schon.
    const applied = await applyAccessoryComposition({
      supabase,
      bookingId: id,
      rentalFrom,
      rentalTo,
      productId: newProductId || null,
      deliveryMode,
      rawItems: rawSelection,
      currentItems: (booking.accessory_items as { accessory_id: string; qty: number }[] | null) ?? null,
      currentAccessories: (booking.accessories as string[] | null) ?? null,
      currentUnitIds: (booking.accessory_unit_ids as string[] | null) ?? null,
    });
    if (!applied.ok) {
      return NextResponse.json({ error: applied.error }, { status: applied.status });
    }

    const dateStr = new Date().toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' });
    const parts: string[] = [];
    if (periodChanged) parts.push(`Zeitraum ${rentalFrom}–${rentalTo}`);
    if (cameraChanged) parts.push(`Kamera → ${camPicks.map((c) => c.name).join(', ')}`);
    if (bookingEdit.haftung !== undefined) parts.push(`Haftung → ${effHaftung === 'none' ? 'keine' : effHaftung}`);
    if (bookingEdit.delivery_mode !== undefined || bookingEdit.shipping_method !== undefined || shipOverrideValid) {
      parts.push(`Versand → ${deliveryMode === 'abholung' ? 'Abholung' : `${shipMethod === 'express' ? 'Express' : 'Standard'} ${shippingPrice.toFixed(2).replace('.', ',')} €`}`);
    }
    if (itemsProvided) parts.push('Zubehör/Set angepasst');
    if (discountIsManual) {
      const discReason = typeof bookingEdit.discount_reason === 'string'
        ? bookingEdit.discount_reason.trim().slice(0, 120)
        : '';
      parts.push(
        `Rabatt → −${discountTotal.toFixed(2).replace('.', ',')} €`
        + (discMode === 'percent' ? ` (${Math.min(100, discValue)}%)` : '')
        + (discReason ? ` – ${discReason}` : ''),
      );
    }
    let noteLine = `Bestellbearbeitung (${dateStr}): ${reason}`;
    if (parts.length > 0) noteLine += ` [${parts.join(', ')}]`;
    noteLine += ` — Gesamt ${oldTotal.toFixed(2).replace('.', ',')} € → ${finalTotal.toFixed(2).replace('.', ',')} €`;
    const existingNotes = booking.notes ? `${booking.notes} | ` : '';

    const upd: Record<string, unknown> = {
      rental_from: rentalFrom,
      rental_to: rentalTo,
      days,
      haftung: effHaftung,
      accessory_items: applied.newItems,
      accessories: applied.accessories,
      accessory_unit_ids: applied.accessory_unit_ids,
      price_rental: priceRental,
      price_accessories: priceAccessories,
      price_haftung: priceHaftung,
      shipping_price: shippingPrice,
      price_total: finalTotal,
      discount_amount: scaledDiscountAmount,
      duration_discount: scaledDurationDiscount,
      loyalty_discount: scaledLoyaltyDiscount,
      delivery_mode: deliveryMode,
      shipping_method: shipMethod,
      notes: `${existingNotes}${noteLine}`,
    };
    const packResetFields = await resetPackWorkflow(supabase, booking);
    const packWasStarted = Object.keys(packResetFields).length > 0;
    Object.assign(upd, packResetFields);

    // Kamera-/Zeitraum-Aenderung: Kamera-Skelett neu (unit_id=null erzwingt
    // Neuzuweisung), Legacy-Felder synchron halten.
    if (cameraChanged || periodChanged) {
      upd.product_id = newProductId;
      upd.product_name = camPicks.map((c) => c.name).join(', ');
      upd.unit_id = null;
      upd.cameras = buildCameraSkeleton(desiredCameras);
    }

    // Update mit defensivem Strip fehlender Spalten: ist eine Migration noch
    // nicht durch (z. B. supabase-bookings-cameras.sql), liefert PostgREST
    // „Could not find the 'X' column … in the schema cache" (PGRST204). Die
    // betroffene Spalte wird entfernt und erneut versucht (max. 6 Runden) —
    // ein fehlendes optionales Feld darf das Speichern NIE hart killen.
    const updTry: Record<string, unknown> = { ...upd };
    let camerasColumnMissing = false;
    let upErr: { message?: string; code?: string } | null = null;
    for (let attempt = 0; attempt < 6; attempt++) {
      const r = await supabase.from('bookings').update(updTry).eq('id', id);
      upErr = r.error;
      if (!upErr) break;
      const msg = upErr.message || '';
      const m = msg.match(/Could not find the '([^']+)' column/i);
      const col = m?.[1];
      if (col && col in updTry) {
        if (col === 'cameras') camerasColumnMissing = true;
        delete updTry[col];
        console.warn(`[booking-edit] Spalte '${col}' fehlt (Migration ausstehend) — wird übersprungen`);
        continue;
      }
      break;
    }
    if (upErr) {
      console.error('[booking-edit] update failed:', upErr);
      return NextResponse.json(
        { error: `Speichern fehlgeschlagen: ${upErr.message || upErr.code || 'unbekannter DB-Fehler'}` },
        { status: 500 },
      );
    }

    // Kamera-Units neu zuweisen
    if (cameraChanged || periodChanged) {
      try {
        if (!camerasColumnMissing) {
          const camRes = await assignCamerasToBooking(
            id,
            desiredCameras,
            rentalFrom,
            rentalTo,
          );
          const missingCount = camRes.missing.reduce((s, m) => s + (m.requested - m.assigned), 0);
          if (missingCount > 0) {
            await supabase
              .from('bookings')
              .update({ notes: `${(upd.notes as string)} | ⚠ ${missingCount} Kamera-Einheit(en) konnten nicht zugewiesen werden — bitte manuell prüfen` })
              .eq('id', id);
            await createAdminNotification(supabase, {
              type: 'payment_failed',
              title: `Kamera-Zuweisung unvollständig (${id})`,
              message: `Nach Bestellbearbeitung fehlen ${missingCount} Kamera-Einheit(en).`,
              link: `/admin/buchungen/${id}`,
            }).catch(() => { /* best-effort */ });
          }
        } else if (newProductId) {
          await assignUnitToBooking(id, newProductId, rentalFrom, rentalTo).catch(() => null);
        }
      } catch (e) {
        console.error('[booking-edit] camera reassignment failed:', e);
      }
    }

    // ── Preisdifferenz abwickeln ───────────────────────────────────────
    const settle = bookingEdit.settle === 'none' ? 'none' : 'auto';
    let paymentUrl: string | null = null;
    let adjustmentStatus: string | null = null;

    const writeAdjustment = async (fields: Record<string, unknown>) => {
      const r = await supabase.from('bookings').update(fields).eq('id', id);
      if (r.error && /adjustment_/i.test(r.error.message || '')) {
        // Migration supabase-bookings-edit-adjustment.sql noch nicht durch —
        // Info steckt bereits in notes; Spalten-Update still ueberspringen.
        console.warn('[booking-edit] adjustment columns missing, skipped:', r.error.message);
      }
    };

    if (settle === 'auto' && diff > 0.005) {
      // Nachzahlung per Stripe-Zahlungslink (+ E-Mail an Kunden)
      try {
        const stripe = await getStripe();
        const siteUrl = await getSiteUrl();
        const cents = Math.round(diff * 100);
        const prodName = String(upd.product_name ?? booking.product_name ?? '').slice(0, 200);
        const sProd = await stripe.products.create({
          name: `Nachzahlung Buchung ${id}`.slice(0, 250),
          metadata: { booking_id: id, booking_type: 'price_adjustment' },
        });
        const sPrice = await stripe.prices.create({
          product: sProd.id, unit_amount: cents, currency: 'eur',
        });
        const description = buildPaymentDescription({
          bookingId: id, productName: prodName, rentalFrom, rentalTo,
        });
        const pl = await stripe.paymentLinks.create({
          line_items: [{ price: sPrice.id, quantity: 1 }],
          metadata: { booking_id: id, booking_type: 'price_adjustment' },
          payment_intent_data: {
            description,
            metadata: { booking_id: id, booking_type: 'price_adjustment' },
          },
          after_completion: {
            type: 'redirect',
            redirect: { url: `${siteUrl}/buchung-bestaetigt?from=adjustment&booking_id=${id}` },
          },
          allow_promotion_codes: false,
          payment_method_types: ['card', 'paypal'],
        });
        paymentUrl = pl.url;
        adjustmentStatus = 'pending_payment';
        await writeAdjustment({
          adjustment_payment_link_id: pl.id,
          adjustment_amount: diff,
          adjustment_status: 'pending_payment',
          adjustment_note: `Nachzahlung ${diff.toFixed(2)} € — ${reason}`.slice(0, 500),
          notes: `${upd.notes as string} | Zahlungslink Nachzahlung: ${pl.url}`,
        });
        if (booking.customer_email) {
          const mail = buildBookingAdjustmentEmail({
            bookingId: id,
            customerName: booking.customer_name ?? null,
            productName: prodName,
            rentalFrom,
            rentalTo,
            diffAmount: diff,
            newTotal: finalTotal,
            reason,
            paymentUrl: pl.url,
          });
          await sendAndLog({
            to: booking.customer_email,
            subject: mail.subject,
            html: mail.html,
            text: mail.text,
            bookingId: id,
            emailType: 'payment_link',
          }).catch((e) => console.error('[booking-edit] adjustment mail failed:', e));
        }
      } catch (stripeErr) {
        console.error('[booking-edit] Stripe-Zahlungslink fehlgeschlagen:', stripeErr);
        adjustmentStatus = 'payment_link_failed';
        await createAdminNotification(supabase, {
          type: 'payment_failed',
          title: `Nachzahlungs-Link fehlgeschlagen (${id})`,
          message: `Buchung wurde geändert, aber der Stripe-Zahlungslink über ${diff.toFixed(2)} € konnte nicht erstellt werden. Bitte manuell einfordern.`,
          link: `/admin/buchungen/${id}`,
        }).catch(() => { /* best-effort */ });
      }
    } else if (settle === 'auto' && diff < -0.005) {
      // Rueckerstattung. WICHTIG: refund_amount-Spalte NICHT anfassen — der
      // gesenkte price_total reduziert das Einkommen in EUeR/DATEV bereits;
      // refund_amount wuerde DOPPELT abziehen (gehoert der Stripe-Abgleich-
      // Erstattung). Hier nur Geldfluss + adjustment_*-Doku.
      const refundCents = Math.round(-diff * 100);
      if (isStripePI) {
        try {
          const stripe = await getStripe();
          await stripe.refunds.create(
            { payment_intent: booking.payment_intent_id as string, amount: refundCents },
            { idempotencyKey: `booking-edit-refund:${id}:${refundCents}` },
          );
          adjustmentStatus = 'refunded';
          await writeAdjustment({
            adjustment_amount: diff,
            adjustment_status: 'refunded',
            adjustment_note: `Erstattung ${(-diff).toFixed(2)} € (Stripe) — ${reason}`.slice(0, 500),
            notes: `${upd.notes as string} | Stripe-Erstattung ${(-diff).toFixed(2)} € ausgeführt`,
          });
        } catch (refundErr) {
          console.error('[booking-edit] Stripe-Refund fehlgeschlagen:', refundErr);
          adjustmentStatus = 'refund_pending';
          await writeAdjustment({
            adjustment_amount: diff,
            adjustment_status: 'refund_pending',
            adjustment_note: `Erstattung ${(-diff).toFixed(2)} € fehlgeschlagen — manuell ausführen — ${reason}`.slice(0, 500),
            notes: `${upd.notes as string} | ⚠ Stripe-Erstattung ${(-diff).toFixed(2)} € fehlgeschlagen — manuell`,
          });
          await createAdminNotification(supabase, {
            type: 'payment_failed',
            title: `Erstattung fehlgeschlagen (${id})`,
            message: `Erstattung über ${(-diff).toFixed(2)} € konnte nicht ausgeführt werden. Bitte manuell erstatten.`,
            link: `/admin/buchungen/${id}`,
          }).catch(() => { /* best-effort */ });
        }
      } else {
        adjustmentStatus = 'refund_pending';
        await writeAdjustment({
          adjustment_amount: diff,
          adjustment_status: 'refund_pending',
          adjustment_note: `Erstattung ${(-diff).toFixed(2)} € manuell ausführen (Buchung nicht über Stripe bezahlt) — ${reason}`.slice(0, 500),
          notes: `${upd.notes as string} | Erstattung ${(-diff).toFixed(2)} € manuell ausführen (keine Stripe-Zahlung)`,
        });
        await createAdminNotification(supabase, {
          type: 'payment_failed',
          title: `Erstattung manuell ausführen (${id})`,
          message: `Buchung geändert — Erstattung über ${(-diff).toFixed(2)} € manuell ausführen (Zahlung lief nicht über Stripe).`,
          link: `/admin/buchungen/${id}`,
        }).catch(() => { /* best-effort */ });
      }
    }

    await logAudit({
      action: 'booking.edit',
      entityType: 'booking',
      entityId: id,
      changes: {
        period_old: `${booking.rental_from}–${booking.rental_to}`,
        period_new: `${rentalFrom}–${rentalTo}`,
        camera_old: curProductId,
        camera_new: newProductId,
        haftung_old: booking.haftung ?? null,
        haftung_new: effHaftung,
        items_changed: itemsProvided,
        price_old: oldTotal,
        price_new: finalTotal,
        diff,
        settlement: settle === 'none' ? 'none' : settlement,
        reason,
        pack_workflow_reset: packWasStarted,
      },
      request: req,
    });

    // Rechnung intern versionieren (non-blocking — darf den Edit nie kippen).
    await snapshotInvoiceVersion(supabase, id, {
      reason,
      triggerSource: 'booking_edit',
      previousBooking: booking as Record<string, unknown>,
      request: req,
    }).catch((e) => console.error('[booking-edit] snapshot failed:', e));

    return NextResponse.json({
      success: true,
      diff,
      settlement: settle === 'none' ? 'none' : settlement,
      adjustment_status: adjustmentStatus,
      payment_url: paymentUrl,
      new_total: finalTotal,
    });
  }

  const updates: Record<string, unknown> = {};

  // E-Mail aktualisieren
  if (customer_email !== undefined) {
    updates.customer_email = customer_email || null;
  }

  // Trackingnummer (Hin) + Carrier manuell korrigieren. Bei einer Aenderung
  // an Nummer ODER Carrier wird die tracking_url automatisch neu gebaut
  // (DHL/DPD je nach Carrier). Trackingnummer leer → URL ebenfalls null.
  // Falls fuer eine vorhandene Nummer kein Carrier gesetzt ist, klemmen wir
  // auf DHL (Backwards-Compat mit Buchungen vor Migration).
  let trackingMailHint: {
    productName: string;
    customerName: string;
    customerEmail: string;
    rentalFrom: string;
    rentalTo: string;
    trackingNumber: string;
    trackingUrl: string;
    carrier: string;
  } | null = null;
  if (tracking_number !== undefined || tracking_carrier !== undefined) {
    // Aktuelle Werte laden, damit eine Aenderung nur eines Feldes (z.B. nur
    // Carrier) den jeweils anderen Wert erhaelt.
    const { data: cur } = await supabase
      .from('bookings')
      .select('tracking_number, tracking_carrier, customer_email, customer_name, product_name, rental_from, rental_to, delivery_mode')
      .eq('id', id)
      .maybeSingle();

    const newNumber =
      tracking_number === undefined
        ? (cur?.tracking_number as string | null) ?? null
        : typeof tracking_number === 'string'
          ? tracking_number.trim().slice(0, 100) || null
          : null;

    let newCarrier: TrackingCarrier | null;
    if (tracking_carrier === undefined) {
      newCarrier = isAllowedCarrier(cur?.tracking_carrier) ? cur!.tracking_carrier : null;
    } else if (tracking_carrier === null || tracking_carrier === '') {
      newCarrier = null;
    } else if (isAllowedCarrier(tracking_carrier)) {
      newCarrier = tracking_carrier;
    } else {
      return NextResponse.json(
        { error: 'Carrier muss DHL oder DPD sein.' },
        { status: 422 },
      );
    }

    updates.tracking_number = newNumber;
    updates.tracking_carrier = newCarrier;
    updates.tracking_url = newNumber ? buildTrackingUrl(newCarrier ?? 'DHL', newNumber) : null;

    // Versandbestaetigungs-Mail an den Kunden, wenn die korrigierte Nummer
    // mit dem neuen Carrier-Link an die Kunden-Mail rausgehen soll. Nur wenn
    // (a) eine Nummer existiert, (b) eine Kunden-Mail hinterlegt ist und
    // (c) der Versand-Modus tatsaechlich 'versand' ist. Tatsaechlich
    // versendet wird nach dem DB-Update (siehe unten — fire-and-forget).
    if (
      newNumber &&
      cur?.customer_email &&
      (cur.delivery_mode ?? 'versand') === 'versand'
    ) {
      trackingMailHint = {
        productName: cur.product_name ?? '',
        customerName: cur.customer_name ?? '',
        customerEmail: cur.customer_email,
        rentalFrom: cur.rental_from ?? '',
        rentalTo: cur.rental_to ?? '',
        trackingNumber: newNumber,
        trackingUrl: updates.tracking_url as string,
        carrier: newCarrier ?? 'DHL',
      };
    }
  }

  // Trackingnummer (Retoure) + Carrier. Reines internes Tracking — kein
  // Mail-Versand an den Kunden (das Ruecksende-Etikett-PDF hat er bereits;
  // die Tracking-Nummer entsteht erst beim Etikett-Erzeugen).
  if (return_tracking_number !== undefined || return_tracking_carrier !== undefined) {
    const { data: cur } = await supabase
      .from('bookings')
      .select('return_tracking_number, return_tracking_carrier')
      .eq('id', id)
      .maybeSingle();

    const newNumber =
      return_tracking_number === undefined
        ? (cur?.return_tracking_number as string | null) ?? null
        : typeof return_tracking_number === 'string'
          ? return_tracking_number.trim().slice(0, 100) || null
          : null;

    let newCarrier: TrackingCarrier | null;
    if (return_tracking_carrier === undefined) {
      newCarrier = isAllowedCarrier(cur?.return_tracking_carrier) ? cur!.return_tracking_carrier : null;
    } else if (return_tracking_carrier === null || return_tracking_carrier === '') {
      newCarrier = null;
    } else if (isAllowedCarrier(return_tracking_carrier)) {
      newCarrier = return_tracking_carrier;
    } else {
      return NextResponse.json(
        { error: 'Carrier muss DHL oder DPD sein.' },
        { status: 422 },
      );
    }

    updates.return_tracking_number = newNumber;
    updates.return_tracking_carrier = newCarrier;
    updates.return_tracking_url = newNumber ? buildTrackingUrl(newCarrier ?? 'DHL', newNumber) : null;
  }

  // Manuelle Haftungs-Box-Anpassung (intern). null = zuruecksetzen auf
  // automatische Berechnung. Strikt validiert + saniert, damit kein Muell
  // ins JSONB-Feld landet.
  if (liability_override !== undefined) {
    if (liability_override === null) {
      updates.liability_override = null;
    } else {
      const sanitized: { camera_product_id?: string; accessories?: { id: string; qty: number }[] } = {};
      const camId = liability_override.camera_product_id;
      if (typeof camId === 'string' && camId.trim()) {
        sanitized.camera_product_id = camId.trim().slice(0, 100);
      }
      if (Array.isArray(liability_override.accessories)) {
        sanitized.accessories = liability_override.accessories
          .filter((a) => a && typeof a.id === 'string' && a.id.trim())
          .map((a) => ({
            id: a.id.trim().slice(0, 100),
            qty: Math.min(99, Math.max(1, Math.round(Number(a.qty) || 1))),
          }))
          .slice(0, 50);
      }
      // Kein einziges sinnvolles Feld → wie zuruecksetzen behandeln.
      updates.liability_override =
        sanitized.camera_product_id || sanitized.accessories ? sanitized : null;
    }
  }

  // Verification-Gate manuell freigeben / widerrufen
  // (idempotent; bei unbekannter Spalte ignoriert Supabase still den Wert nicht —
  //  daher wird die Migration `supabase-verification-deferred.sql` vorausgesetzt,
  //  sobald Admin das Gate explizit benutzt).
  if (verification_gate === 'approve') {
    updates.verification_gate_passed_at = new Date().toISOString();
  } else if (verification_gate === 'revoke') {
    updates.verification_gate_passed_at = null;
  }

  // Versand-/Rueckgabe-Datum Override pro Buchung. Akzeptiert YYYY-MM-DD oder
  // leeren String/null (= zuruecksetzen). Bei fehlender Migration faengt der
  // unten stehende defensive Retry den Schema-Fehler ab und schreibt ohne
  // die Spalten.
  if (ship_date_override !== undefined) {
    try {
      updates.ship_date_override = sanitizeOverrideDate(ship_date_override);
    } catch (e) {
      return NextResponse.json(
        { error: `Versand-/Uebergabe-Datum: ${e instanceof Error ? e.message : 'ungueltig'}` },
        { status: 422 },
      );
    }
  }
  if (return_due_date_override !== undefined) {
    try {
      updates.return_due_date_override = sanitizeOverrideDate(return_due_date_override);
    } catch (e) {
      return NextResponse.json(
        { error: `Rueckgabe-Datum: ${e instanceof Error ? e.message : 'ungueltig'}` },
        { status: 422 },
      );
    }
  }

  // Status aktualisieren
  // Bei Status-Wechsel: Pre-Status laden fuer atomaren Status-Guard (Race-Schutz
  // gegen parallele Aktionen wie Stripe-Webhook oder Doppel-Klick auf Storno).
  let preStatus: string | null = null;
  if (status) {
    const allowed = ['pending_verification', 'awaiting_payment', 'confirmed', 'preparing_shipment', 'awaiting_pickup', 'shipped', 'delivered', 'picked_up', 'completed', 'cancelled', 'damaged'];
    if (!allowed.includes(status)) {
      return NextResponse.json({ error: 'Ungültiger Status.' }, { status: 400 });
    }
    updates.status = status;

    // Pre-Status holen (kombiniert mit Notes-Lookup fuer Storno-Grund)
    const { data: existing } = await supabase
      .from('bookings')
      .select('status, notes')
      .eq('id', id)
      .maybeSingle();

    if (!existing) {
      return NextResponse.json({ error: 'Buchung nicht gefunden.' }, { status: 404 });
    }
    preStatus = existing.status;

    // Bei Stornierung: Grund in Notizen speichern
    if (status === 'cancelled' && cancellation_reason) {
      const existingNotes = existing.notes ? `${existing.notes} | ` : '';
      updates.notes = `${existingNotes}Stornierungsgrund: ${cancellation_reason}`;
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Keine Änderungen.' }, { status: 400 });
  }

  // Atomar updaten — bei Status-Wechsel mit Pre-Status-Guard, sonst nur per id.
  let updateQuery = supabase.from('bookings').update(updates).eq('id', id);
  if (preStatus !== null) {
    updateQuery = updateQuery.eq('status', preStatus);
  }
  let { data: updated, error } = await updateQuery.select('id').maybeSingle();

  // Defensiver Fallback: Migration supabase-bookings-liability-override.sql
  // noch nicht durch → Update ohne die unbekannte Spalte erneut versuchen,
  // damit Status-/E-Mail-Aenderungen nicht mit 500 abbrechen.
  if (error && 'liability_override' in updates && /liability_override/i.test(error.message || '')) {
    const { liability_override: _drop, ...rest } = updates;
    void _drop;
    if (Object.keys(rest).length > 0) {
      let retry = supabase.from('bookings').update(rest).eq('id', id);
      if (preStatus !== null) retry = retry.eq('status', preStatus);
      const r = await retry.select('id').maybeSingle();
      updated = r.data;
      error = r.error;
    } else {
      return NextResponse.json(
        { error: 'Manuelle Anpassung nicht moeglich — DB-Migration steht noch aus.' },
        { status: 503 },
      );
    }
  }

  // Defensiver Fallback: Migration supabase-bookings-tracking-carrier-return.sql
  // noch nicht durch → die vier neuen Spalten (tracking_carrier, return_tracking_*)
  // einmalig droppen und Update erneut versuchen, damit die uebrigen Updates
  // (Status, E-Mail, Trackingnummer alt) trotzdem durchlaufen.
  if (
    error &&
    /tracking_carrier|return_tracking/i.test(error.message || '') &&
    ('tracking_carrier' in updates ||
      'return_tracking_number' in updates ||
      'return_tracking_url' in updates ||
      'return_tracking_carrier' in updates)
  ) {
    const {
      tracking_carrier: _tc,
      return_tracking_number: _rn,
      return_tracking_url: _ru,
      return_tracking_carrier: _rc,
      ...rest
    } = updates;
    void _tc; void _rn; void _ru; void _rc;
    if (Object.keys(rest).length > 0) {
      let retry = supabase.from('bookings').update(rest).eq('id', id);
      if (preStatus !== null) retry = retry.eq('status', preStatus);
      const r = await retry.select('id').maybeSingle();
      updated = r.data;
      error = r.error;
    } else {
      return NextResponse.json(
        { error: 'Tracking-Anpassung nicht moeglich — Migration steht noch aus.' },
        { status: 503 },
      );
    }
  }

  // Defensiver Fallback: Migration supabase-bookings-shipping-overrides.sql
  // noch nicht durch → Override-Spalten droppen und Update neu versuchen.
  // Bei reinem Override-Edit (kein Status, kein anderes Feld): 503.
  if (
    error &&
    /ship_date_override|return_due_date_override/i.test(error.message || '') &&
    ('ship_date_override' in updates || 'return_due_date_override' in updates)
  ) {
    const { ship_date_override: _sd, return_due_date_override: _rd, ...rest } = updates;
    void _sd; void _rd;
    if (Object.keys(rest).length > 0) {
      let retry = supabase.from('bookings').update(rest).eq('id', id);
      if (preStatus !== null) retry = retry.eq('status', preStatus);
      const r = await retry.select('id').maybeSingle();
      updated = r.data;
      error = r.error;
    } else {
      return NextResponse.json(
        { error: 'Versand-/Rueckgabe-Datum-Anpassung nicht moeglich — Migration `supabase-bookings-shipping-overrides.sql` steht noch aus.' },
        { status: 503 },
      );
    }
  }

  if (error) {
    console.error('Booking update error:', error);
    return NextResponse.json({ error: 'Aktualisierung fehlgeschlagen.' }, { status: 500 });
  }

  if (!updated && preStatus !== null) {
    // 0 Rows geändert — Status wurde zwischenzeitlich von woanders geflippt
    // (Webhook, Doppel-Klick, paralleler Admin). Sauber 409 statt blind ueberschreiben.
    return NextResponse.json(
      { error: `Status hat sich zwischenzeitlich geändert (war: ${preStatus}). Bitte Buchung neu laden.` },
      { status: 409 },
    );
  }

  // Versand-Mail mit korrigiertem Tracking-Link an den Kunden (non-blocking).
  // trackingMailHint wird nur gesetzt, wenn Hin-Tracking geaendert wurde und
  // alle Voraussetzungen passen (Nummer + Mail + delivery_mode='versand').
  if (trackingMailHint) {
    sendShippingConfirmation({
      bookingId: id,
      ...trackingMailHint,
    }).catch((err) => console.error('[booking-update] shipping confirmation re-send failed:', err));
  }

  // Bei Stornierung: Stripe-Link deaktivieren, Zubehoer freigeben, Mails raus.
  // Alles non-blocking — Response geht sofort, der Rest haengt im Hintergrund.
  if (status === 'cancelled') {
    const { data: booking } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (booking) {
      // Stripe Payment Link deaktivieren (falls vorhanden), damit der Kunde
      // nicht noch nach Stornierung zahlt.
      if (booking.stripe_payment_link_id) {
        try {
          const stripe = await getStripe();
          await stripe.paymentLinks.update(booking.stripe_payment_link_id, { active: false });
        } catch (err) {
          console.error('[booking-cancel] Stripe Payment Link deaktivieren fehlgeschlagen:', err);
        }
      }

      // Sweep 8 H3: Kautions-Pre-Auth releasen — sonst bleibt der ~500-EUR-Hold
      // 7 Tage auf der Karte des Kunden, obwohl die Buchung storniert ist.
      // Beschwerden-Vektor + theoretische Schadens-Capture-Manipulation.
      if (booking.deposit_intent_id && booking.deposit_status === 'held') {
        try {
          const stripe = await getStripe();
          await stripe.paymentIntents.cancel(booking.deposit_intent_id);
          await supabase
            .from('bookings')
            .update({ deposit_status: 'released', deposit_released_at: new Date().toISOString() })
            .eq('id', id);
        } catch (depositErr) {
          console.error('[booking-cancel] Deposit-Release fehlgeschlagen:', depositErr);
        }
      }

      // Zubehoer-Exemplare freigeben (non-blocking)
      releaseAccessoryUnitsFromBooking(id).catch((err) =>
        console.error('[booking-cancel] accessory-unit release failed:', err),
      );

      // ── Rueckerstattung ──────────────────────────────────────────────────
      // refund_amount kommt aus dem Storno-Fenster (keiner / voll / Teilbetrag),
      // gedeckelt auf den Buchungsbetrag. Bei > 0 und echtem Stripe-PaymentIntent
      // wird der Refund automatisch ausgeloest.
      const priceTotal = Number(booking.price_total ?? 0);
      const requestedRefund = Math.max(0, Math.min(priceTotal, Number(refund_amount) || 0));
      const piId = (booking.payment_intent_id ?? '').toString();
      const isStripePI = piId.startsWith('pi_');
      // stripe_refund=false → Admin erstattet selbst (z.B. bereits manuell
      // erstattet / Kulanz aussserhalb Stripe). Betrag wird trotzdem in Mail
      // + Stornierungsbeleg ausgewiesen, aber Stripe loest NICHTS aus.
      const wantStripeRefund = stripe_refund !== false;
      let refundStatus = 'not_applicable';
      let stripeRefundId: string | null = null;
      let refundDone = false;

      if (requestedRefund > 0) {
        if (isStripePI && wantStripeRefund) {
          try {
            const stripe = await getStripe();
            const refund = await stripe.refunds.create(
              {
                payment_intent: piId,
                amount: Math.round(requestedRefund * 100),
                reason: 'requested_by_customer',
              },
              { idempotencyKey: `cancel-refund:${id}:${Math.round(requestedRefund * 100)}` },
            );
            stripeRefundId = refund.id;
            refundStatus = refund.status === 'succeeded' ? 'succeeded' : 'pending';
            refundDone = true;
          } catch (refundErr) {
            refundStatus = 'failed_pending_admin';
            console.error('[booking-cancel] Stripe-Refund fehlgeschlagen:', refundErr);
            try {
              await createAdminNotification(supabase, {
                type: 'payment_failed',
                title: `Storno ${id}: Refund fehlgeschlagen`,
                message: `Automatischer Refund (${requestedRefund.toFixed(2)} EUR) fehlgeschlagen — bitte manuell in Stripe erstatten.`,
                link: `/admin/buchungen/${id}`,
              });
            } catch { /* Notification best-effort */ }
          }
        } else {
          // Kein automatischer Stripe-Refund: entweder manuelle Buchung
          // (MANUAL-/PENDING-...) ODER der Admin hat "ohne Stripe" gewaehlt.
          // Der Admin erstattet selbst; Betrag wird dennoch dokumentiert.
          refundStatus = 'manual';
        }

        // Refund-Betrag + Status auf der Buchung dokumentieren (defensiver
        // Retry ohne die Spalten, falls supabase-bookings-refund.sql aussteht).
        const refundNoteEntry = `Storno-Rueckerstattung ${requestedRefund.toFixed(2)} EUR (${refundStatus})`;
        const existingRefundNote = (booking.refund_note ?? '') as string;
        const refundUpdate: Record<string, unknown> = {
          refund_amount: requestedRefund,
          refund_note: existingRefundNote ? `${existingRefundNote} | ${refundNoteEntry}` : refundNoteEntry,
        };
        const { error: refundUpdErr } = await supabase.from('bookings').update(refundUpdate).eq('id', id);
        if (refundUpdErr && /refund_amount|refund_note/i.test(refundUpdErr.message || '')) {
          console.warn('[booking-cancel] refund_amount/refund_note Migration steht aus — Betrag nicht persistiert.');
        }
      }

      // ── Stornierungs-Mails (non-blocking, nur wenn send_email !== false) ──
      const wantEmail = send_email !== false;
      const wantInvoiceAttachment = attach_invoice === true;
      if (wantEmail && booking.customer_email) {
        const emailData = {
          bookingId: booking.id,
          customerName: booking.customer_name ?? '',
          customerEmail: booking.customer_email,
          productName: booking.product_name,
          productId: booking.product_id,
          rentalFrom: booking.rental_from,
          rentalTo: booking.rental_to,
          days: booking.days,
          priceTotal,
          refundAmount: requestedRefund,
          refundPercentage: priceTotal > 0 ? requestedRefund / priceTotal : 0,
        };
        // Kunden-Mail mit optionalem Rechnungs-PDF-Anhang (async, damit das
        // PDF-Rendern die Response nicht blockiert).
        (async () => {
          const attachments: { filename: string; content: Buffer }[] = [];
          if (wantInvoiceAttachment && priceTotal > 0) {
            try {
              const { renderInvoicePdfBuffer } = await import('@/lib/invoice-pdf-buffer');
              attachments.push({ filename: `Rechnung-${booking.id}.pdf`, content: await renderInvoicePdfBuffer(supabase, booking) });
            } catch (e) {
              console.error('[booking-cancel] Rechnungs-Anhang fehlgeschlagen:', e);
            }
          }
          await sendCancellationConfirmation(emailData, { attachments });
        })().catch((err) => console.error('[booking-cancel] customer cancellation mail failed:', err));
        sendAdminCancellationNotification(emailData).catch((err) =>
          console.error('[booking-cancel] admin cancellation mail failed:', err),
        );
      } else if (!wantEmail) {
        console.info(`[booking-cancel] Buchung ${id} storniert ohne Kunden-E-Mail (Admin-Wahl).`);
      } else {
        console.warn(`[booking-cancel] Buchung ${id} storniert, aber keine Kunden-E-Mail hinterlegt — keine Mail versendet.`);
      }

      // ── Stornierungsbeleg (Gutschrift) ──────────────────────────────────
      // Echte Stornorechnung: hebt die komplette Originalrechnung auf (voller
      // Buchungsbetrag), unabhaengig vom tatsaechlich erstatteten Betrag. Der
      // erstattete Betrag (requestedRefund) steht als "davon erstattet"-Zeile
      // auf dem Beleg (gelesen aus bookings.refund_amount). Wird erzeugt, wenn
      // die Buchung einen Betrag hatte UND eine Mail rausgeht ODER erstattet
      // wurde. Best-effort/non-blocking. (refundDone nur fuer Doku referenziert.)
      void refundDone;
      if (priceTotal > 0 && refundStatus !== 'failed_pending_admin' && (wantEmail || requestedRefund > 0)) {
        (async () => {
          const cnId = await createCancellationCreditNote(supabase, {
            bookingId: id,
            grossAmount: priceTotal,
            reason: cancellation_reason || 'Stornierung der Buchung',
            refundStatus,
            stripeRefundId,
          });
          if (cnId) {
            await dispatchCreditNoteDocument(supabase, cnId, { sendEmail: wantEmail });
          }
        })().catch((err) => console.error('[booking-cancel] Stornierungsbeleg fehlgeschlagen:', err));
      }
    }
  }

  // Bei Abschluss: Abschluss-Bestätigung ("alles in Ordnung" + Kundenmaterial)
  // an den Kunden, non-blocking. Dedup im Helper → keine Doppel-Mail mit dem
  // Retouren-Prüf-Pfad.
  if (status === 'completed') {
    dispatchCompletionEmail(supabase, id)
      .catch((err) => console.error('[booking-update] completion email failed:', err));
  }

  // Audit-Log mit passendem Action-Namen
  let action = 'booking.update';
  if (status === 'cancelled') action = 'booking.cancel';
  else if (verification_gate) action = 'booking.verification_gate';
  else if (customer_email !== undefined && !status) action = 'booking.email_updated';
  else if (
    !status &&
    (tracking_number !== undefined ||
      tracking_carrier !== undefined ||
      return_tracking_number !== undefined ||
      return_tracking_carrier !== undefined)
  ) {
    action = 'booking.tracking_update';
  }

  await logAudit({
    action,
    entityType: 'booking',
    entityId: id,
    changes: updates,
    request: req,
  });

  return NextResponse.json({ success: true });
}

/**
 * DELETE /api/admin/booking/[id]
 * Löscht eine Buchung unwiderruflich aus der Datenbank.
 * Erfordert Admin-Passwort.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const { password } = body as { password?: string };

  // Bestätigung durch Admin-Passwort (zusätzlich zur Middleware-Auth).
  // Verhindert versehentliches Löschen, z.B. wenn Admin-Tablet offen liegt.
  const adminPassword = process.env.ADMIN_PASSWORD ?? '';
  if (!adminPassword || password !== adminPassword) {
    return NextResponse.json({ error: 'Falsches Passwort.' }, { status: 403 });
  }

  const supabase = createServiceClient();

  // Sweep 9 Upload-M1: Storage-Files mit-loeschen (analog anonymize-customer
  // K12). Vorher blieben Vertraege, Schadensfotos, Pack-/Uebergabefotos
  // verwaist im Storage liegen. Best-effort — Fehler werden nur geloggt.
  const cleanupBucketPrefix = async (bucket: string, prefix: string) => {
    try {
      const { data: files } = await supabase.storage.from(bucket).list(prefix);
      if (files && files.length > 0) {
        const paths = files.map((f) => `${prefix}/${f.name}`);
        await supabase.storage.from(bucket).remove(paths);
      }
    } catch (e) {
      console.warn(`[booking-delete] storage cleanup ${bucket}/${prefix}:`, e);
    }
  };
  await cleanupBucketPrefix('damage-photos', id);
  await cleanupBucketPrefix('packing-photos', id);
  await cleanupBucketPrefix('handover-photos', id);

  // Zugehörige Daten löschen (rental_agreements, email_log)
  await supabase.from('rental_agreements').delete().eq('booking_id', id);
  await supabase.from('email_log').delete().eq('booking_id', id);

  const { error } = await supabase
    .from('bookings')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Booking delete error:', error);
    return NextResponse.json({ error: 'Buchung konnte nicht gelöscht werden.' }, { status: 500 });
  }

  await logAudit({
    action: 'booking.delete',
    entityType: 'booking',
    entityId: id,
    request: req,
  });

  return NextResponse.json({ success: true });
}
