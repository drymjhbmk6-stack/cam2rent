import { createElement, type ReactElement } from 'react';
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer';
import { createHash } from 'crypto';
import { createServiceClient } from '@/lib/supabase';
import { RentalContractPDF, buildContractText, type RentalContractData, type MietgegenstandItem } from './contract-template';
import { DEFAULT_HAFTUNG, getEigenbeteiligung, type HaftungConfig } from '@/lib/price-config';
import { isTestMode } from '@/lib/env-mode';

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
  if (missingIds.length > 0) {
    const { data: sets } = await supabase
      .from('sets')
      .select('id, name, accessory_items')
      .in('id', missingIds);
    // Zeitwerte aller im Set enthaltenen Zubehoere laden
    const setAccessoryIds = new Set<string>();
    for (const s of sets ?? []) {
      const items = Array.isArray(s.accessory_items) ? s.accessory_items : [];
      for (const it of items) {
        if (it?.accessory_id) setAccessoryIds.add(String(it.accessory_id));
      }
    }
    let accValues: Record<string, number> = {};
    if (setAccessoryIds.size > 0) {
      const { data: accs } = await supabase
        .from('accessories')
        .select('id, replacement_value')
        .in('id', [...setAccessoryIds]);
      accValues = Object.fromEntries(
        (accs ?? []).map((a) => [a.id, a.replacement_value != null ? Number(a.replacement_value) : 0]),
      );
    }
    for (const s of sets ?? []) {
      const items = Array.isArray(s.accessory_items) ? s.accessory_items as { accessory_id: string; qty: number }[] : [];
      const setTotal = items.reduce((sum, it) => {
        const val = accValues[it.accessory_id] ?? 0;
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
 */
async function loadAssetCurrentValue(unitId: string): Promise<number | null> {
  try {
    const supabase = createServiceClient();
    // replacement_value_estimate hat Vorrang: bei GWG ist der Buchwert 0,
    // der echte Wiederbeschaffungswert ist aber der Kaufpreis (in
    // replacement_value_estimate gespeichert). Bei regulaerem Asset (NULL)
    // faellt der Code auf current_value zurueck.
    const primary = await supabase
      .from('assets')
      .select('current_value, replacement_value_estimate')
      .eq('unit_id', unitId)
      .eq('status', 'active')
      .maybeSingle();
    let row: { current_value: number | null; replacement_value_estimate?: number | null } | null = primary.data;
    // Defensiv: Migration noch nicht durch -> ohne replacement_value_estimate retryen
    if (primary.error && /replacement_value_estimate/i.test(primary.error.message)) {
      const fallback = await supabase
        .from('assets')
        .select('current_value')
        .eq('unit_id', unitId)
        .eq('status', 'active')
        .maybeSingle();
      row = fallback.data;
    }
    if (row) {
      if (row.replacement_value_estimate != null) return Number(row.replacement_value_estimate);
      if (row.current_value != null) return Number(row.current_value);
    }
  } catch {
    // Fallback: deposit
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
  const assetCurrentValue = opts.unitId ? await loadAssetCurrentValue(opts.unitId) : null;
  const wiederbeschaffungswert = Math.max(
    assetCurrentValue ?? 0,
    opts.deposit ?? 0,
  );

  // Items aus productName + accessories generieren falls nicht explizit übergeben.
  // Bei qty>1 wird der Bezeichner zu "Nx Name" (aus accessoryItems wenn vorhanden).
  const accessoryEntries: { id: string; qty: number }[] = opts.accessoryItems && opts.accessoryItems.length > 0
    ? opts.accessoryItems.map((i) => ({ id: i.accessory_id, qty: i.qty }))
    : opts.accessories.map((id) => ({ id, qty: 1 }));

  const items: MietgegenstandItem[] = opts.items && opts.items.length > 0
    ? opts.items
    : [
        {
          position: 1,
          bezeichnung: opts.productName,
          seriennr: opts.serialNumber || '',
          tage: opts.rentalDays,
          preis: opts.priceRental,
          wiederbeschaffungswert,
        },
        ...accessoryEntries.map((entry, i) => {
          const info = accessoryInfoMap[entry.id];
          const baseName = info?.name ?? entry.id;
          // Sets enthalten bereits den Gesamt-Zeitwert pro Set-Einheit.
          // Zubehoer: Wert pro Stueck × qty.
          const unitValue = info?.replacementValue ?? 0;
          const lineValue = unitValue * entry.qty;
          return {
            position: i + 2,
            bezeichnung: entry.qty > 1 ? `${entry.qty}x ${baseName}` : baseName,
            seriennr: '',
            tage: opts.rentalDays,
            preis: 0,
            wiederbeschaffungswert: lineValue,
          };
        }),
      ].filter(item => item.bezeichnung);

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
