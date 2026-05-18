import { createElement, type ReactElement } from 'react';
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer';
import { createHash } from 'crypto';
import { createServiceClient } from '@/lib/supabase';
import { RentalContractPDF, buildContractText, type RentalContractData, type MietgegenstandItem } from './contract-template';
import { DEFAULT_HAFTUNG, getEigenbeteiligung, type HaftungConfig } from '@/lib/price-config';
import { isTestMode } from '@/lib/env-mode';
import { computeReplacementValue, loadReplacementValueConfig } from '@/lib/replacement-value';
import { getInventarWbwAverageByLegacyAccessoryIds, getInventarWbwAverageByLegacyProductId } from '@/lib/inventar/wbw-bridge';

/**
 * Lädt die aktuelle Haftungs-Konfiguration aus admin_settings.
 * Fallback: DEFAULT_HAFTUNG aus price-config.ts.
 */
async function loadHaftungConfig(): Promise<HaftungConfig> {
  try {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from('admin_settings')
      .select('value')
      .eq('key', 'haftung_config')
      .maybeSingle();
    if (data?.value) {
      const parsed = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
      return { ...DEFAULT_HAFTUNG, ...parsed };
    }
  } catch {
    // Fallback
  }
  return DEFAULT_HAFTUNG;
}

export interface GenerateContractResult {
  pdfBuffer: Buffer;
  contractHash: string;
  contractText: string;
}

/**
 * Löst Zubehör-IDs und Set-IDs in lesbare Namen auf.
 */
/**
 * Loest IDs zu Namen + Wiederbeschaffungswert auf.
 * Fuer Zubehoer: direkter Wert aus accessories.replacement_value.
 * Fuer Sets: Summe der enthaltenen accessory_items × deren replacement_value.
 */
interface AccessoryInfo {
  name: string;
  replacementValue: number; // EUR pro Stueck (bei Sets: Gesamtwert des Sets)
  isSet: boolean;
}

async function resolveAccessoryInfo(ids: string[]): Promise<Record<string, AccessoryInfo>> {
  if (ids.length === 0) return {};
  const supabase = createServiceClient();
  const infoMap: Record<string, AccessoryInfo> = {};

  // Zubehoer mit Zeitwert laden
  const { data: accessories } = await supabase
    .from('accessories')
    .select('id, name, replacement_value')
    .in('id', ids);
  for (const a of accessories || []) {
    infoMap[a.id] = {
      name: a.name,
      replacementValue: a.replacement_value != null ? Number(a.replacement_value) : 0,
      isSet: false,
    };
  }

  // Sets laden und Gesamt-Zeitwert aus accessory_items berechnen
  const missingIds = ids.filter((id) => !infoMap[id]);
  const setSubAccIds = new Set<string>();
  if (missingIds.length > 0) {
    const { data: sets } = await supabase
      .from('sets')
      .select('id, name, accessory_items')
      .in('id', missingIds);
    // Zeitwerte aller im Set enthaltenen Zubehoere laden
    for (const s of sets ?? []) {
      const items = Array.isArray(s.accessory_items) ? s.accessory_items : [];
      for (const it of items) {
        if (it?.accessory_id) setSubAccIds.add(String(it.accessory_id));
      }
    }
    let accValues: Record<string, number> = {};
    if (setSubAccIds.size > 0) {
      const { data: accs } = await supabase
        .from('accessories')
        .select('id, replacement_value')
        .in('id', [...setSubAccIds]);
      accValues = Object.fromEntries(
        (accs ?? []).map((a) => [a.id, a.replacement_value != null ? Number(a.replacement_value) : 0]),
      );
    }
    // Bridge: pro Sub-Accessory zusaetzlich inventar_units-Durchschnitt holen,
    // falls accessories.replacement_value 0/NULL ist (Daten leben in neuer Welt).
    let inventarValuesForSub = new Map<string, number>();
    if (setSubAccIds.size > 0) {
      try {
        inventarValuesForSub = await getInventarWbwAverageByLegacyAccessoryIds(supabase, [...setSubAccIds]);
      } catch {
        // Bridge ist Defense-in-Depth — bei Fehler bleibt accValues primaer.
      }
    }
    for (const s of sets ?? []) {
      const items = Array.isArray(s.accessory_items) ? s.accessory_items as { accessory_id: string; qty: number }[] : [];
      const setTotal = items.reduce((sum, it) => {
        const legacy = accValues[it.accessory_id] ?? 0;
        const inv = inventarValuesForSub.get(it.accessory_id) ?? 0;
        const val = legacy > 0 ? legacy : inv; // legacy hat Vorrang wenn gepflegt
        const qty = typeof it.qty === 'number' ? it.qty : 1;
        return sum + val * qty;
      }, 0);
      infoMap[s.id] = {
        name: s.name ?? s.id,
        replacementValue: setTotal,
        isSet: true,
      };
    }
  }

  // Bridge fuer direkte Zubehoer-IDs (keine Sets): falls accessories.replacement_value
  // 0 ist, inventar_units-Durchschnitt einsetzen.
  const accDirectIdsWithoutValue = ids.filter((id) => infoMap[id] && !infoMap[id].isSet && infoMap[id].replacementValue <= 0);
  if (accDirectIdsWithoutValue.length > 0) {
    try {
      const bridge = await getInventarWbwAverageByLegacyAccessoryIds(supabase, accDirectIdsWithoutValue);
      for (const accId of accDirectIdsWithoutValue) {
        const v = bridge.get(accId);
        if (v && v > 0 && infoMap[accId]) {
          infoMap[accId].replacementValue = v;
        }
      }
    } catch {
      // Defensive: Bridge-Fehler ignorieren, Original-Wert bleibt
    }
  }

  return infoMap;
}


/**
 * Lädt benutzerdefinierte Vertragsparagraphen aus admin_settings.
 * Gibt null zurück wenn keine gespeichert sind (→ Fallback auf hardcoded).
 */
/**
 * Laedt den aktuellen Zeitwert eines Assets ueber die Unit-ID.
 * Gibt null zurueck, wenn der Unit kein Asset zugeordnet ist (Altbestand).
 * In dem Fall faellt der Vertrag auf opts.deposit als Wiederbeschaffungswert zurueck.
 *
 * Wenn `productId` zusaetzlich uebergeben wird, versucht die Funktion einen
 * Durchschnitts-WBW ueber alle inventar_units des Produkts zu bilden, falls
 * der direkte Unit-Lookup keinen Treffer hat. Damit hat der Vertrag auch
 * dann einen plausiblen Zeitwert, wenn die Buchung keine konkrete Unit
 * zugewiesen bekommen hat.
 */
async function loadAssetCurrentValue(unitId: string | null, productId?: string | null): Promise<number | null> {
  const supabase = createServiceClient();
  if (!unitId && !productId) return null;
  if (!unitId && productId) {
    // Kein Unit-ID, aber Produkt bekannt → direkt zum Produkt-Fallback
    try {
      const avg = await getInventarWbwAverageByLegacyProductId(supabase, productId);
      if (avg && avg > 0) return avg;
    } catch {
      // ignore
    }
    return null;
  }

  // 1) NEUE Welt — inventar_units (nach Konsolidierungs-Migration).
  //    bookings.unit_id ist eine product_units.id aus der alten Welt;
  //    wir suchen ueber migration_audit die zugehoerige inventar_units.id.
  try {
    const { data: audit } = await supabase
      .from('migration_audit')
      .select('neue_id')
      .eq('alte_tabelle', 'product_units')
      .eq('alte_id', unitId)
      .eq('neue_tabelle', 'inventar_units')
      .maybeSingle();
    if (audit?.neue_id) {
      const { data: unit } = await supabase
        .from('inventar_units')
        .select('kaufpreis_netto, kaufdatum, wiederbeschaffungswert, wbw_manuell_gesetzt')
        .eq('id', (audit as { neue_id: string }).neue_id)
        .maybeSingle();
      if (unit) {
        const u = unit as { kaufpreis_netto: number | null; kaufdatum: string | null; wiederbeschaffungswert: number | null; wbw_manuell_gesetzt: boolean };
        // 1a) Manueller Override hat Vorrang
        if (u.wbw_manuell_gesetzt && u.wiederbeschaffungswert !== null) {
          return Math.round(Number(u.wiederbeschaffungswert) * 100) / 100;
        }
        // 1b) Berechnen wenn Kaufpreis vorhanden
        if (u.kaufpreis_netto !== null && u.kaufdatum) {
          const config = await loadReplacementValueConfig(supabase);
          return computeReplacementValue({
            purchase_price: Number(u.kaufpreis_netto),
            purchase_date: u.kaufdatum,
            replacement_value_estimate: null,
          }, config);
        }
      }
    }
  } catch {
    // weiter zur alten Welt
  }

  // 2) ALTE Welt — assets-Tabelle mit unit_id (vor Konsolidierungs-Drop).
  try {
    const primary = await supabase
      .from('assets')
      .select('purchase_price, purchase_date, current_value, replacement_value_estimate')
      .eq('unit_id', unitId)
      .eq('status', 'active')
      .maybeSingle();
    let row: { purchase_price: number | null; purchase_date: string | null; current_value: number | null; replacement_value_estimate?: number | null } | null = primary.data;
    if (primary.error && /replacement_value_estimate/i.test(primary.error.message)) {
      const fallback = await supabase
        .from('assets')
        .select('purchase_price, purchase_date, current_value')
        .eq('unit_id', unitId)
        .eq('status', 'active')
        .maybeSingle();
      row = fallback.data;
    }
    if (row && row.purchase_date && row.purchase_price != null) {
      const config = await loadReplacementValueConfig(supabase);
      return computeReplacementValue({
        purchase_price: row.purchase_price,
        purchase_date: row.purchase_date,
        replacement_value_estimate: row.replacement_value_estimate ?? null,
      }, config);
    }
  } catch {
    // weiter zum Produkt-Fallback
  }

  // 3) Produkt-Fallback: kein Unit-Treffer, aber Produkt ist bekannt → Durchschnitts-WBW
  //    aller inventar_units desselben Produkts. Greift z.B. wenn unit_id auf
  //    eine geloeschte product_units-Zeile zeigt oder die Buchung neu ist und
  //    der mirror-Eintrag noch nicht angelegt wurde.
  if (productId) {
    try {
      const avg = await getInventarWbwAverageByLegacyProductId(supabase, productId);
      if (avg && avg > 0) return avg;
    } catch {
      // ignore
    }
  }
  return null;
}

/**
 * Laedt den globalen Schadens-Modus aus admin_settings.deposit_mode.
 * 'kaution' = echte Stripe-Pre-Auth, 'haftung' = nur Schadenspauschale.
 * Default = 'haftung' (sicherer Fallback, wenn Setting fehlt).
 */
async function loadDepositMode(): Promise<'kaution' | 'haftung'> {
  try {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from('admin_settings')
      .select('value')
      .eq('key', 'deposit_mode')
      .maybeSingle();
    const raw = data?.value;
    if (raw === 'kaution' || raw === 'haftung') return raw;
  } catch {
    // Fallback
  }
  return 'haftung';
}

async function loadCustomParagraphs(): Promise<{ title: string; text: string }[] | null> {
  try {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from('admin_settings')
      .select('value')
      .eq('key', 'contract_paragraphs')
      .maybeSingle();

    if (data?.value) {
      const parsed = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch {
    // Fallback auf hardcoded
  }
  return null;
}

export async function generateContractPDF(opts: {
  bookingId: string;
  bookingNumber: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  customerStreet?: string;
  customerZip?: string;
  customerCity?: string;
  customerCountry?: string;
  customerBirthdate?: string;
  customerNumber?: string;
  customerVerifiedAt?: string;
  productName: string;
  accessories: string[];
  /** Optional: Zubehoer mit Stueckzahl. Wenn gesetzt, werden Eintraege mit
   *  qty>1 als "Nx Name" in den Mietgegenstaenden aufgefuehrt. */
  accessoryItems?: { accessory_id: string; qty: number }[];
  items?: MietgegenstandItem[];
  rentalFrom: string;
  rentalTo: string;
  rentalDays: number;
  deliveryMode?: string;
  returnMode?: string;
  deliveryAddress?: string;
  priceRental: number;
  priceAccessories: number;
  priceHaftung: number;
  priceShipping: number;
  priceTotal: number;
  deposit: number;
  haftungOption?: string;
  haftungDescription?: string;
  stripePaymentIntentId?: string;
  paymentDate?: string;
  taxMode: 'kleinunternehmer' | 'regelbesteuerung';
  taxRate?: number;
  signatureDataUrl: string | null;
  signatureMethod: 'canvas' | 'typed';
  signerName: string;
  ipAddress: string;
  eigenbeteiligung?: number;
  productCategory?: string;
  serialNumber?: string;
  /**
   * Legacy product_id (admin_config.products.id, z.B. "1"). Wenn gesetzt
   * und kein Unit-Treffer existiert, wird der WBW aus dem Durchschnitt
   * aller inventar_units desselben Produkts berechnet.
   */
  productId?: string;
  /**
   * Unit-ID der physischen Kamera. Wenn gesetzt, laedt der Contract den
   * aktuellen asset.current_value als Wiederbeschaffungswert. Fallback:
   * opts.deposit.
   */
  unitId?: string | null;
  /** Override: true = immer Muster-Wasserzeichen, false = nie, undefined = aus env-mode */
  forceTestMode?: boolean;
}): Promise<GenerateContractResult> {
  const now = new Date();
  // Vertragsdaten in Berlin-Zeit, sonst zeigt die PDF zwischen 22-00 Uhr den
  // UTC-Vortag und der Kunde wundert sich ueber falsche Uhrzeit/Datum.
  const berlinParts = new Intl.DateTimeFormat('de-DE', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const partsMap: Record<string, string> = {};
  for (const part of berlinParts) {
    if (part.type !== 'literal') partsMap[part.type] = part.value;
  }
  const contractDate = `${partsMap.day}.${partsMap.month}.${partsMap.year}`;
  const contractTime = `${partsMap.hour === '24' ? '00' : partsMap.hour}:${partsMap.minute}`;
  const signedAt = `${partsMap.year}-${partsMap.month}-${partsMap.day} ${partsMap.hour === '24' ? '00' : partsMap.hour}:${partsMap.minute}`;

  // Zubehör-IDs zu Namen + Zeitwert aufloesen (Zubehoer direkt, Sets als Summe)
  const accessoryInfoMap = await resolveAccessoryInfo(opts.accessories);

  // Zeitwert (Wiederbeschaffungswert) aus verknuepftem Asset laden, falls Unit
  // bekannt. Fallback: opts.deposit (Kautions-Betrag des Produkts) fuer Altbestand
  // ohne Asset-Verknuepfung.
  //
  // Floor: der Wert darf NIE unter den Kautionsbetrag fallen. Grund — steuerliche
  // AfA treibt den Buchwert irgendwann auf den Restwert (ggf. 0), der tatsaechliche
  // Wiederbeschaffungspreis einer gebrauchten Kamera liegt aber immer deutlich
  // darueber. Die Kaution ist eine realistische Untergrenze fuer den Ersatzwert
  // bei Totalschaden.
  // WBW IMMER aus dem Buchungs-Datensatz selbst aufloesen (bookings.product_id
  // / bookings.unit_id), nicht aus den evtl. abweichenden opts. Grund: der
  // Cart-Pfad (confirm-cart) uebergibt firstItem.productId — eine
  // Warenkorb-Item-ID, die NICHT zwingend der admin_config.products-ID
  // entspricht, ueber die migration_audit den Inventar-WBW findet. Die
  // Buchungs-Detailseite nutzt booking.product_id und zeigt deshalb den
  // korrekten Wert (~354 EUR), der Vertrag bekam 0 EUR. Mit dem Booking-
  // Lookup ist der Vertrag konsistent zur Buchungs-/WBW-Box.
  let resolveUnitId: string | null = opts.unitId ?? null;
  let resolveProductId: string | null = opts.productId ?? null;
  if (opts.bookingId) {
    try {
      const sb = createServiceClient();
      const { data: bk } = await sb
        .from('bookings')
        .select('product_id, unit_id')
        .eq('id', opts.bookingId)
        .maybeSingle();
      if (bk) {
        if (bk.unit_id) resolveUnitId = bk.unit_id as string;
        if (bk.product_id) resolveProductId = String(bk.product_id);
      }
    } catch {
      // Fallback auf opts-Werte
    }
  }
  const assetCurrentValue = (resolveUnitId || resolveProductId)
    ? await loadAssetCurrentValue(resolveUnitId, resolveProductId)
    : null;
  const wiederbeschaffungswert = Math.max(
    assetCurrentValue ?? 0,
    opts.deposit ?? 0,
  );

  // Items aus productName + accessories generieren falls nicht explizit übergeben.
  // Bei qty>1 wird der Bezeichner zu "Nx Name" (aus accessoryItems wenn vorhanden).
  const accessoryEntries: { id: string; qty: number }[] = opts.accessoryItems && opts.accessoryItems.length > 0
    ? opts.accessoryItems.map((i) => ({ id: i.accessory_id, qty: i.qty }))
    : opts.accessories.map((id) => ({ id, qty: 1 }));

  // Seriennummer der zugewiesenen Kamera aufloesen (analog Buchungs-Detail):
  // viele Aufrufer (u.a. regenerate-contract) uebergeben keine serialNumber,
  // die Buchung kennt sie aber ueber unit_id. Datenmodell trackt EINE
  // Kamera-Unit pro Buchung → Seriennr. nur auf der ersten Kamera-Zeile.
  let effectiveSerial = opts.serialNumber || '';
  if (!effectiveSerial && resolveUnitId) {
    try {
      const sb2 = createServiceClient();
      const { data: audit } = await sb2
        .from('migration_audit')
        .select('neue_id')
        .eq('alte_tabelle', 'product_units')
        .eq('alte_id', resolveUnitId)
        .eq('neue_tabelle', 'inventar_units')
        .maybeSingle();
      const neueId = (audit as { neue_id?: string } | null)?.neue_id;
      if (neueId) {
        const { data: iu } = await sb2
          .from('inventar_units')
          .select('seriennummer, inventar_code, bezeichnung')
          .eq('id', neueId)
          .maybeSingle();
        const u = iu as { seriennummer: string | null; inventar_code: string | null; bezeichnung: string } | null;
        effectiveSerial = u?.seriennummer ?? u?.inventar_code ?? u?.bezeichnung ?? '';
      }
      if (!effectiveSerial) {
        const { data: pu } = await sb2
          .from('product_units')
          .select('serial_number')
          .eq('id', resolveUnitId)
          .maybeSingle();
        effectiveSerial = (pu as { serial_number?: string } | null)?.serial_number ?? '';
      }
    } catch {
      // Seriennr. bleibt leer
    }
  }

  const items: MietgegenstandItem[] = opts.items && opts.items.length > 0
    ? opts.items
    : (() => {
        // Mehrere Kameras (Warenkorb-Buchung): productName ist kommagetrennt
        // ("OSMO Action 5 Pro , OSMO Action 5 Pro"). Pro Kamera EINE Zeile
        // mit eigenem Wiederbeschaffungswert (gleiches Modell ×N angenommen —
        // der Concat-Name impliziert das). Seriennummer nur auf der ersten
        // Zeile (Datenmodell trackt eine unit_id pro Buchung).
        const cameraNames = String(opts.productName ?? '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        const camLines: MietgegenstandItem[] = (cameraNames.length > 0 ? cameraNames : [opts.productName])
          .map((nm, i) => ({
            position: i + 1,
            bezeichnung: nm,
            seriennr: i === 0 ? effectiveSerial : '',
            tage: opts.rentalDays,
            preis: i === 0 ? opts.priceRental : 0,
            wiederbeschaffungswert,
          }));
        const camCount = camLines.length;
        return [
          ...camLines,
          ...accessoryEntries.map((entry, i) => {
            const info = accessoryInfoMap[entry.id];
            const baseName = info?.name ?? entry.id;
            // Sets enthalten bereits den Gesamt-Zeitwert pro Set-Einheit.
            // Zubehoer: Wert pro Stueck × qty.
            const unitValue = info?.replacementValue ?? 0;
            const lineValue = unitValue * entry.qty;
            return {
              position: camCount + i + 1,
              bezeichnung: entry.qty > 1 ? `${entry.qty}x ${baseName}` : baseName,
              seriennr: '',
              tage: opts.rentalDays,
              preis: 0,
              wiederbeschaffungswert: lineValue,
            };
          }),
        ].filter((item) => item.bezeichnung);
      })();

  // Haftungsoption bestimmen
  const haftungOption = opts.haftungOption || (
    opts.priceHaftung === 0 ? 'Ohne Schadenspauschale'
    : opts.priceHaftung <= 20 ? 'Basis-Schadenspauschale'
    : 'Premium-Schadenspauschale'
  );

  // Eigenbeteiligung dynamisch: explizit > Kategorie+haftung_config > Konfig-Default > 200
  let eb: number;
  if (opts.eigenbeteiligung !== undefined) {
    eb = opts.eigenbeteiligung;
  } else {
    const haftungConfig = await loadHaftungConfig();
    eb = getEigenbeteiligung(haftungConfig, opts.productCategory);
  }
  const haftungDescription = opts.haftungDescription || (
    haftungOption === 'Ohne Schadenspauschale'
      ? 'Keine Schadenspauschale gewählt. Der Mieter haftet bis zur Höhe des Zeitwerts der Mietsache (Wiederbeschaffungswert).'
    : haftungOption === 'Basis-Schadenspauschale'
      ? `Ersatzpflicht im Schadensfall auf max. ${eb} EUR je Schadensereignis begrenzt (Selbstbeteiligung). Gilt bei bestimmungsgemäßer Nutzung.`
    : 'Volle Haftungsfreistellung bei bestimmungsgemäßer Nutzung – keine Selbstbeteiligung.'
  );

  // Benutzerdefinierte Vertragsparagraphen aus DB laden
  const customParagraphs = await loadCustomParagraphs();

  // Test-Modus: expliziter Override oder aus admin_settings.environment_mode
  const testMode = opts.forceTestMode !== undefined ? opts.forceTestMode : await isTestMode();

  // Schadens-Modus: kaution = echte Stripe-Pre-Auth, haftung = nur Schadenspauschale
  const depositMode = await loadDepositMode();

  const data: RentalContractData = {
    bookingId: opts.bookingId,
    bookingNumber: opts.bookingNumber,
    contractDate,
    contractTime,
    customerName: opts.customerName,
    customerEmail: opts.customerEmail,
    customerPhone: opts.customerPhone,
    customerStreet: opts.customerStreet,
    customerZip: opts.customerZip,
    customerCity: opts.customerCity,
    customerCountry: opts.customerCountry,
    customerBirthdate: opts.customerBirthdate,
    customerNumber: opts.customerNumber,
    customerVerifiedAt: opts.customerVerifiedAt,
    items,
    rentalFrom: opts.rentalFrom,
    rentalTo: opts.rentalTo,
    rentalDays: opts.rentalDays,
    deliveryMode: opts.deliveryMode || 'Versand',
    returnMode: opts.returnMode || 'Rücksendung',
    deliveryAddress: opts.deliveryAddress,
    priceRental: opts.priceRental,
    priceShipping: opts.priceShipping,
    priceHaftung: opts.priceHaftung,
    priceTotal: opts.priceTotal,
    haftungOption,
    haftungDescription,
    stripePaymentIntentId: opts.stripePaymentIntentId,
    paymentDate: opts.paymentDate,
    signatureDataUrl: opts.signatureDataUrl ?? undefined,
    signatureMethod: opts.signatureMethod,
    signerName: opts.signerName,
    signedAt,
    ipAddress: opts.ipAddress,
    contractHash: '',
    eigenbeteiligung: eb,
    customParagraphs: customParagraphs ?? undefined,
    testMode,
    depositMode,
    // Backwards compat
    productName: opts.productName,
    accessories: opts.accessories,
    priceAccessories: opts.priceAccessories,
    deposit: opts.deposit,
    taxMode: opts.taxMode,
    taxRate: opts.taxRate,
  };

  const contractText = buildContractText(data);
  // Hash umfasst jetzt auch die Signatur-Daten — damit ist die Unterschrift
  // kryptografisch an den Vertragsinhalt gebunden. Wenn das gespeicherte
  // PDF nachträglich manipuliert wird (Vertragstext ODER Signatur), ergibt
  // die Hash-Neuberechnung einen anderen Wert → Tampering nachweisbar.
  const hashInput = [
    contractText,
    `SIG:${opts.signatureDataUrl ?? ''}`,
    `METHOD:${opts.signatureMethod}`,
    `SIGNED_AT:${signedAt}`,
    `IP:${opts.ipAddress ?? ''}`,
  ].join('\n---\n');
  const contractHash = createHash('sha256').update(hashInput, 'utf8').digest('hex');
  data.contractHash = contractHash;

  const pdfBuffer = await renderToBuffer(
    createElement(RentalContractPDF, { data }) as ReactElement<DocumentProps>
  );

  return {
    pdfBuffer: Buffer.from(pdfBuffer),
    contractHash,
    contractText,
  };
}
