import { createElement, type ReactElement } from 'react';
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer';
import { createHash } from 'crypto';
import { RentalContractPDF, buildContractText, type RentalContractData } from './contract-template';

export interface GenerateContractResult {
  pdfBuffer: Buffer;
  contractHash: string;
  contractText: string;
}

/**
 * Generiert das Mietvertrags-PDF und berechnet den SHA-256-Hash des Vertragstexts.
 *
 * WICHTIG: signedAt wird hier serverseitig gesetzt (UTC) — NIEMALS aus dem Client uebernehmen.
 */
export async function generateContractPDF(opts: {
  bookingId: string;
  bookingNumber: string;
  // Mieter
  customerName: string;
  customerEmail: string;
  customerStreet?: string;
  customerZip?: string;
  customerCity?: string;
  // Mietgegenstand
  productName: string;
  accessories: string[];
  // Zeitraum (DD.MM.YYYY)
  rentalFrom: string;
  rentalTo: string;
  rentalDays: number;
  // Preise
  priceRental: number;
  priceAccessories: number;
  priceHaftung: number;
  priceShipping: number;
  priceTotal: number;
  deposit: number;
  // Steuer
  taxMode: 'kleinunternehmer' | 'regelbesteuerung';
  taxRate?: number;
  // Signatur
  signatureDataUrl: string | null;
  signatureMethod: 'canvas' | 'typed';
  signerName: string;
  ipAddress: string;
}): Promise<GenerateContractResult> {
  // Serverseitiger UTC-Timestamp
  const now = new Date();
  const signedAt = now.toISOString().replace('T', ' ').substring(0, 16);
  const contractDate = `${now.getUTCDate().toString().padStart(2, '0')}.${(now.getUTCMonth() + 1).toString().padStart(2, '0')}.${now.getUTCFullYear()}`;

  const data: RentalContractData = {
    bookingId: opts.bookingId,
    bookingNumber: opts.bookingNumber,
    contractDate,
    customerName: opts.customerName,
    customerEmail: opts.customerEmail,
    customerStreet: opts.customerStreet,
    customerZip: opts.customerZip,
    customerCity: opts.customerCity,
    productName: opts.productName,
    accessories: opts.accessories,
    rentalFrom: opts.rentalFrom,
    rentalTo: opts.rentalTo,
    rentalDays: opts.rentalDays,
    priceRental: opts.priceRental,
    priceAccessories: opts.priceAccessories,
    priceHaftung: opts.priceHaftung,
    priceShipping: opts.priceShipping,
    priceTotal: opts.priceTotal,
    deposit: opts.deposit,
    taxMode: opts.taxMode,
    taxRate: opts.taxRate,
    signatureDataUrl: opts.signatureDataUrl ?? undefined,
    signatureMethod: opts.signatureMethod,
    signerName: opts.signerName,
    signedAt,
    ipAddress: opts.ipAddress,
    contractHash: '', // Wird unten gesetzt
  };

  // 1. Vertragstext als String zusammensetzen (fuer Hash-Berechnung)
  const contractText = buildContractText(data);

  // 2. SHA-256-Hash des Vertragstexts
  const contractHash = createHash('sha256').update(contractText, 'utf8').digest('hex');

  // 3. Hash in die Daten einsetzen
  data.contractHash = contractHash;

  // 4. PDF rendern
  const pdfBuffer = await renderToBuffer(
    createElement(RentalContractPDF, { data }) as ReactElement<DocumentProps>
  );

  return {
    pdfBuffer: Buffer.from(pdfBuffer),
    contractHash,
    contractText,
  };
}
