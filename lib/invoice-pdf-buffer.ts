/**
 * Rendert das Rechnungs-PDF einer Buchung als Buffer (fuer E-Mail-Anhang).
 * Nutzt dieselbe Quelle wie /api/invoice/[bookingId] (buildInvoiceData).
 */

import { createElement, type ReactElement } from 'react';
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer';
import type { SupabaseClient } from '@supabase/supabase-js';
import { InvoicePDF } from '@/lib/invoice-pdf';
import { buildInvoiceData } from '@/lib/build-invoice-data';

export async function renderInvoicePdfBuffer(
  supabase: SupabaseClient,
  booking: Record<string, unknown>,
): Promise<Buffer> {
  const data = await buildInvoiceData(supabase, booking);
  return Buffer.from(
    await renderToBuffer(createElement(InvoicePDF, { data }) as ReactElement<DocumentProps>),
  );
}
