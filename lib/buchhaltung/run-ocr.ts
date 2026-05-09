import type { SupabaseClient } from '@supabase/supabase-js';
import { extractInvoice, type InvoiceMimeType } from '@/lib/ai/invoice-extract';
import { sanitizePosition, recomputeBelegSummen } from '@/lib/buchhaltung/beleg-utils';
import { findContentDuplicate, persistDuplicateWarning, type DuplicateMatch } from '@/lib/buchhaltung/duplicate-check';

/**
 * OCR-Logik fuer einen einzelnen Beleg, herausgezogen aus der Route, damit
 * sie sowohl der OCR-Endpoint als auch der Bulk-Retry-Endpoint direkt aufrufen
 * koennen — KEIN Internal-HTTP-Fetch mehr.
 *
 * Internal-Fetch hatte das Problem, dass die Middleware den UA des aktuellen
 * Requests gegen den UA der Session-Row vergleicht (Sweep 6 Vuln 15 +
 * Sweep 7 Vuln 13). Node-Fetch sendet "undici" als UA, der DB-Wert ist der
 * Browser-UA, daher Mismatch → DELETE der Session-Row → komplette
 * Abmeldung des Admins. Funktion-Aufruf umgeht das komplett.
 */

const ALLOWED_MIME: ReadonlySet<InvoiceMimeType> = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

// Process-lokaler Semaphor — begrenzt OCR-Calls auf 3 parallel.
// Anthropic Tier 1 hat 50K ITPM (input tokens per minute), eine Vision-OCR
// braucht ~3-5K Tokens. Bei 3 parallel & ~10 s pro Call kommen wir auf ca.
// 9-15 RPM und 27-75K ITPM — knapp unter Tier-1-Limit, knapp ueber Tier-1
// bei grossen PDFs aber dann fangen die SDK-Retries (maxRetries=5 mit
// Exponential-Backoff) den Rest auf.
const OCR_MAX_CONCURRENT = 3;
let ocrInFlight = 0;
const ocrWaiters: Array<() => void> = [];

async function acquireOcrSlot(): Promise<void> {
  if (ocrInFlight < OCR_MAX_CONCURRENT) {
    ocrInFlight++;
    return;
  }
  await new Promise<void>((resolve) => ocrWaiters.push(resolve));
  // Slot wird beim Resolve in releaseOcrSlot bereits "uebergeben" — wir muessen
  // hier nicht nochmal incrementen, weil release dekrementiert + sofort
  // weckt; effektiv ist die in-flight-Zahl konstant beim Handoff.
}
function releaseOcrSlot(): void {
  ocrInFlight--;
  const next = ocrWaiters.shift();
  if (next) {
    ocrInFlight++;
    next();
  }
}

// Defensive Status-Helper. Wenn die Migration noch nicht durch ist, fehlen
// ocr_status und ocr_error in der Tabelle und ein normaler UPDATE wuerde
// scheitern. Wir wollen dann lautlos weitermachen, sonst bricht der OCR-Pfad.
async function setOcrStatus(
  supabase: SupabaseClient,
  belegId: string,
  patch: { ocr_status: string; ocr_error?: string | null; ocr_started_at?: string | null; ocr_finished_at?: string | null },
): Promise<void> {
  const { error } = await supabase.from('belege').update(patch).eq('id', belegId);
  if (error && /ocr_status|ocr_error|ocr_started_at|ocr_finished_at/i.test(error.message)) {
    // Migration fehlt — nichts zu tun.
    return;
  }
  if (error) {
    console.error('[ocr] setOcrStatus:', error.message);
  }
}

export interface RunOcrResult {
  ok: boolean;
  status: number;             // HTTP-aehnlicher Code, fuer Route-Wrapper
  error?: string;
  beleg_nr?: string;
  items_extracted?: number;
  supplier?: string | null;
  duplicate?: DuplicateMatch | null;
}

export interface RunOcrOptions {
  anhangId?: string;
}

/**
 * Fuehrt eine einzelne OCR-Analyse durch. Idempotent gegen running-Status —
 * setzt ocr_status korrekt im Lebenszyklus running → done|failed. Wirft NIE,
 * gibt stattdessen `{ ok: false, error }` zurueck.
 */
export async function runOcrForBeleg(
  supabase: SupabaseClient,
  belegId: string,
  opts: RunOcrOptions = {},
): Promise<RunOcrResult> {
  const { data: belegRaw } = await supabase.from('belege').select('*').eq('id', belegId).single();
  if (!belegRaw) {
    return { ok: false, status: 404, error: 'Beleg nicht gefunden' };
  }
  const beleg = belegRaw as {
    id: string;
    beleg_nr: string;
    status: string;
    lieferant_id: string | null;
    beleg_datum: string;
    rechnungsnummer_lieferant: string | null;
  };
  if (beleg.status === 'festgeschrieben') {
    return { ok: false, status: 409, error: 'Festgeschrieben', beleg_nr: beleg.beleg_nr };
  }

  await setOcrStatus(supabase, belegId, {
    ocr_status: 'running',
    ocr_error: null,
    ocr_started_at: new Date().toISOString(),
    ocr_finished_at: null,
  });

  // Lokaler Fail-Helper — schreibt failed-Status, gibt Result zurueck.
  const fail = async (status: number, message: string): Promise<RunOcrResult> => {
    await setOcrStatus(supabase, belegId, {
      ocr_status: 'failed',
      ocr_error: message.slice(0, 1000),
      ocr_finished_at: new Date().toISOString(),
    });
    return { ok: false, status, error: message, beleg_nr: beleg.beleg_nr };
  };

  // Anhang holen
  let anhang;
  if (opts.anhangId) {
    const { data } = await supabase.from('beleg_anhaenge').select('*').eq('id', opts.anhangId).eq('beleg_id', belegId).single();
    anhang = data;
  } else {
    const { data } = await supabase.from('beleg_anhaenge')
      .select('*').eq('beleg_id', belegId).eq('typ', 'rechnung').order('created_at').limit(1).maybeSingle();
    anhang = data;
  }
  if (!anhang) return fail(400, 'Kein passender Anhang gefunden');

  // File aus Storage laden
  const { data: blob, error: dlErr } = await supabase.storage
    .from('purchase-invoices').download((anhang as { storage_path: string }).storage_path);
  if (dlErr || !blob) return fail(500, dlErr?.message ?? 'Download fehlgeschlagen');

  const buffer = Buffer.from(await blob.arrayBuffer());
  const rawMime = (anhang as { mime_type: string }).mime_type;
  if (!ALLOWED_MIME.has(rawMime as InvoiceMimeType)) {
    return fail(415, `OCR-Format ${rawMime} nicht unterstützt (erlaubt: PDF, JPG, PNG, WebP)`);
  }
  const mime = rawMime as InvoiceMimeType;

  let invoice;
  await acquireOcrSlot();
  try {
    const result = await extractInvoice(buffer, mime);
    invoice = result.invoice;
  } catch (err) {
    return fail(500, `OCR fehlgeschlagen: ${(err as Error).message}`);
  } finally {
    releaseOcrSlot();
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
  }).eq('id', belegId);

  // Existierende Positionen droppen (nur bei "leerem" Beleg ohne Klassifizierung)
  const { data: existingPos } = await supabase.from('beleg_positionen').select('id, klassifizierung').eq('beleg_id', belegId);
  const hasClassified = (existingPos ?? []).some((p) => (p as { klassifizierung: string }).klassifizierung !== 'pending');
  if (!hasClassified && (existingPos ?? []).length > 0) {
    await supabase.from('beleg_positionen').delete().eq('beleg_id', belegId);
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
    beleg_id: belegId,
  }));

  if (newPositions.length > 0) {
    const { error: insErr } = await supabase.from('beleg_positionen').insert(newPositions);
    if (insErr) return fail(500, insErr.message);
  }

  await recomputeBelegSummen(supabase, belegId);

  // Inhaltsbasierter Duplikat-Check. Reload zuerst, weil summe_brutto gerade
  // frisch berechnet wurde.
  const { data: belegPostOcr } = await supabase
    .from('belege')
    .select('id, lieferant_id, beleg_datum, rechnungsnummer_lieferant, summe_brutto, is_test')
    .eq('id', belegId)
    .single();
  let duplicate: DuplicateMatch | null = null;
  if (belegPostOcr) {
    duplicate = await findContentDuplicate(supabase, {
      belegId,
      lieferantId: (belegPostOcr as { lieferant_id: string | null }).lieferant_id,
      belegDatum: (belegPostOcr as { beleg_datum: string | null }).beleg_datum,
      rechnungsnummerLieferant: (belegPostOcr as { rechnungsnummer_lieferant: string | null }).rechnungsnummer_lieferant,
      summeBrutto: Number((belegPostOcr as { summe_brutto: number | string }).summe_brutto ?? 0),
      isTest: !!(belegPostOcr as { is_test: boolean }).is_test,
    });
  }
  await persistDuplicateWarning(supabase, belegId, duplicate);

  await setOcrStatus(supabase, belegId, {
    ocr_status: 'done',
    ocr_error: null,
    ocr_finished_at: new Date().toISOString(),
  });

  return {
    ok: true,
    status: 200,
    beleg_nr: beleg.beleg_nr,
    items_extracted: newPositions.length,
    supplier: invoice.supplier?.name ?? null,
    duplicate,
  };
}
