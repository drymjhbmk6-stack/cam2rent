import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { extractInvoice, type InvoiceMimeType } from '@/lib/ai/invoice-extract';
import { sanitizePosition, recomputeBelegSummen } from '@/lib/buchhaltung/beleg-utils';
import { logAudit } from '@/lib/audit';

const ALLOWED_MIME: ReadonlySet<InvoiceMimeType> = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

/**
 * POST /api/admin/belege/[id]/ocr
 * Body: { anhang_id: uuid }   (optional, sonst wird der erste rechnung-Anhang genommen)
 *
 * Laedt die Datei aus Storage, ruft extractInvoice auf, schreibt:
 *   - belege.beleg_datum, rechnungsnummer_lieferant, summe_netto, summe_brutto
 *   - lieferant_id (suche/erstelle)
 *   - beleg_positionen (eine pro Item) mit ki_vorschlag (klassifizierung)
 *
 * NICHT idempotent: ueberschreibt bestehende Positionen wenn der Beleg leer ist.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({})) as { anhang_id?: string };
  const supabase = createServiceClient();

  const { data: beleg } = await supabase.from('belege').select('*').eq('id', id).single();
  if (!beleg) return NextResponse.json({ error: 'Beleg nicht gefunden' }, { status: 404 });
  if (beleg.status === 'festgeschrieben') {
    return NextResponse.json({ error: 'Festgeschrieben' }, { status: 409 });
  }

  // Anhang holen
  let anhang;
  if (body.anhang_id) {
    const { data } = await supabase.from('beleg_anhaenge').select('*').eq('id', body.anhang_id).eq('beleg_id', id).single();
    anhang = data;
  } else {
    const { data } = await supabase.from('beleg_anhaenge')
      .select('*').eq('beleg_id', id).eq('typ', 'rechnung').order('created_at').limit(1).maybeSingle();
    anhang = data;
  }
  if (!anhang) return NextResponse.json({ error: 'Kein passender Anhang gefunden' }, { status: 400 });

  // File aus Storage laden
  const { data: blob, error: dlErr } = await supabase.storage
    .from('purchase-invoices').download((anhang as { storage_path: string }).storage_path);
  if (dlErr || !blob) return NextResponse.json({ error: dlErr?.message ?? 'Download fehlgeschlagen' }, { status: 500 });

  const buffer = Buffer.from(await blob.arrayBuffer());
  const rawMime = (anhang as { mime_type: string }).mime_type;
  // Eingehende Mime-Types vom Storage sind Plain-Strings — Claude akzeptiert
  // nur eine schmale Allowlist, sonst antwortet das Modell mit "Format nicht
  // unterstuetzt" und der OCR-Step schlaegt mit kryptischer Meldung fehl.
  if (!ALLOWED_MIME.has(rawMime as InvoiceMimeType)) {
    return NextResponse.json(
      { error: `OCR-Format ${rawMime} nicht unterstützt (erlaubt: PDF, JPG, PNG, WebP)` },
      { status: 415 },
    );
  }
  const mime = rawMime as InvoiceMimeType;

  let invoice;
  try {
    const result = await extractInvoice(buffer, mime);
    invoice = result.invoice;
  } catch (err) {
    return NextResponse.json({ error: `OCR fehlgeschlagen: ${(err as Error).message}` }, { status: 500 });
  }

  // Lieferant: existierender oder neuer
  let lieferantId: string | null = beleg.lieferant_id;
  if (!lieferantId && invoice.supplier?.name) {
    const supplierName = invoice.supplier.name.trim().slice(0, 200);
    const { data: existing } = await supabase
      .from('lieferanten').select('id').ilike('name', supplierName).maybeSingle();
    if (existing) {
      lieferantId = (existing as { id: string }).id;
    } else {
      const { data: created } = await supabase.from('lieferanten').insert({
        name: supplierName,
        adresse: invoice.supplier.address ?? null,
        email: invoice.supplier.email ?? null,
        ust_id: invoice.supplier.vat_id ?? null,
      }).select('id').single();
      if (created) lieferantId = (created as { id: string }).id;
    }
  }

  // Beleg-Header updaten
  await supabase.from('belege').update({
    lieferant_id: lieferantId,
    beleg_datum: invoice.invoice_date ?? beleg.beleg_datum,
    rechnungsnummer_lieferant: invoice.invoice_number ?? beleg.rechnungsnummer_lieferant,
  }).eq('id', id);

  // Existierende Positionen droppen (nur bei "leerem" Beleg ohne Klassifizierung)
  const { data: existing } = await supabase.from('beleg_positionen').select('id, klassifizierung').eq('beleg_id', id);
  const hasClassified = (existing ?? []).some((p) => (p as { klassifizierung: string }).klassifizierung !== 'pending');
  if (!hasClassified && (existing ?? []).length > 0) {
    await supabase.from('beleg_positionen').delete().eq('beleg_id', id);
  }

  // Positionen anlegen
  const newPositions = invoice.items.map((it, i) => ({
    ...sanitizePosition({
      reihenfolge: i,
      bezeichnung: it.description,
      menge: it.quantity,
      einzelpreis_netto: it.unit_price_net,
      mwst_satz: it.tax_rate,
      ki_vorschlag: {
        klassifizierung: it.suggested_classification === 'asset' ? 'afa'
          : it.suggested_classification === 'gwg' ? 'gwg'
          : it.suggested_classification === 'consumable' ? 'verbrauch'
          : 'ausgabe',
        begruendung: 'OCR-Vorschlag',
        confidence: it.confidence,
        art: it.suggested_kind === 'rental_camera' ? 'kamera'
          : it.suggested_kind === 'rental_accessory' ? 'zubehoer'
          : it.suggested_kind === 'office_equipment' ? 'buero'
          : it.suggested_kind === 'tool' ? 'werkzeug' : 'sonstiges',
        nutzungsdauer_monate: it.suggested_useful_life_months,
        kategorie: it.suggested_category,
      },
    }),
    beleg_id: id,
  }));

  if (newPositions.length > 0) {
    const { error: insErr } = await supabase.from('beleg_positionen').insert(newPositions);
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  await recomputeBelegSummen(supabase, id);
  await logAudit({ action: 'beleg.ocr', entityType: 'beleg', entityId: id, changes: { items: newPositions.length }, request: req });

  return NextResponse.json({ ok: true, items_extracted: newPositions.length, supplier: invoice.supplier?.name ?? null });
}
