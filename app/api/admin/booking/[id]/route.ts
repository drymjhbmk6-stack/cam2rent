import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';
import { sendCancellationConfirmation, sendAdminCancellationNotification } from '@/lib/email';
import { releaseAccessoryUnitsFromBooking } from '@/lib/accessory-unit-assignment';
import { getStripe } from '@/lib/stripe';
import { DEFAULT_HAFTUNG, getEigenbeteiligung, type HaftungConfig } from '@/lib/price-config';
import { computeReplacementValue, loadReplacementValueConfig } from '@/lib/replacement-value';

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

  // Seriennummer laden falls Unit zugeordnet
  let serialNumber: string | null = null;
  if (booking.unit_id) {
    const { data: unit } = await supabase
      .from('product_units')
      .select('serial_number')
      .eq('id', booking.unit_id)
      .maybeSingle();
    serialNumber = unit?.serial_number ?? null;
  }
  booking.serial_number = serialNumber;

  // Zubehoer + Sets aufloesen — fuer Packliste, Uebergabeprotokoll, Vertrag.
  // accessory_items hat Vorrang (qty-aware), sonst accessories[] mit qty=1.
  // Fuer jedes Element wird der Name aus accessories ODER sets aufgeloest.
  // Bei Sets werden zusaetzlich die enthaltenen accessory_items expandiert,
  // damit die Packliste das vollstaendige Inventar zeigt.
  // included_parts (Bestandteile) werden mitgeladen — Pack-Workflow zeigt sie
  // als Hinweis an, sie sind kein eigenes Inventar.
  type ResolvedItem = { id: string; name: string; qty: number; isFromSet?: boolean; setName?: string; included_parts?: string[] };
  const rawItems: { accessory_id: string; qty: number }[] = Array.isArray(booking.accessory_items) && booking.accessory_items.length > 0
    ? (booking.accessory_items as { accessory_id: string; qty: number }[])
    : (Array.isArray(booking.accessories) ? booking.accessories as string[] : []).map((aid) => ({ accessory_id: aid, qty: 1 }));

  const resolved: ResolvedItem[] = [];
  if (rawItems.length > 0) {
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
          name: acc?.name ?? item.accessory_id,
          qty: item.qty,
          included_parts: acc?.included_parts && acc.included_parts.length > 0 ? acc.included_parts : undefined,
        });
      }
    }
  }
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

  const cameraId = booking.product_id as string;
  const cameraName = booking.product_name as string;
  const productDeposit = Number(booking.deposit ?? 0);
  const haftung = (booking.haftung as string | null) ?? null;

  // 1. Kamera-WBW — pauschal berechnet (linear -> Floor)
  const wbwConfig = await loadReplacementValueConfig(supabase);
  let cameraValue = 0;
  let cameraSource: Line['source'] = 'unknown';
  if (booking.unit_id) {
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
  if (cameraValue === 0) {
    // Fallback: Kautionswert (im Haftung-Modus nur Anker, im Kaution-Modus echt)
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
  const setContainerNames = new Set(
    resolvedItems.filter((i) => i.isFromSet).map((i) => i.setName ?? ''),
  );
  const physicalAccItems = resolvedItems.filter((i) => !setContainerNames.has(i.name) || i.isFromSet);

  const accIds = [...new Set(physicalAccItems.map((i) => i.id))];

  // Asset-Lookup ueber accessory_unit_ids (genauer, wenn vorhanden).
  // Ergebnis: Map accessory_id -> Liste aller Asset-Werte (= Anzahl Units mit Asset).
  const accUnitIds: string[] = Array.isArray(booking.accessory_unit_ids)
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

  // Pro physische Position eine Line bauen.
  // Pro accessory_id wird der Pro-Stueck-Wert genommen aus:
  //   1) Asset-Wert (Mittelwert wenn mehrere Units), wenn Asset fuer diesen
  //      accessory_id existiert UND > 0
  //   2) sonst accessories.replacement_value
  const accessoryLines: Line[] = [];
  for (const item of physicalAccItems) {
    const assetValues = assetValuesPerAccId.get(item.id) ?? [];
    const assetAvg = assetValues.length > 0
      ? assetValues.reduce((s, v) => s + v, 0) / assetValues.length
      : 0;
    const repValue = accRepMap.get(item.id) ?? 0;

    let unitValue: number;
    let source: Line['source'];
    if (assetAvg > 0) {
      unitValue = assetAvg;
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
    // Produkt-Kategorie nachladen
    const { data: cfg } = await supabase
      .from('admin_config')
      .select('products')
      .eq('id', 1)
      .maybeSingle();
    const products = Array.isArray(cfg?.products) ? cfg?.products as Array<{ id: string; category?: string }> : [];
    const product = products.find((p) => p.id === cameraId);
    const category: string | undefined = product?.category;
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
  const { status, cancellation_reason, customer_email, verification_gate } = body as {
    status?: string;
    cancellation_reason?: string;
    customer_email?: string;
    verification_gate?: 'approve' | 'revoke';
  };

  const supabase = createServiceClient();
  const updates: Record<string, unknown> = {};

  // E-Mail aktualisieren
  if (customer_email !== undefined) {
    updates.customer_email = customer_email || null;
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
  if (status) {
    const allowed = ['pending_verification', 'awaiting_payment', 'confirmed', 'shipped', 'picked_up', 'completed', 'cancelled', 'damaged'];
    if (!allowed.includes(status)) {
      return NextResponse.json({ error: 'Ungültiger Status.' }, { status: 400 });
    }
    updates.status = status;

    // Bei Stornierung: Grund in Notizen speichern
    if (status === 'cancelled' && cancellation_reason) {
      const { data: existing } = await supabase
        .from('bookings')
        .select('notes')
        .eq('id', id)
        .maybeSingle();
      const existingNotes = existing?.notes ? `${existing.notes} | ` : '';
      updates.notes = `${existingNotes}Stornierungsgrund: ${cancellation_reason}`;
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Keine Änderungen.' }, { status: 400 });
  }

  const { error } = await supabase
    .from('bookings')
    .update(updates)
    .eq('id', id);

  if (error) {
    console.error('Booking update error:', error);
    return NextResponse.json({ error: 'Aktualisierung fehlgeschlagen.' }, { status: 500 });
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
