import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { detectFileType } from '@/lib/file-type-check';
import { isTestMode } from '@/lib/env-mode';
import { extractInvoice, type InvoiceMimeType } from '@/lib/ai/invoice-extract';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_SIZE = 20 * 1024 * 1024; // 20 MB
const ALLOWED: Record<string, InvoiceMimeType> = {
  pdf: 'application/pdf',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

// Kosten-Schutz: 20 Rechnungen/h pro IP reicht dicke fuer normalen Admin-Workflow
const uploadLimiter = rateLimit({ maxAttempts: 20, windowMs: 60 * 60 * 1000 });

/**
 * POST /api/admin/purchases/upload
 *
 * Nimmt eine Rechnungs-PDF/Bild entgegen, legt sie im Storage ab,
 * laesst Claude Vision die Daten extrahieren und klassifizieren, und
 * erzeugt daraus:
 *   - einen purchases-Datensatz (status='delivered', ai_raw_response)
 *   - pro Position einen purchase_items-Datensatz (classification='pending')
 *   - optional einen suppliers-Datensatz (wenn Lieferant noch nicht existiert)
 *
 * Die eigentliche Klassifikation (Asset vs. Expense) entscheidet der Admin
 * anschliessend per PATCH /api/admin/purchase-items/[id].
 *
 * FormData-Parameter:
 *   file: PDF oder Bild (max 20 MB)
 *
 * Optional Query-Parameter:
 *   ?supplier_id=...  — wenn bekannt, ueberschreibt den KI-Vorschlag
 */
export async function POST(req: NextRequest) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }

  const ip = getClientIp(req);
  const { success } = uploadLimiter.check(ip);
  if (!success) {
    return NextResponse.json({ error: 'Zu viele Uploads. Bitte warte einen Moment.' }, { status: 429 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const overrideSupplierId = (formData.get('supplier_id') as string | null) || null;

    if (!file || !(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: 'Keine Datei uebergeben.' }, { status: 400 });
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'Datei zu gross (max 20 MB).' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const detected = detectFileType(buffer);
    if (!detected || !(detected in ALLOWED)) {
      return NextResponse.json(
        { error: 'Dateiformat nicht unterstuetzt. Erlaubt: PDF, JPG, PNG, WebP. (HEIC bitte vorher konvertieren.)' },
        { status: 400 },
      );
    }
    const mimeType = ALLOWED[detected];

    const supabase = createServiceClient();
    const testMode = await isTestMode();

    // 1. Storage-Upload (Bucket 'purchase-invoices' muss im Supabase-UI
    //    angelegt sein, siehe supabase-assets.sql).
    const ext = detected === 'pdf' ? 'pdf' : detected;
    // Storage-Pfad nach Berlin-Jahr/Monat, sonst rutscht eine Rechnung am
    // 01.01. 00:30 Berlin (= 31.12. 23:30 UTC) in den falschen Ordner.
    const parts = new Intl.DateTimeFormat('en-CA', {
      year: 'numeric', month: '2-digit',
      timeZone: 'Europe/Berlin',
    }).formatToParts(new Date());
    const yyyy = parts.find((p) => p.type === 'year')?.value ?? '1970';
    const mm = parts.find((p) => p.type === 'month')?.value ?? '01';
    const storagePath = `${yyyy}/${mm}/${crypto.randomUUID()}.${ext}`;

    const { error: uploadErr } = await supabase.storage
      .from('purchase-invoices')
      .upload(storagePath, buffer, {
        contentType: mimeType,
        upsert: false,
      });

    if (uploadErr) {
      console.error('[purchases/upload] storage error', uploadErr);
      return NextResponse.json(
        { error: `Storage-Upload fehlgeschlagen: ${uploadErr.message}` },
        { status: 500 },
      );
    }

    // 2. KI-Extraktion
    let extracted;
    try {
      extracted = await extractInvoice(buffer, mimeType);
    } catch (err) {
      // Datei bleibt im Storage, Admin kann manuell erfassen
      console.error('[purchases/upload] extract error', err);
      return NextResponse.json(
        {
          error: `KI-Extraktion fehlgeschlagen: ${(err as Error).message}`,
          storage_path: storagePath,
        },
        { status: 502 },
      );
    }

    const { invoice, rawResponse } = extracted;

    // 3. Lieferanten finden oder anlegen
    let supplierId = overrideSupplierId;
    if (!supplierId) {
      const supplierName = invoice.supplier.name.trim();
      const { data: existing } = await supabase
        .from('suppliers')
        .select('id')
        .ilike('name', supplierName)
        .maybeSingle();

      if (existing) {
        supplierId = existing.id;
      } else {
        const { data: newSupplier, error: supErr } = await supabase
          .from('suppliers')
          .insert({
            name: supplierName,
            email: invoice.supplier.email ?? null,
            phone: invoice.supplier.phone ?? null,
            notes: invoice.supplier.vat_id
              ? `USt-ID: ${invoice.supplier.vat_id}\n${invoice.supplier.address ?? ''}`.trim()
              : invoice.supplier.address ?? null,
          })
          .select('id')
          .single();
        if (supErr) {
          console.error('[purchases/upload] supplier insert error', supErr);
          return NextResponse.json({ error: `Lieferant konnte nicht angelegt werden: ${supErr.message}` }, { status: 500 });
        }
        supplierId = newSupplier.id;
      }
    }

    // 4. Purchase anlegen
    const orderDate = invoice.invoice_date ?? new Date().toISOString().slice(0, 10);
    const { data: purchase, error: pErr } = await supabase
      .from('purchases')
      .insert({
        supplier_id: supplierId,
        order_date: orderDate,
        invoice_date: invoice.invoice_date ?? null,
        status: 'delivered',
        invoice_number: invoice.invoice_number ?? null,
        invoice_url: null,
        invoice_storage_path: storagePath,
        payment_method: invoice.payment_method ?? null,
        total_amount: invoice.totals.gross,
        net_amount: invoice.totals.net,
        tax_amount: invoice.totals.tax,
        ai_extracted_at: new Date().toISOString(),
        ai_raw_response: rawResponse as object,
        notes: invoice.notes ?? null,
        is_test: testMode,
      })
      .select()
      .single();

    if (pErr) {
      console.error('[purchases/upload] purchase insert error', pErr);
      return NextResponse.json({ error: `Einkauf konnte nicht angelegt werden: ${pErr.message}` }, { status: 500 });
    }

    // 5. Purchase-Items anlegen (classification='pending')
    const itemRows = invoice.items.map((item) => ({
      purchase_id: purchase.id,
      product_name: item.description.slice(0, 500),
      quantity: item.quantity,
      unit_price: item.unit_price_net,
      net_price: item.line_total_net,
      tax_rate: item.tax_rate,
      classification: 'pending',
      ai_suggestion: {
        suggested_classification: item.suggested_classification,
        suggested_category: item.suggested_category,
        suggested_kind: item.suggested_kind,
        suggested_useful_life_months: item.suggested_useful_life_months,
        line_total_gross: item.line_total_gross,
        confidence: item.confidence,
      },
    }));

    const { data: items, error: iErr } = await supabase
      .from('purchase_items')
      .insert(itemRows)
      .select();

    if (iErr) {
      console.error('[purchases/upload] items insert error', iErr);
      return NextResponse.json({ error: `Positionen konnten nicht angelegt werden: ${iErr.message}` }, { status: 500 });
    }

    return NextResponse.json({
      purchase_id: purchase.id,
      supplier_id: supplierId,
      items: items ?? [],
      extracted: invoice,
    }, { status: 201 });
  } catch (err) {
    console.error('[purchases/upload] unexpected', err);
    return NextResponse.json({ error: (err as Error).message || 'Unerwarteter Fehler' }, { status: 500 });
  }
}
