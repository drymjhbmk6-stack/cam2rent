/**
 * Rechnungs-Versionierung: jede Fassung der Kundenrechnung wird intern
 * unveraenderlich archiviert (Snapshot + PDF im contracts-Bucket).
 *
 * Aufruf NON-BLOCKING aus den rechnungsrelevanten Buchungs-Aenderungen
 * (accessory_edit, booking_edit, Verlaengerung). Eine Buchungsaenderung darf
 * NIE an der Versionierung scheitern — deshalb faengt diese Lib alle Fehler
 * selbst ab (Migration fehlt / Render-Fehler => still loggen, weiterlaufen).
 */

import { createElement, type ReactElement } from 'react';
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer';
import type { SupabaseClient } from '@supabase/supabase-js';
import { InvoicePDF, type InvoiceData } from '@/lib/invoice-pdf';
import { buildInvoiceData } from '@/lib/build-invoice-data';
import { logAudit } from '@/lib/audit';

export interface SnapshotOpts {
  reason: string;
  triggerSource: 'initial' | 'accessory_edit' | 'booking_edit' | 'extension' | 'manual';
  createdBy?: string | null;
  /** Buchungs-Row VOR der Mutation — fuer die Erst-Baseline (v1 = Zustand
   *  bevor zum ersten Mal etwas geaendert wurde). */
  previousBooking?: Record<string, unknown> | null;
  request?: Request;
}

function safeBookingId(id: string): string {
  return id.replace(/[^A-Za-z0-9_-]/g, '_');
}

function storagePath(bookingId: string, version: number): string {
  return `invoices/${safeBookingId(bookingId)}/v${version}.pdf`;
}

/** Rechnungsrelevanter Fingerabdruck — aendert er sich nicht, entsteht KEINE
 *  neue Version (kein Versions-Rauschen bei Nicht-Preis-Edits).
 *  Enthaelt zusaetzlich Empfaenger-Name + -Adresse: eine Rechnungsadress-
 *  Korrektur ist rechnungsrelevant (Pflichtangabe nach UStG § 14) und muss
 *  als eigene Version archiviert werden. */
function fingerprint(d: InvoiceData): string {
  return JSON.stringify({
    cam: (d.cameraLines ?? []).map((l) => [l.name, l.qty, l.unitPrice, l.lineTotal]),
    acc: (d.accessoryLines ?? []).map((l) => [l.name, l.qty, l.unitPrice, l.lineTotal]),
    pr: d.priceRental,
    pa: d.priceAccessories,
    ph: d.priceHaftung,
    sp: d.shippingPrice,
    di: d.discountAmount ?? 0,
    cc: d.couponCode ?? '',
    pt: d.priceTotal,
    rf: d.rentalFrom,
    rt: d.rentalTo,
    cn: (d.customerName ?? '').trim(),
    ca: (d.customerAddress ?? '').trim(),
  });
}

function computeTax(d: InvoiceData): { gross: number; net: number; tax: number } {
  const gross = Math.round((d.priceTotal ?? 0) * 100) / 100;
  if (d.taxMode === 'regelbesteuerung') {
    const rate = (d.taxRate ?? 19) / 100;
    const net = Math.round((gross / (1 + rate)) * 100) / 100;
    return { gross, net, tax: Math.round((gross - net) * 100) / 100 };
  }
  return { gross, net: gross, tax: 0 };
}

function isMissingTable(msg: string | undefined): boolean {
  return /invoice_versions|relation .* does not exist|42P01|PGRST205|schema cache/i.test(msg || '');
}

async function renderAndUpload(
  supabase: SupabaseClient,
  bookingId: string,
  version: number,
  data: InvoiceData,
): Promise<string | null> {
  try {
    const buf = Buffer.from(await renderToBuffer(
      createElement(InvoicePDF, { data }) as ReactElement<DocumentProps>,
    ));
    const path = storagePath(bookingId, version);
    await supabase.storage.from('contracts').upload(path, buf, {
      contentType: 'application/pdf',
      upsert: true,
    });
    return path;
  } catch (e) {
    console.error('[invoice-versions] PDF render/upload failed:', e);
    return null;
  }
}

interface SnapshotResult {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  versionNumber?: number;
}

/**
 * Legt — falls rechnungsrelevant geaendert — eine neue Rechnungsversion an.
 * Erste Version je Buchung wird lazy als Baseline (v1) aus previousBooking
 * (= Zustand VOR der Aenderung) erzeugt, damit die "Vorher"-Fassung auch fuer
 * Altbuchungen erhalten bleibt.
 */
export async function snapshotInvoiceVersion(
  supabase: SupabaseClient,
  bookingId: string,
  opts: SnapshotOpts,
): Promise<SnapshotResult> {
  try {
    const { data: freshBooking } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', bookingId)
      .maybeSingle();
    if (!freshBooking) return { ok: false, reason: 'booking_not_found' };

    const newData = await buildInvoiceData(supabase, freshBooking);
    const newFp = fingerprint(newData);

    const { data: existing, error: listErr } = await supabase
      .from('invoice_versions')
      .select('id, version_number, lines, is_current')
      .eq('booking_id', bookingId)
      .order('version_number', { ascending: true });

    if (listErr) {
      if (isMissingTable(listErr.message)) {
        console.warn('[invoice-versions] table missing — skipped (migration pending)');
        return { ok: false, skipped: true, reason: 'migration_pending' };
      }
      console.error('[invoice-versions] list error:', listErr);
      return { ok: false, reason: 'list_error' };
    }

    const rows = existing ?? [];

    // ── Erst-Baseline (keine Version vorhanden) ─────────────────────────────
    if (rows.length === 0) {
      const baseBooking = opts.previousBooking ?? freshBooking;
      const baseData = await buildInvoiceData(supabase, baseBooking);
      baseData.adjustmentVersion = 1;
      const baseFp = fingerprint(baseData);
      const changed = baseFp !== newFp;

      const baseTax = computeTax(baseData);
      const basePath = await renderAndUpload(supabase, bookingId, 1, baseData);
      const { error: insErr } = await supabase.from('invoice_versions').insert({
        booking_id: bookingId,
        invoice_number: baseData.invoiceNumber ?? bookingId,
        version_number: 1,
        is_current: !changed,
        lines: {
          fingerprint: baseFp,
          invoiceDate: baseData.invoiceDate,
          cameraLines: baseData.cameraLines ?? [],
          accessoryLines: baseData.accessoryLines ?? [],
          priceRental: baseData.priceRental,
          priceAccessories: baseData.priceAccessories,
          priceHaftung: baseData.priceHaftung,
          shippingPrice: baseData.shippingPrice,
          discountAmount: baseData.discountAmount ?? 0,
          couponCode: baseData.couponCode ?? null,
          priceTotal: baseData.priceTotal,
        },
        gross_amount: baseTax.gross,
        net_amount: baseTax.net,
        tax_amount: baseTax.tax,
        reason: 'Ursprüngliche Rechnung',
        trigger_source: 'initial',
        pdf_path: basePath,
        created_by: opts.createdBy ?? null,
      });
      if (insErr) {
        if (isMissingTable(insErr.message)) return { ok: false, skipped: true, reason: 'migration_pending' };
        console.error('[invoice-versions] baseline insert error:', insErr);
        return { ok: false, reason: 'insert_error' };
      }

      if (!changed) {
        return { ok: true, versionNumber: 1 };
      }
      // Baseline weicht ab => zusaetzlich die angepasste v2 anlegen.
      newData.adjustmentVersion = 2;
      newData.adjustmentReason = opts.reason;
      newData.replacesDate = baseData.invoiceDate;
      const newTax = computeTax(newData);
      const newPath = await renderAndUpload(supabase, bookingId, 2, newData);
      const { error: ins2 } = await supabase.from('invoice_versions').insert({
        booking_id: bookingId,
        invoice_number: newData.invoiceNumber ?? bookingId,
        version_number: 2,
        is_current: true,
        lines: {
          fingerprint: newFp,
          invoiceDate: newData.invoiceDate,
          cameraLines: newData.cameraLines ?? [],
          accessoryLines: newData.accessoryLines ?? [],
          priceRental: newData.priceRental,
          priceAccessories: newData.priceAccessories,
          priceHaftung: newData.priceHaftung,
          shippingPrice: newData.shippingPrice,
          discountAmount: newData.discountAmount ?? 0,
          couponCode: newData.couponCode ?? null,
          priceTotal: newData.priceTotal,
        },
        gross_amount: newTax.gross,
        net_amount: newTax.net,
        tax_amount: newTax.tax,
        reason: opts.reason,
        trigger_source: opts.triggerSource,
        pdf_path: newPath,
        created_by: opts.createdBy ?? null,
      });
      if (ins2) {
        console.error('[invoice-versions] v2 insert error:', ins2);
        return { ok: false, reason: 'insert_error' };
      }
      await logAudit({
        action: 'booking.invoice_version',
        entityType: 'booking',
        entityId: bookingId,
        changes: { version: 2, trigger: opts.triggerSource, gross: newTax.gross, reason: opts.reason },
        request: opts.request,
      }).catch(() => { /* best-effort */ });
      return { ok: true, versionNumber: 2 };
    }

    // ── Folge-Version (Baseline existiert bereits) ──────────────────────────
    const current = rows.find((r) => r.is_current) ?? rows[rows.length - 1];
    const curFp = (current.lines as { fingerprint?: string } | null)?.fingerprint ?? '';
    if (curFp === newFp) {
      return { ok: true, skipped: true, reason: 'no_change' };
    }

    const nextNum = Math.max(...rows.map((r) => Number(r.version_number) || 0)) + 1;
    const prevDate = (current.lines as { invoiceDate?: string } | null)?.invoiceDate;

    // Unique-Partial-Index erzwingt EINE aktuelle Fassung => alte erst aus.
    await supabase
      .from('invoice_versions')
      .update({ is_current: false })
      .eq('booking_id', bookingId)
      .eq('is_current', true);

    newData.adjustmentVersion = nextNum;
    newData.adjustmentReason = opts.reason;
    if (prevDate) newData.replacesDate = prevDate;
    const newTax = computeTax(newData);
    const newPath = await renderAndUpload(supabase, bookingId, nextNum, newData);

    const { error: insErr } = await supabase.from('invoice_versions').insert({
      booking_id: bookingId,
      invoice_number: newData.invoiceNumber ?? bookingId,
      version_number: nextNum,
      is_current: true,
      lines: {
        fingerprint: newFp,
        invoiceDate: newData.invoiceDate,
        cameraLines: newData.cameraLines ?? [],
        accessoryLines: newData.accessoryLines ?? [],
        priceRental: newData.priceRental,
        priceAccessories: newData.priceAccessories,
        priceHaftung: newData.priceHaftung,
        shippingPrice: newData.shippingPrice,
        discountAmount: newData.discountAmount ?? 0,
        couponCode: newData.couponCode ?? null,
        priceTotal: newData.priceTotal,
      },
      gross_amount: newTax.gross,
      net_amount: newTax.net,
      tax_amount: newTax.tax,
      reason: opts.reason,
      trigger_source: opts.triggerSource,
      pdf_path: newPath,
      created_by: opts.createdBy ?? null,
    });
    if (insErr) {
      console.error('[invoice-versions] insert error:', insErr);
      return { ok: false, reason: 'insert_error' };
    }
    await logAudit({
      action: 'booking.invoice_version',
      entityType: 'booking',
      entityId: bookingId,
      changes: { version: nextNum, trigger: opts.triggerSource, gross: newTax.gross, reason: opts.reason },
      request: opts.request,
    }).catch(() => { /* best-effort */ });
    return { ok: true, versionNumber: nextNum };
  } catch (e) {
    console.error('[invoice-versions] snapshot fatal (non-blocking):', e);
    return { ok: false, reason: 'fatal' };
  }
}
