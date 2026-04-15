import { createElement, type ReactElement } from 'react';
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer';
import { createHash } from 'crypto';
import { createServiceClient } from '@/lib/supabase';
import { RentalContractPDF, buildContractText, type RentalContractData, type MietgegenstandItem } from './contract-template';

export interface GenerateContractResult {
  pdfBuffer: Buffer;
  contractHash: string;
  contractText: string;
}

/**
 * Löst Zubehör-IDs und Set-IDs in lesbare Namen auf.
 */
async function resolveAccessoryNames(ids: string[]): Promise<Record<string, string>> {
  if (ids.length === 0) return {};
  const supabase = createServiceClient();
  const nameMap: Record<string, string> = {};

  // Zubehör laden
  const { data: accessories } = await supabase
    .from('accessories')
    .select('id, name')
    .in('id', ids);
  for (const a of accessories || []) {
    nameMap[a.id] = a.name;
  }

  // Sets laden (für IDs die nicht in accessories gefunden wurden)
  const missingIds = ids.filter(id => !nameMap[id]);
  if (missingIds.length > 0) {
    const { data: sets } = await supabase
      .from('sets')
      .select('id, name')
      .in('id', missingIds);
    for (const s of sets || []) {
      nameMap[s.id] = s.name;
    }
  }

  return nameMap;
}

/**
 * Lädt benutzerdefinierte Vertragsparagraphen aus admin_settings.
 * Gibt null zurück wenn keine gespeichert sind (→ Fallback auf hardcoded).
 */
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
  serialNumber?: string;
}): Promise<GenerateContractResult> {
  const now = new Date();
  const signedAt = now.toISOString().replace('T', ' ').substring(0, 16);
  const contractDate = `${now.getUTCDate().toString().padStart(2, '0')}.${(now.getUTCMonth() + 1).toString().padStart(2, '0')}.${now.getUTCFullYear()}`;
  const contractTime = `${now.getUTCHours().toString().padStart(2, '0')}:${now.getUTCMinutes().toString().padStart(2, '0')}`;

  // Zubehör-IDs zu lesbaren Namen auflösen
  const accessoryNameMap = await resolveAccessoryNames(opts.accessories);

  // Items aus productName + accessories generieren falls nicht explizit übergeben
  const items: MietgegenstandItem[] = opts.items && opts.items.length > 0
    ? opts.items
    : [
        {
          position: 1,
          bezeichnung: opts.productName,
          seriennr: opts.serialNumber || '',
          tage: opts.rentalDays,
          preis: opts.priceRental,
          wiederbeschaffungswert: opts.deposit || 0,
        },
        ...opts.accessories.map((acc, i) => ({
          position: i + 2,
          bezeichnung: accessoryNameMap[acc] || acc,
          seriennr: '',
          tage: opts.rentalDays,
          preis: 0,
          wiederbeschaffungswert: 0,
        })),
      ].filter(item => item.bezeichnung);

  // Haftungsoption bestimmen
  const haftungOption = opts.haftungOption || (
    opts.priceHaftung === 0 ? 'Ohne Schadenspauschale'
    : opts.priceHaftung <= 20 ? 'Basis-Schadenspauschale'
    : 'Premium-Schadenspauschale'
  );

  const eb = opts.eigenbeteiligung ?? 200;
  const haftungDescription = opts.haftungDescription || (
    haftungOption === 'Ohne Schadenspauschale'
      ? 'Keine Schadenspauschale gewählt. Der Mieter haftet bis zur Höhe des Zeitwerts der Mietsache (Wiederbeschaffungswert).'
    : haftungOption === 'Basis-Schadenspauschale'
      ? `Ersatzpflicht im Schadensfall auf max. ${eb} EUR je Schadensereignis begrenzt (Selbstbeteiligung). Gilt bei bestimmungsgemäßer Nutzung.`
    : 'Volle Haftungsfreistellung bei bestimmungsgemäßer Nutzung – keine Selbstbeteiligung.'
  );

  // Benutzerdefinierte Vertragsparagraphen aus DB laden
  const customParagraphs = await loadCustomParagraphs();

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
    // Backwards compat
    productName: opts.productName,
    accessories: opts.accessories,
    priceAccessories: opts.priceAccessories,
    deposit: opts.deposit,
    taxMode: opts.taxMode,
    taxRate: opts.taxRate,
  };

  const contractText = buildContractText(data);
  const contractHash = createHash('sha256').update(contractText, 'utf8').digest('hex');
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
