/**
 * E-Mail-Rechnungs-Import → Beleg-Pipeline.
 *
 * Wird vom IMAP-Cron (app/api/cron/inbound-email-poll) aufgerufen, wenn eine
 * eingehende Mail an die konfigurierte Rechnungs-Adresse ging
 * (belege_inbox_config). Erzeugt aus den PDF-/Bild-Anhaengen einen Beleg,
 * startet OCR (Lieferant, Positionen, KI-Klassifizierungs-Vorschlag,
 * Duplikat-Check) und benachrichtigt den Admin.
 *
 * Bewusste Grenzen (siehe Plan):
 *  - Eine Mail = ein Beleg. Erstes valides Attachment = Rechnung, weitere =
 *    'sonstiges' am selben Beleg. Mehrere Rechnungen bitte einzeln senden.
 *  - Kein Auto-Festschreiben, kein Auto-Apply der Klassifizierung — der Admin
 *    bestaetigt am Monatsende (GoBD).
 *
 * Alles service-role, kein Internal-HTTP-Fetch (analog run-ocr.ts).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ParsedInboundEmail } from '@/lib/inbound-email';
import { detectFileType, isAllowedImage } from '@/lib/file-type-check';
import { isTestMode } from '@/lib/env-mode';
import { getBerlinDateString } from '@/lib/timezone';
import { createBeleg, attachFileToBeleg } from '@/lib/buchhaltung/beleg-create';
import { runOcrForBeleg } from '@/lib/buchhaltung/run-ocr';
import { createAdminNotification } from '@/lib/admin-notifications';
import { logAudit } from '@/lib/audit';

const MAX_ATTACHMENTS = 10;
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024; // 25 MB

export type InboundBelegResult =
  | { status: 'created'; belegId: string; belegNr: string }
  | { status: 'duplicate' }
  | { status: 'skipped'; reason: string }
  | { status: 'error'; message: string };

/** Ist der Anhang ein per Magic-Byte erkanntes PDF oder ein erlaubtes Bild? */
function isInvoiceAttachment(buffer: Buffer): boolean {
  if (buffer.length === 0 || buffer.length > MAX_ATTACHMENT_BYTES) return false;
  const detected = detectFileType(buffer);
  if (!detected) return false;
  return detected === 'pdf' || isAllowedImage(buffer);
}

export async function processInboundBeleg(
  supabase: SupabaseClient,
  mail: ParsedInboundEmail,
): Promise<InboundBelegResult> {
  // ─── Idempotenz ueber email_message_id ──────────────────────────────────
  // Verhindert, dass dieselbe Mail bei mehreren Cron-Laeufen mehrere Belege
  // erzeugt. Fehlt die Spalte (Migration ausstehend), greift stattdessen der
  // Datei-Hash-Dedup im Attach-Schritt.
  if (mail.messageId) {
    const { data: existing, error } = await supabase
      .from('belege')
      .select('id')
      .eq('email_message_id', mail.messageId)
      .limit(1)
      .maybeSingle();
    if (!error && existing) return { status: 'duplicate' };
  }

  // ─── Valide Rechnungs-Anhaenge filtern ──────────────────────────────────
  const valid = mail.attachments
    .slice(0, MAX_ATTACHMENTS)
    .filter((a) => isInvoiceAttachment(a.content));
  if (valid.length === 0) {
    return { status: 'skipped', reason: 'no_valid_attachment' };
  }

  // ─── Leeren Beleg anlegen (quelle=email) ────────────────────────────────
  const isTest = await isTestMode();
  const belegDatum = getBerlinDateString(); // Eingangsdatum; OCR ueberschreibt mit Rechnungsdatum
  const { beleg, error: createErr } = await createBeleg(supabase, {
    belegDatum,
    quelle: 'email',
    isTest,
    emailMessageId: mail.messageId,
    notizen: `Automatischer Import per E-Mail von ${mail.from}`.slice(0, 2000),
  });
  if (!beleg) return { status: 'error', message: createErr ?? 'Beleg-Anlage fehlgeschlagen' };

  // ─── Anhaenge anhaengen (erster = rechnung, weitere = sonstiges) ─────────
  let attached = 0;
  for (let i = 0; i < valid.length; i++) {
    const att = valid[i];
    const kind = i === 0 ? 'rechnung' : 'sonstiges';
    const res = await attachFileToBeleg(supabase, beleg.id, {
      buffer: att.content,
      filename: att.filename,
      kind,
    });
    if (res.ok) {
      attached++;
      continue;
    }
    // Duplikat auf der Rechnung (byte-identisch schon einmal importiert):
    // leeren Beleg wieder loeschen, als duplicate melden.
    if ('duplicate' in res && i === 0) {
      await supabase.from('belege').delete().eq('id', beleg.id);
      return { status: 'duplicate' };
    }
    // Fehler auf der Rechnung (nicht Duplikat) → Beleg zuruecknehmen.
    if (i === 0 && 'error' in res) {
      await supabase.from('belege').delete().eq('id', beleg.id);
      return { status: 'error', message: res.error };
    }
    // Weitere Anhaenge best-effort: Fehler/Duplikat ueberspringen.
  }

  // ─── OCR (Lieferant, Positionen, KI-Vorschlag, Duplikat-Check) ──────────
  const ocr = await runOcrForBeleg(supabase, beleg.id);

  // ─── Admin-Benachrichtigung (Deep-Link auf den Beleg) ───────────────────
  const link = `/admin/buchhaltung/belege/${beleg.id}`;
  if (!ocr.ok) {
    await createAdminNotification(supabase, {
      type: 'beleg_failed',
      title: `Beleg-Analyse fehlgeschlagen: ${beleg.beleg_nr}`,
      message: `Per E-Mail von ${mail.from}. ${(ocr.error ?? 'Unbekannter Fehler')}`.slice(0, 200),
      link,
    }).catch(() => {});
  } else if (ocr.duplicate) {
    await createAdminNotification(supabase, {
      type: 'beleg_duplicate',
      title: `⚠ Verdacht auf Duplikat: ${beleg.beleg_nr}`,
      message: `${ocr.supplier ?? 'unbekannt'} — ${ocr.duplicate.reason}. Bitte pruefen.`,
      link,
    }).catch(() => {});
  } else {
    const itemsLabel = (ocr.items_extracted ?? 0) === 1 ? '1 Position' : `${ocr.items_extracted ?? 0} Positionen`;
    await createAdminNotification(supabase, {
      type: 'beleg_ready',
      title: `Beleg per E-Mail: ${beleg.beleg_nr}`,
      message: `${ocr.supplier ?? 'unbekannt'} · ${itemsLabel} erkannt — bitte klassifizieren.`,
      link,
    }).catch(() => {});
  }

  // ─── email_log + Audit ──────────────────────────────────────────────────
  try {
    await supabase.from('email_log').insert({
      customer_email: mail.from,
      email_type: 'inbound_beleg_received',
      subject: (mail.subject || '(kein Betreff)').slice(0, 200),
      status: 'sent',
    });
  } catch {
    // best-effort
  }

  await logAudit({
    action: 'beleg.email_import',
    entityType: 'beleg',
    entityId: beleg.id,
    entityLabel: beleg.beleg_nr,
    changes: {
      from: mail.from,
      attachments: attached,
      ocr_ok: ocr.ok,
      items: ocr.items_extracted ?? 0,
      duplicate_kind: ocr.duplicate?.kind ?? null,
    },
  });

  return { status: 'created', belegId: beleg.id, belegNr: beleg.beleg_nr };
}
