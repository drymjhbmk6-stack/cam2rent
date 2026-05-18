import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';
import { sendCancellationConfirmation, sendAdminCancellationNotification } from '@/lib/email';
import { assignAccessoryUnitsToBooking, releaseAccessoryUnitsFromBooking } from '@/lib/accessory-unit-assignment';
import { computeAccessoryAvailability } from '@/lib/accessory-availability';
import { getStripe } from '@/lib/stripe';
import { DEFAULT_HAFTUNG, getEigenbeteiligung, type HaftungConfig } from '@/lib/price-config';
import { computeReplacementValue, loadReplacementValueConfig } from '@/lib/replacement-value';
import { getInventarWbwByLegacyUnitIds, getInventarWbwForBookingAccessories, getInventarWbwAverageByLegacyProductId } from '@/lib/inventar/wbw-bridge';

type ResolvedItem = { id: string; name: string; qty: number; accessory_id?: string; isFromSet?: boolean; setName?: string; included_parts?: string[] };

/**
 * Loest eine Liste { accessory_id, qty } in benannte Positionen auf.
 * Sets werden expandiert (Container-Zeile + Sub-Items mit isFromSet).
 * Wird sowohl fuer die echte Buchung (Packliste/Vertrag) als auch fuer
 * die manuell ueberschriebene interne Haftungs-Box genutzt.
 */
async function resolveAccessoryItems(
  supabase: ReturnType<typeof createServiceClient>,
  rawItems: { accessory_id: string; qty: number }[],
): Promise<ResolvedItem[]> {
  const resolved: ResolvedItem[] = [];
  if (rawItems.length === 0) return resolved;

  const allIds = [...new Set(rawItems.map((r) => r.accessory_id))];
  type AccLookup = { name: string; included_parts: string[] };
  const accLookup: Record<string, AccLookup> = {};
  let accs: Array<{ id: string; name: string; included_parts?: string[] | null }> | null = null;

  // Zwei Versuche: erst inkl. included_parts (neue Migration), bei
  // fehlender Spalte ohne — kein 500 wenn Migration noch aussteht.
  const accFull = await supabase.from('accessories').select('id, name, included_parts').in('id', allIds);
  if (accFull.error && /column .*included_parts/i.test(accFull.error.message)) {
    const accFallback = await supabase.from('accessories').select('id, name').in('id', allIds);
    accs = accFallback.data ?? [];
  } else {
    accs = accFull.data ?? [];
  }
  const { data: sets } = await supabase.from('sets').select('id, name, accessory_items').in('id', allIds);

  for (const a of accs ?? []) {
    accLookup[a.id] = {
      name: a.name as string,
      included_parts: Array.isArray(a.included_parts) ? a.included_parts as string[] : [],
    };
  }
  const setMap: Record<string, { name: string; items: { accessory_id: string; qty: number }[] }> = {};
  for (const s of sets ?? []) {
    setMap[s.id] = {
      name: s.name as string,
      items: Array.isArray(s.accessory_items) ? (s.accessory_items as { accessory_id: string; qty: number }[]) : [],
    };
  }

  // Set-Sub-Item-Namen separat nachladen (wenn nicht schon im accLookup)
  const setSubIds = new Set<string>();
  for (const setInfo of Object.values(setMap)) {
    for (const it of setInfo.items) {
      if (!accLookup[it.accessory_id]) setSubIds.add(it.accessory_id);
    }
  }
  if (setSubIds.size > 0) {
    const subFull = await supabase
      .from('accessories')
      .select('id, name, included_parts')
      .in('id', [...setSubIds]);
    let subRows: Array<{ id: string; name: string; included_parts?: string[] | null }> = subFull.data ?? [];
    if (subFull.error && /column .*included_parts/i.test(subFull.error.message)) {
      const subFallback = await supabase.from('accessories').select('id, name').in('id', [...setSubIds]);
      subRows = subFallback.data ?? [];
    }
    for (const a of subRows) {
      accLookup[a.id] = {
        name: a.name as string,
        included_parts: Array.isArray(a.included_parts) ? a.included_parts as string[] : [],
      };
    }
  }

  for (const item of rawItems) {
    const setInfo = setMap[item.accessory_id];
    if (setInfo) {
      // Set-Container-Zeile zur Orientierung, dann Sub-Items expandiert
      resolved.push({ id: item.accessory_id, name: setInfo.name, qty: item.qty });
      for (const sub of setInfo.items) {
        const subAcc = accLookup[sub.accessory_id];
        resolved.push({
          id: sub.accessory_id,
          accessory_id: sub.accessory_id,
          name: subAcc?.name ?? sub.accessory_id,
          qty: (sub.qty || 1) * item.qty,
          isFromSet: true,
          setName: setInfo.name,
          included_parts: subAcc?.included_parts && subAcc.included_parts.length > 0 ? subAcc.included_parts : undefined,
        });
      }
    } else {
      const acc = accLookup[item.accessory_id];
      resolved.push({
        id: item.accessory_id,
        accessory_id: item.accessory_id,
        name: acc?.name ?? item.accessory_id,
        qty: item.qty,
        included_parts: acc?.included_parts && acc.included_parts.length > 0 ? acc.included_parts : undefined,
      });
    }
  }
  return resolved;
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

  // Seriennummer laden falls Unit zugeordnet — bevorzugt aus inventar_units
  // (neue Welt) via migration_audit-Mapping. Fallback auf product_units fuer
  // Pre-Migration-Buchungen.
  let serialNumber: string | null = null;
  if (booking.unit_id) {
    try {
      const { data: audit } = await supabase
        .from('migration_audit')
        .select('neue_id')
        .eq('alte_tabelle', 'product_units')
        .eq('alte_id', booking.unit_id)
        .eq('neue_tabelle', 'inventar_units')
        .maybeSingle();
      if ((audit as { neue_id?: string } | null)?.neue_id) {
        const { data: invUnit } = await supabase
          .from('inventar_units')
          .select('seriennummer, inventar_code, bezeichnung')
          .eq('id', (audit as { neue_id: string }).neue_id)
          .maybeSingle();
        const u = invUnit as { seriennummer: string | null; inventar_code: string | null; bezeichnung: string } | null;
        serialNumber = u?.seriennummer ?? u?.inventar_code ?? u?.bezeichnung ?? null;
      }
    } catch {
      // migration_audit fehlt → Fallback unten
    }
    if (!serialNumber) {
      const { data: unit } = await supabase
        .from('product_units')
        .select('serial_number')
        .eq('id', booking.unit_id)
        .maybeSingle();
      serialNumber = unit?.serial_number ?? null;
    }
  }
  booking.serial_number = serialNumber;

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

  const resolved = await resolveAccessoryItems(supabase, rawItems);
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

  // 1. Kamera-WBW — pauschal berechnet (linear -> Floor).
  // Bei Override-Kamera entfaellt der unit_id-Asset-Pfad (die unit_id
  // gehoert zur Original-Kamera) → direkt Inventar-Durchschnitt → Kaution.
  const wbwConfig = await loadReplacementValueConfig(supabase);
  let cameraValue = 0;
  let cameraSource: Line['source'] = 'unknown';
  if (!cameraOverridden && booking.unit_id) {
    const primary = await supabase
      .from('assets')
      .select('purchase_price, purchase_date, current_value, replacement_value_estimate')
      .eq('unit_id', booking.unit_id as string)
      .eq('status', 'active')
      .maybeSingle();
    let row: { purchase_price?: number | null; purchase_date?: string | null; current_value?: number | null; replacement_value_estimate?: number | null } | null = primary.data;
    if (primary.error && /replacement_value_estimate/i.test(primary.error.message)) {
      const fb = await supabase
        .from('assets')
        .select('purchase_price, purchase_date, current_value')
        .eq('unit_id', booking.unit_id as string)
        .eq('status', 'active')
        .maybeSingle();
      row = fb.data;
    }
    if (row && row.purchase_date && row.purchase_price != null) {
      cameraValue = computeReplacementValue({
        purchase_price: row.purchase_price,
        purchase_date: row.purchase_date,
        replacement_value_estimate: row.replacement_value_estimate ?? null,
      }, wbwConfig);
      cameraSource = 'asset';
    }
  }
  // Fallback 1: inventar_units (neue Welt) via migration_audit → unit_id.
  // Greift wenn die Buchung eine konkrete product_unit zugeordnet hat.
  if (cameraValue === 0 && !cameraOverridden && booking.unit_id) {
    try {
      const m = await getInventarWbwByLegacyUnitIds(supabase, [booking.unit_id as string], 'product_units');
      const v = m.get(booking.unit_id as string);
      if (v && v > 0) {
        cameraValue = v;
        cameraSource = 'asset';
      }
    } catch {
      // weiter zum naechsten Fallback
    }
  }
  // Fallback 2: inventar_units-Durchschnitt ueber product_id. Greift wenn die
  // Buchung kein konkretes unit_id hat (Assignment gescheitert) — der Admin
  // soll trotzdem einen plausiblen WBW sehen, nicht 0,00 EUR.
  if (cameraValue === 0 && cameraId) {
    try {
      const avg = await getInventarWbwAverageByLegacyProductId(supabase, cameraId);
      if (avg && avg > 0) {
        cameraValue = avg;
        cameraSource = 'asset';
      }
    } catch {
      // weiter zum Deposit-Fallback
    }
  }
  if (cameraValue === 0) {
    // Fallback 3: Kautionswert (im Haftung-Modus nur Anker, im Kaution-Modus echt)
    cameraValue = productDeposit;
    cameraSource = productDeposit > 0 ? 'product_deposit' : 'unknown';
  }

  const cameraLine: Line = {
    name: cameraName,
    qty: 1,
    unit_value: cameraValue,
    total_value: cameraValue,
    source: cameraSource,
  };

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
  const totalWbw = cameraValue + accessoriesTotal;

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
  const { status, cancellation_reason, customer_email, verification_gate, liability_override } = body as {
    status?: string;
    cancellation_reason?: string;
    customer_email?: string;
    verification_gate?: 'approve' | 'revoke';
    liability_override?: {
      camera_product_id?: string | null;
      accessories?: { id: string; qty: number }[] | null;
    } | null;
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

    // Items sanitisieren + Duplikate (gleiche accessory_id) zusammenfassen
    const cleaned = accessoryEdit.items
      .filter((x) => x && typeof x.accessory_id === 'string' && x.accessory_id.trim())
      .map((x) => ({
        accessory_id: (x.accessory_id as string).trim().slice(0, 100),
        qty: Math.min(99, Math.max(1, Math.round(Number(x.qty) || 1))),
      }))
      .slice(0, 50);
    const mergedMap = new Map<string, number>();
    for (const it of cleaned) {
      mergedMap.set(it.accessory_id, Math.min(99, (mergedMap.get(it.accessory_id) ?? 0) + it.qty));
    }
    const newItems = [...mergedMap.entries()].map(([accessory_id, qty]) => ({ accessory_id, qty }));

    // IDs muessen existierende Accessories sein — keine Set-IDs zulassen
    const ids = newItems.map((i) => i.accessory_id);
    if (ids.length > 0) {
      const { data: accChk } = await supabase.from('accessories').select('id').in('id', ids);
      const known = new Set((accChk ?? []).map((a) => a.id as string));
      const unknown = ids.filter((i) => !known.has(i));
      if (unknown.length > 0) {
        const { data: setChk } = await supabase.from('sets').select('id').in('id', unknown);
        const setHit = (setChk ?? []).map((s) => s.id as string);
        return NextResponse.json(
          {
            error: setHit.length > 0
              ? 'Sets sind hier nicht erlaubt — bitte die enthaltenen Einzelteile auswählen.'
              : `Unbekanntes Zubehör: ${unknown.join(', ')}`,
          },
          { status: 422 },
        );
      }
    }

    // Roh-Bestand fuer Audit-Log (kann Set-IDs enthalten — nur Doku)
    const oldItemsArr: { accessory_id: string; qty: number }[] =
      Array.isArray(booking.accessory_items) && booking.accessory_items.length > 0
        ? (booking.accessory_items as { accessory_id: string; qty: number }[])
        : (Array.isArray(booking.accessories) ? (booking.accessories as string[]) : []).map((a) => ({ accessory_id: a, qty: 1 }));

    const oldUnitIds: string[] = Array.isArray(booking.accessory_unit_ids)
      ? (booking.accessory_unit_ids as string[]).filter(Boolean)
      : [];

    // Bestehende Unit→Accessory-Zuordnung laden (das ist die WAHRHEIT ueber
    // den Ist-Bestand der Buchung — NICHT accessory_items, das bei
    // Set-Buchungen nur die Set-ID enthaelt).
    let unitAcc: { id: string; accessory_id: string }[] = [];
    if (oldUnitIds.length > 0) {
      const { data: ua } = await supabase
        .from('accessory_units')
        .select('id, accessory_id')
        .in('id', oldUnitIds);
      unitAcc = (ua ?? []) as { id: string; accessory_id: string }[];
    }
    const unitsByAcc = new Map<string, string[]>();
    for (const u of unitAcc) {
      const arr = unitsByAcc.get(u.accessory_id) ?? [];
      arr.push(u.id);
      unitsByAcc.set(u.accessory_id, arr);
    }
    const resolvableOld = new Set(unitAcc.map((u) => u.id));

    // Verfuegbarkeit HART pruefen — DIESE Buchung wird ausgeschlossen, damit
    // sie nicht gegen sich selbst blockiert. Es muss die GESAMTE neue Menge
    // pro Position in den (um diese Buchung bereinigten) Restbestand passen.
    // In-process (kein HTTP-Self-Fetch — hinter Cloudflare/Firewall unzuverl.).
    if (newItems.length > 0) {
      const dm = (booking.delivery_mode as string) || 'versand';
      const availMap = new Map<string, { name: string; remaining: number }>();
      try {
        const avail = await computeAccessoryAvailability({
          from: String(booking.rental_from),
          to: String(booking.rental_to),
          productId: booking.product_id ? String(booking.product_id) : null,
          deliveryMode: dm,
          excludeBookingId: id,
        });
        for (const a of avail.accessories) {
          availMap.set(a.id, { name: a.name, remaining: a.available_qty_remaining });
        }
      } catch (e) {
        console.error('[booking-accessory-edit] availability check failed:', e);
        return NextResponse.json(
          { error: 'Verfügbarkeit konnte nicht geprüft werden. Bitte erneut versuchen.' },
          { status: 503 },
        );
      }
      const blocked: string[] = [];
      for (const it of newItems) {
        const av = availMap.get(it.accessory_id);
        // Kein Eintrag in availMap = Bulk/nicht-trackbar → nicht blockieren.
        if (av && av.remaining < it.qty) blocked.push(av.name);
      }
      if (blocked.length > 0) {
        return NextResponse.json(
          { error: `Im Mietzeitraum nicht genug freie Exemplare: ${blocked.join(', ')}. Änderung wurde NICHT gespeichert.` },
          { status: 409 },
        );
      }
    }

    // Mutation — bestehende Units pro Accessory behalten (bis zur neuen
    // Menge), nur den echten Fehlbestand neu zuweisen, Ueberzaehliges
    // freigeben. Basis ist der tatsaechliche Unit-Bestand (unitsByAcc),
    // NICHT die Set-ID-behaftete accessory_items — sonst Self-Kollision.
    const newQtyMap = new Map(newItems.map((i) => [i.accessory_id, i.qty]));
    const allAccIds = new Set<string>([...unitsByAcc.keys(), ...newItems.map((i) => i.accessory_id)]);

    const keptUnitIds: string[] = [];
    const releaseUnitIds: string[] = [];
    const deltaItems: { accessory_id: string; qty: number }[] = [];
    for (const accId of allAccIds) {
      const existing = unitsByAcc.get(accId) ?? [];
      const want = newQtyMap.get(accId) ?? 0;
      const keep = existing.slice(0, want);
      keptUnitIds.push(...keep);
      releaseUnitIds.push(...existing.slice(keep.length));
      const assignQty = want - keep.length; // nur echter Fehlbestand
      if (assignQty > 0) deltaItems.push({ accessory_id: accId, qty: assignQty });
    }
    // Alte Unit-IDs ohne aufloesbares Accessory (geloeschte Unit-Row) freigeben
    for (const uid of oldUnitIds) {
      if (!resolvableOld.has(uid)) releaseUnitIds.push(uid);
    }

    const assignRes = deltaItems.length > 0
      ? await assignAccessoryUnitsToBooking(
          id,
          deltaItems,
          String(booking.rental_from),
          String(booking.rental_to),
        )
      : { assigned: {} as Record<string, string[]>, missing: [] as string[] };

    if (assignRes.missing.length > 0) {
      // Race zwischen Pruefung und RPC — frisch zugewiesene Units freigeben,
      // Array auf alten Stand zuruecksetzen, Buchung bleibt unveraendert.
      const fresh = Object.values(assignRes.assigned).flat();
      if (fresh.length > 0) {
        try { await releaseAccessoryUnitsFromBooking(id, fresh); } catch { /* best-effort */ }
      }
      await supabase.from('bookings').update({ accessory_unit_ids: oldUnitIds }).eq('id', id);
      const { data: missAcc } = await supabase
        .from('accessories')
        .select('id, name')
        .in('id', assignRes.missing);
      const nameMap = new Map((missAcc ?? []).map((a) => [a.id as string, a.name as string]));
      const missNames = assignRes.missing.map((mid) => nameMap.get(mid) ?? mid);
      return NextResponse.json(
        { error: `Im Mietzeitraum nicht genug freie Exemplare: ${missNames.join(', ')}. Änderung wurde NICHT gespeichert.` },
        { status: 409 },
      );
    }
    const freshUnitIds = Object.values(assignRes.assigned).flat();
    const finalUnitIds = [...keptUnitIds, ...freshUnitIds];

    // Ueberzaehlige / entfernte Units freigeben (nur Status, schont Units in
    // anderen aktiven Buchungen)
    if (releaseUnitIds.length > 0) {
      try {
        await releaseAccessoryUnitsFromBooking(id, releaseUnitIds);
      } catch (e) {
        console.error('[booking-accessory-edit] release surplus units failed:', e);
      }
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
      accessory_items: newItems,
      accessories: [...new Set(newItems.map((i) => i.accessory_id))],
      accessory_unit_ids: finalUnitIds,
      notes: `${existingNotes}${noteLine}`,
    };
    if (priceValid) upd.price_total = newPrice;

    // Pack-Workflow zuruecksetzen, falls schon gepackt/kontrolliert — die
    // 4-Augen-Snapshots + Signaturen wuerden sonst den ALTEN Inhalt
    // bescheinigen. Packliste-PDF/HTML liest live aus accessory_items und
    // zieht automatisch nach; nur der digitale Pack-Status muss neu.
    const packWasStarted = !!booking.pack_status;
    if (packWasStarted) {
      Object.assign(upd, {
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
      });
      if (booking.pack_photo_url) {
        await supabase.storage
          .from('packing-photos')
          .remove([booking.pack_photo_url as string])
          .catch(() => { /* best-effort */ });
      }
    }

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
        old_items: oldItemsArr,
        new_items: newItems,
        price_old: booking.price_total ?? null,
        price_new: priceValid ? newPrice : null,
        reason,
        pack_workflow_reset: packWasStarted,
      },
      request: req,
    });

    return NextResponse.json({ success: true });
  }

  const updates: Record<string, unknown> = {};

  // E-Mail aktualisieren
  if (customer_email !== undefined) {
    updates.customer_email = customer_email || null;
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

  // Status aktualisieren
  // Bei Status-Wechsel: Pre-Status laden fuer atomaren Status-Guard (Race-Schutz
  // gegen parallele Aktionen wie Stripe-Webhook oder Doppel-Klick auf Storno).
  let preStatus: string | null = null;
  if (status) {
    const allowed = ['pending_verification', 'awaiting_payment', 'confirmed', 'shipped', 'picked_up', 'completed', 'cancelled', 'damaged'];
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

      // Stornierungs-Mails (non-blocking). Refund auf 0 — manueller Storno
      // durch den Admin, etwaige Rueckerstattung macht der Admin in Stripe
      // direkt. Wenn Bedarf besteht, kann das spaeter ueber ein
      // optionales body.refund_amount erweitert werden.
      if (booking.customer_email) {
        const emailData = {
          bookingId: booking.id,
          customerName: booking.customer_name ?? '',
          customerEmail: booking.customer_email,
          productName: booking.product_name,
          productId: booking.product_id,
          rentalFrom: booking.rental_from,
          rentalTo: booking.rental_to,
          days: booking.days,
          priceTotal: booking.price_total ?? 0,
          refundAmount: 0,
          refundPercentage: 0,
        };
        Promise.allSettled([
          sendCancellationConfirmation(emailData),
          sendAdminCancellationNotification(emailData),
        ]).then((results) => {
          results.forEach((r, i) => {
            if (r.status === 'rejected') {
              const which = i === 0 ? 'customer' : 'admin';
              console.error(`[booking-cancel] ${which} cancellation mail failed:`, r.reason);
            }
          });
        });
      } else {
        console.warn(`[booking-cancel] Buchung ${id} storniert, aber keine Kunden-E-Mail hinterlegt — keine Mail versendet.`);
      }
    }
  }

  // Audit-Log mit passendem Action-Namen
  let action = 'booking.update';
  if (status === 'cancelled') action = 'booking.cancel';
  else if (verification_gate) action = 'booking.verification_gate';
  else if (customer_email !== undefined && !status) action = 'booking.email_updated';

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
