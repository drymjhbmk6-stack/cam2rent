/**
 * Wiederverwendbare Server-Helfer zum Anlegen eines Belegs und zum Anhaengen
 * einer Datei — herausgezogen aus den Route-Handlern
 * (app/api/admin/belege/route.ts + .../[id]/anhaenge/route.ts), damit die
 * E-Mail-Import-Pipeline (lib/buchhaltung/inbound-beleg.ts) exakt dieselbe
 * Logik nutzt (Dedup, Rollback, Migrations-Fallback) und nichts divergiert.
 *
 * KEIN Internal-HTTP-Fetch: alles laeuft service-role direkt gegen die DB /
 * Storage (analog run-ocr.ts — Internal-Fetch wuerde die Admin-Session ueber
 * das UA-Binding der Middleware killen).
 */

import crypto from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { detectFileType, isAllowedImage } from '@/lib/file-type-check';
import {
  nextBelegNr,
  recomputeBelegSummen,
  sanitizePosition,
  type BelegPositionInput,
} from '@/lib/buchhaltung/beleg-utils';
import { findContentDuplicate, persistDuplicateWarning } from '@/lib/buchhaltung/duplicate-check';

const ALLOWED_KINDS = new Set(['rechnung', 'quittung', 'lieferschein', 'sonstiges']);

// Fehler-Signaturen, die auf eine fehlende Migration (Spalte/Constraint) deuten.
const EMAIL_COL_ERROR = /email_message_id|column|schema cache|PGRST/i;
const QUELLE_CONSTRAINT_ERROR = /quelle|check constraint|23514/i;

export interface CreateBelegInput {
  belegDatum: string;                     // 'YYYY-MM-DD'
  quelle?: 'upload' | 'manuell' | 'email';
  isTest: boolean;
  lieferantId?: string | null;
  bezahlDatum?: string | null;
  rechnungsnummerLieferant?: string | null;
  istEigenbeleg?: boolean;
  eigenbelegGrund?: string | null;
  notizen?: string | null;
  emailMessageId?: string | null;
  positionen?: BelegPositionInput[];
}

export interface BelegRow {
  id: string;
  beleg_nr: string;
  [key: string]: unknown;
}

/**
 * Legt einen Beleg an (optional mit Positionen), rechnet die Summen neu und
 * fuehrt den inhaltsbasierten Duplikat-Check aus. Wirft NIE — gibt bei Fehler
 * `{ beleg: null, error }` zurueck.
 *
 * Defensiver Migrations-Fallback: kennt die DB `quelle='email'` oder die
 * Spalte `email_message_id` noch nicht, wird ohne diese Felder erneut
 * eingefuegt (quelle -> 'upload'), damit der Import nicht hart bricht.
 */
export async function createBeleg(
  supabase: SupabaseClient,
  input: CreateBelegInput,
): Promise<{ beleg: BelegRow | null; error?: string }> {
  const jahr = new Date(input.belegDatum).getFullYear();
  let belegNr: string;
  try {
    belegNr = await nextBelegNr(supabase, jahr);
  } catch (err) {
    return { beleg: null, error: (err as Error).message };
  }

  const quelle = input.quelle ?? 'manuell';
  const baseRow: Record<string, unknown> = {
    beleg_nr: belegNr,
    lieferant_id: input.lieferantId ?? null,
    beleg_datum: input.belegDatum,
    // Bezahl-Datum-Default: auf Beleg-Datum spiegeln (zeitnahe Bezahlung),
    // manueller Override bleibt moeglich.
    bezahl_datum: input.bezahlDatum ?? input.belegDatum,
    rechnungsnummer_lieferant: input.rechnungsnummerLieferant ?? null,
    summe_netto: 0,
    summe_brutto: 0,
    status: 'offen',
    quelle,
    ist_eigenbeleg: !!input.istEigenbeleg,
    eigenbeleg_grund: input.eigenbelegGrund ?? null,
    notizen: input.notizen ?? null,
    is_test: input.isTest,
  };
  if (input.emailMessageId) baseRow.email_message_id = input.emailMessageId;

  let insRes = await supabase.from('belege').insert(baseRow).select('*').single();

  // Fallback bei fehlender Migration: email_message_id-Spalte oder quelle='email'.
  if (insRes.error) {
    const msg = insRes.error.message;
    const missingEmailCol = !!input.emailMessageId && EMAIL_COL_ERROR.test(msg);
    const badQuelle = quelle === 'email' && QUELLE_CONSTRAINT_ERROR.test(msg);
    if (missingEmailCol || badQuelle) {
      const fb = { ...baseRow };
      delete fb.email_message_id;
      if (badQuelle) fb.quelle = 'upload';
      insRes = await supabase.from('belege').insert(fb).select('*').single();
    }
  }
  if (insRes.error || !insRes.data) {
    return { beleg: null, error: insRes.error?.message ?? 'Beleg-Insert fehlgeschlagen' };
  }
  const beleg = insRes.data as BelegRow;

  // Positionen (nur wenn vorhanden — Upload/E-Mail-Pfad startet leer).
  const positionen = input.positionen ?? [];
  if (positionen.length > 0) {
    const sanitized = positionen.map((p, i) => ({
      ...sanitizePosition({ ...p, reihenfolge: p.reihenfolge ?? i }),
      beleg_id: beleg.id,
    }));
    const { error: posErr } = await supabase.from('beleg_positionen').insert(sanitized);
    if (posErr) {
      await supabase.from('belege').delete().eq('id', beleg.id);
      return { beleg: null, error: posErr.message };
    }
  }

  await recomputeBelegSummen(supabase, beleg.id);

  // Inhaltsbasierter Duplikat-Check (Reload, weil recomputeBelegSummen die
  // Brutto-Spalte gerade frisch geschrieben hat). Bei leerem Beleg ohne
  // Lieferant liefert findContentDuplicate null — kein Fehlalarm.
  const { data: reloaded } = await supabase
    .from('belege')
    .select('id, lieferant_id, beleg_datum, rechnungsnummer_lieferant, summe_brutto, is_test')
    .eq('id', beleg.id)
    .single();
  if (reloaded) {
    const dup = await findContentDuplicate(supabase, {
      belegId: beleg.id,
      lieferantId: (reloaded as { lieferant_id: string | null }).lieferant_id,
      belegDatum: (reloaded as { beleg_datum: string | null }).beleg_datum,
      rechnungsnummerLieferant: (reloaded as { rechnungsnummer_lieferant: string | null }).rechnungsnummer_lieferant,
      summeBrutto: Number((reloaded as { summe_brutto: number | string }).summe_brutto ?? 0),
      isTest: !!(reloaded as { is_test: boolean }).is_test,
    });
    await persistDuplicateWarning(supabase, beleg.id, dup);
  }

  return { beleg };
}

export type AttachResult =
  | { ok: true; anhang: Record<string, unknown> }
  | { ok: false; duplicate: true; existingBelegId: string; existingBelegNr: string | null; existingDateiname: string }
  | { ok: false; error: string; status: number };

/**
 * Haengt eine Datei (Buffer) an einen Beleg. Spiegelt exakt die Logik von
 * app/api/admin/belege/[id]/anhaenge/route.ts:
 *  - Magic-Byte-Check (PDF/JPEG/PNG/WebP/HEIC)
 *  - SHA-256-file_hash-Dedup (byte-identische Datei -> duplicate)
 *  - Upload nach Bucket `purchase-invoices`, Pfad YYYY/MM/<uuid>.<ext>
 *  - Insert `beleg_anhaenge` mit Migrations-Fallback ohne file_hash
 *  - Rollback des Storage-Objekts bei DB-Insert-Fehler
 */
export async function attachFileToBeleg(
  supabase: SupabaseClient,
  belegId: string,
  file: { buffer: Buffer; filename: string; kind?: string },
): Promise<AttachResult> {
  const kind = file.kind && ALLOWED_KINDS.has(file.kind) ? file.kind : 'rechnung';
  const buffer = file.buffer;

  const detected = detectFileType(buffer);
  if (!detected || (detected !== 'pdf' && !isAllowedImage(buffer))) {
    return { ok: false, error: 'Dateityp nicht erlaubt (PDF/JPEG/PNG/WebP/HEIC)', status: 400 };
  }

  const fileHash = crypto.createHash('sha256').update(buffer).digest('hex');

  const { data: existing } = await supabase
    .from('beleg_anhaenge')
    .select('id, beleg_id, dateiname, beleg:belege(id, beleg_nr, status)')
    .eq('file_hash', fileHash)
    .limit(1)
    .maybeSingle();
  if (existing) {
    const ex = existing as {
      beleg_id: string;
      dateiname: string;
      beleg: { id: string; beleg_nr: string } | { id: string; beleg_nr: string }[] | null;
    };
    const belegRef = Array.isArray(ex.beleg) ? ex.beleg[0] : ex.beleg;
    return {
      ok: false,
      duplicate: true,
      existingBelegId: belegRef?.id ?? ex.beleg_id,
      existingBelegNr: belegRef?.beleg_nr ?? null,
      existingDateiname: ex.dateiname,
    };
  }

  const ext = detected === 'pdf' ? 'pdf' : detected;
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const path = `${yyyy}/${mm}/${crypto.randomUUID()}.${ext}`;
  const mime = detected === 'pdf' ? 'application/pdf' : `image/${detected}`;

  const { error: upErr } = await supabase.storage
    .from('purchase-invoices')
    .upload(path, buffer, { contentType: mime, upsert: false });
  if (upErr) return { ok: false, error: upErr.message, status: 500 };

  const row = {
    beleg_id: belegId,
    storage_path: path,
    dateiname: file.filename.slice(0, 200),
    typ: kind,
    size_bytes: buffer.length,
    mime_type: mime,
    file_hash: fileHash,
  };

  const { data: anhang, error: insErr } = await supabase
    .from('beleg_anhaenge').insert(row).select('*').single();
  if (insErr) {
    // Migrations-Fallback: file_hash-Spalte fehlt noch.
    if (/file_hash/i.test(insErr.message)) {
      const { file_hash: _omit, ...rowNoHash } = row;
      void _omit;
      const { data: anhang2, error: insErr2 } = await supabase
        .from('beleg_anhaenge').insert(rowNoHash).select('*').single();
      if (insErr2) {
        await supabase.storage.from('purchase-invoices').remove([path]);
        return { ok: false, error: insErr2.message, status: 500 };
      }
      return { ok: true, anhang: anhang2 as Record<string, unknown> };
    }
    await supabase.storage.from('purchase-invoices').remove([path]);
    return { ok: false, error: insErr.message, status: 500 };
  }

  return { ok: true, anhang: anhang as Record<string, unknown> };
}
