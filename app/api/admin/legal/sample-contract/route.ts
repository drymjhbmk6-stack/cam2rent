import { NextResponse } from 'next/server';
import { checkAdminAuth } from '@/lib/admin-auth';
import { generateContractPDF } from '@/lib/contracts/generate-contract';
import { BUSINESS } from '@/lib/business-config';

/**
 * GET /api/admin/legal/sample-contract
 * Generiert einen Muster-Mietvertrag (PDF) mit Dummy-Daten, damit der
 * Admin Vertragsparagraphen-Änderungen direkt prüfen kann.
 * Nutzt die gleiche PDF-Pipeline wie echte Buchungen — inkl. geladener
 * benutzerdefinierter Paragraphen aus admin_settings.
 */
export async function GET() {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }

  const now = new Date();
  const rentalFrom = new Date(now);
  rentalFrom.setDate(rentalFrom.getDate() + 3);
  const rentalTo = new Date(rentalFrom);
  rentalTo.setDate(rentalTo.getDate() + 6);
  const fmt = (d: Date) => `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;

  const { pdfBuffer } = await generateContractPDF({
    bookingId: 'MUSTER-0000',
    bookingNumber: 'RE-MUSTER-001',
    customerName: 'Max Mustermann',
    customerEmail: 'max.mustermann@example.de',
    customerPhone: '+49 170 1234567',
    customerStreet: 'Musterstraße 1',
    customerZip: '12345',
    customerCity: 'Musterstadt',
    customerCountry: 'Deutschland',
    customerBirthdate: '01.01.1990',
    customerNumber: 'K-MUSTER',
    productName: 'GoPro Hero13 Black (Muster)',
    accessories: [],
    items: [
      {
        position: 1,
        bezeichnung: 'GoPro Hero13 Black (Muster)',
        seriennr: 'MUSTER-SN-001',
        tage: 7,
        preis: 69,
        wiederbeschaffungswert: 450,
      },
    ],
    rentalFrom: fmt(rentalFrom),
    rentalTo: fmt(rentalTo),
    rentalDays: 7,
    deliveryMode: 'Versand',
    returnMode: 'Rücksendung',
    deliveryAddress: `${BUSINESS.street}, ${BUSINESS.zip} ${BUSINESS.city}`,
    priceRental: 69,
    priceAccessories: 0,
    priceHaftung: 15,
    priceShipping: 0,
    priceTotal: 84,
    deposit: 0,
    haftungOption: 'Basis-Schadenspauschale',
    taxMode: 'kleinunternehmer',
    signatureDataUrl: null,
    signatureMethod: 'typed',
    signerName: 'Max Mustermann',
    ipAddress: '0.0.0.0',
    eigenbeteiligung: 200,
    forceTestMode: true,
  });

  return new NextResponse(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="muster-mietvertrag.pdf"',
      'Content-Length': String(pdfBuffer.length),
      'Cache-Control': 'no-store',
    },
  });
}
