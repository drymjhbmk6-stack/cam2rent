/**
 * Inbound-E-Mail-Verarbeitung (IMAP-Polling des Support-Postfachs).
 *
 * Echte Kunden-E-Mails werden per Cron (app/api/cron/inbound-email-poll)
 * via IMAP aus dem Google-Workspace-Postfach abgeholt, mit `mailparser`
 * geparst und hier in das conversations/messages-Modell geschrieben.
 *
 * Diese Datei kapselt alles Transport-/Format-Spezifische — ein Wechsel
 * des Abrufwegs beruehrt nur den Cron + parseImapMessage().
 */

import crypto from 'node:crypto';
import type { ParsedMail, AddressObject } from 'mailparser';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminNotification } from '@/lib/admin-notifications';
import { logAudit } from '@/lib/audit';
import { detectFileType } from '@/lib/file-type-check';
import { findAdminUserByInboxAddress } from '@/lib/admin-users';

// ─── Typen ──────────────────────────────────────────────────────────────────

export interface InboundAttachment {
  filename: string;
  content: Buffer;
}

export interface ParsedInboundEmail {
  from: string;
  fromName: string;
  /** Alle Empfaengeradressen (To + Cc + Delivered-To) — fuer die Mitarbeiter-Zuordnung. */
  recipients: string[];
  subject: string;
  text: string;
  html: string;
  messageId: string | null;
  inReplyTo: string | null;
  attachments: InboundAttachment[];
}

/** Sammelt alle E-Mail-Adressen aus einem mailparser-AddressObject. */
function collectAddresses(obj: AddressObject | AddressObject[] | undefined): string[] {
  if (!obj) return [];
  const list = Array.isArray(obj) ? obj : [obj];
  const out: string[] = [];
  for (const ao of list) {
    for (const v of ao.value ?? []) {
      if (v.address) out.push(v.address.trim().toLowerCase());
    }
  }
  return out;
}

// ─── Mailparser-Output -> ParsedInboundEmail ────────────────────────────────

/**
 * Wandelt das von `mailparser.simpleParser()` erzeugte ParsedMail-Objekt in
 * unsere interne Struktur um. Gibt null zurueck, wenn keine Absenderadresse
 * ermittelbar ist.
 */
export function parseImapMessage(parsed: ParsedMail): ParsedInboundEmail | null {
  const fromAddr = parsed.from?.value?.[0];
  const from = (fromAddr?.address ?? '').trim().toLowerCase();
  if (!from || !from.includes('@')) return null;

  const fromName = (fromAddr?.name ?? '').trim() || from.split('@')[0];

  const inReplyTo =
    parsed.inReplyTo ??
    (Array.isArray(parsed.references) ? parsed.references[0] : parsed.references) ??
    null;

  const attachments: InboundAttachment[] = [];
  for (const a of parsed.attachments ?? []) {
    if (!a.content || !Buffer.isBuffer(a.content)) continue;
    attachments.push({
      filename: (a.filename || 'anhang').slice(0, 255),
      content: a.content,
    });
  }

  const recipients = [...collectAddresses(parsed.to), ...collectAddresses(parsed.cc)];
  // Gmail/IMAP setzt zusaetzlich "Delivered-To" — bei Alias-Postfaechern oft
  // die zuverlaessigste Quelle fuer die tatsaechliche Zustelladresse.
  const deliveredTo = parsed.headers?.get('delivered-to');
  if (typeof deliveredTo === 'string') {
    recipients.push(deliveredTo.trim().toLowerCase());
  } else if (Array.isArray(deliveredTo)) {
    for (const d of deliveredTo) {
      if (typeof d === 'string') recipients.push(d.trim().toLowerCase());
    }
  }

  return {
    from,
    fromName,
    recipients: [...new Set(recipients.filter(Boolean))],
    subject: typeof parsed.subject === 'string' ? parsed.subject : '',
    text: typeof parsed.text === 'string' ? parsed.text : '',
    html: typeof parsed.html === 'string' ? parsed.html : '',
    messageId: parsed.messageId ? parsed.messageId.trim() : null,
    inReplyTo: inReplyTo ? String(inReplyTo).trim() : null,
    attachments,
  };
}

/**
 * Erkennt automatisierte Massen-E-Mails (Newsletter, Bounce, Auto-Reply).
 * Echte Kundenanfragen tragen diese Header nicht — so bleibt die Inbox sauber.
 */
export function isAutomatedEmail(parsed: ParsedMail): boolean {
  const headers = parsed.headers;
  const get = (name: string): string => {
    const v = headers?.get(name);
    return typeof v === 'string' ? v.toLowerCase() : '';
  };
  if (headers?.has('list-unsubscribe') || headers?.has('list-id')) return true;
  const autoSub = get('auto-submitted');
  if (autoSub && autoSub !== 'no') return true;
  const precedence = get('precedence');
  if (['bulk', 'list', 'junk', 'auto_reply'].includes(precedence)) return true;
  return false;
}

// ─── Threading-Helfer ───────────────────────────────────────────────────────

/** Buchungsnummer aus dem Betreff ziehen (Format C2R-YYWW-NNN, optional TEST-). */
export function extractBookingId(subject: string): string | null {
  const m = subject.match(/(?:TEST-)?C2R-\d{4}-\d+/i);
  return m ? m[0].toUpperCase() : null;
}

/** Grobe HTML->Text-Reduktion als Fallback fuer messages.body. */
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#x27;/gi, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ─── DB-Verarbeitung ────────────────────────────────────────────────────────

// Platzhalter-sender_id fuer E-Mail-Sender ohne Kundenkonto.
const EMAIL_SENDER_PLACEHOLDER = '00000000-0000-0000-0000-000000000001';
const MAX_ATTACHMENTS = 10;
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
const SCHEMA_ERROR = /column|schema cache|PGRST|does not exist|relation .* does not exist/i;

const EXT_BY_TYPE: Record<string, string> = {
  pdf: 'pdf', jpeg: 'jpg', png: 'png', webp: 'webp', gif: 'gif', heic: 'heic', heif: 'heif',
};
const MIME_BY_TYPE: Record<string, string> = {
  pdf: 'application/pdf', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  gif: 'image/gif', heic: 'image/heic', heif: 'image/heif',
};

export type InboundResult =
  | { status: 'created'; conversationId: string }
  | { status: 'duplicate' }
  | { status: 'migration_pending' }
  | { status: 'error'; message: string };

/**
 * Schreibt eine geparste eingehende E-Mail in conversations/messages.
 * Idempotent ueber messages.email_message_id (Unique-Index).
 */
export async function processInboundEmail(
  supabase: SupabaseClient,
  mail: ParsedInboundEmail,
): Promise<InboundResult> {
  // ─── Dedupe ueber Message-ID ────────────────────────────────────────────
  if (mail.messageId) {
    const { data: existing } = await supabase
      .from('messages')
      .select('id')
      .eq('email_message_id', mail.messageId)
      .maybeSingle();
    if (existing) return { status: 'duplicate' };
  }

  const subject = (mail.subject || '(kein Betreff)').slice(0, 200);
  const bodyText = mail.text.trim() || htmlToPlainText(mail.html) || '(kein Textinhalt)';
  const bodyHtml = mail.html.trim() || null;

  // ─── Kundenzuordnung ueber Absender-E-Mail ──────────────────────────────
  let customerId: string | null = null;
  let customerName = mail.fromName;
  try {
    const { data } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    const authUser = data?.users?.find((u) => u.email?.toLowerCase() === mail.from);
    if (authUser) {
      customerId = authUser.id;
      const metaName = authUser.user_metadata?.full_name;
      if (typeof metaName === 'string' && metaName.trim()) customerName = metaName.trim();
    }
  } catch {
    // Auth-Lookup best-effort
  }

  // ─── Buchungs-Verknuepfung ──────────────────────────────────────────────
  let bookingId: string | null = null;
  const subjectBookingId = extractBookingId(subject);
  if (subjectBookingId) {
    const { data: b } = await supabase
      .from('bookings')
      .select('id')
      .eq('id', subjectBookingId)
      .maybeSingle();
    if (b) bookingId = b.id;
  }
  if (!bookingId) {
    const { data: b } = await supabase
      .from('bookings')
      .select('id')
      .ilike('customer_email', mail.from)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (b) bookingId = b.id;
  }

  // ─── Threading: bestehende Konversation finden ──────────────────────────
  let conversationId: string | null = null;

  if (mail.inReplyTo) {
    const { data: m } = await supabase
      .from('messages')
      .select('conversation_id')
      .eq('email_message_id', mail.inReplyTo)
      .limit(1)
      .maybeSingle();
    if (m) conversationId = m.conversation_id;
    if (!conversationId) {
      const { data: c } = await supabase
        .from('conversations')
        .select('id')
        .eq('email_message_id', mail.inReplyTo)
        .limit(1)
        .maybeSingle();
      if (c) conversationId = c.id;
    }
  }

  if (!conversationId && bookingId) {
    const { data: c } = await supabase
      .from('conversations')
      .select('id')
      .eq('booking_id', bookingId)
      .eq('source', 'email')
      .order('last_message_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (c) conversationId = c.id;
  }

  if (!conversationId) {
    const { data: c } = await supabase
      .from('conversations')
      .select('id')
      .eq('source', 'email')
      .ilike('customer_email', mail.from)
      .eq('closed', false)
      .order('last_message_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (c) conversationId = c.id;
  }

  // ─── Mitarbeiter-Zuordnung ueber das An-Feld ────────────────────────────
  const routed = await findAdminUserByInboxAddress(mail.recipients);
  const assignedAdminUserId = routed?.id ?? null;
  const inboxAddress = routed?.inbox_address ?? null;

  const now = new Date().toISOString();

  // ─── Konversation anlegen falls keine gefunden ──────────────────────────
  let createdConversation = false;
  if (!conversationId) {
    const baseRow = {
      customer_id: customerId,
      customer_email: mail.from,
      customer_name: customerName,
      subject,
      booking_id: bookingId,
      source: 'email',
      email_message_id: mail.messageId,
      closed: false,
      last_message_at: now,
    };
    // Mit Mitarbeiter-Zuordnung versuchen; fehlt die per-employee-Migration,
    // ohne die beiden Felder erneut (Basis-Inbound funktioniert trotzdem).
    let convRes = await supabase
      .from('conversations')
      .insert({ ...baseRow, assigned_admin_user_id: assignedAdminUserId, inbox_address: inboxAddress })
      .select('id')
      .single();
    if (convRes.error && SCHEMA_ERROR.test(convRes.error.message)) {
      convRes = await supabase
        .from('conversations')
        .insert(baseRow)
        .select('id')
        .single();
    }
    if (convRes.error || !convRes.data) {
      if (SCHEMA_ERROR.test(convRes.error?.message ?? '')) return { status: 'migration_pending' };
      return { status: 'error', message: convRes.error?.message ?? 'Konversation fehlgeschlagen.' };
    }
    conversationId = convRes.data.id;
    createdConversation = true;
  }

  // ─── Nachricht einfuegen ────────────────────────────────────────────────
  const { data: msg, error: msgErr } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_type: 'customer',
      sender_id: customerId ?? EMAIL_SENDER_PLACEHOLDER,
      body: bodyText.slice(0, 50000),
      body_html: bodyHtml,
      email_message_id: mail.messageId,
      email_in_reply_to: mail.inReplyTo,
      read: false,
    })
    .select('id')
    .single();

  if (msgErr || !msg) {
    if (msgErr?.code === '23505') {
      // Race-Duplikat — eben angelegte leere Konversation zuruecknehmen.
      if (createdConversation && conversationId) {
        await supabase.from('conversations').delete().eq('id', conversationId);
      }
      return { status: 'duplicate' };
    }
    if (SCHEMA_ERROR.test(msgErr?.message ?? '')) return { status: 'migration_pending' };
    return { status: 'error', message: msgErr?.message ?? 'Nachricht fehlgeschlagen.' };
  }

  // ─── Anhaenge in Storage ablegen ────────────────────────────────────────
  let attachmentCount = 0;
  for (const att of mail.attachments.slice(0, MAX_ATTACHMENTS)) {
    try {
      if (att.content.length === 0 || att.content.length > MAX_ATTACHMENT_BYTES) continue;
      const detected = detectFileType(att.content);
      // Erkannte PDFs/Bilder bekommen ihren echten MIME-Typ; alles andere
      // wird als octet-stream gespeichert (Signed-URL erzwingt Download).
      const safeMime = detected
        ? MIME_BY_TYPE[detected] ?? 'application/octet-stream'
        : 'application/octet-stream';
      const ext = detected ? EXT_BY_TYPE[detected] ?? 'bin' : 'bin';

      const parts = new Intl.DateTimeFormat('en-CA', {
        year: 'numeric', month: '2-digit', timeZone: 'Europe/Berlin',
      }).formatToParts(new Date());
      const yyyy = parts.find((p) => p.type === 'year')?.value ?? '1970';
      const mm = parts.find((p) => p.type === 'month')?.value ?? '01';
      const storagePath = `${yyyy}/${mm}/${crypto.randomUUID()}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from('email-attachments')
        .upload(storagePath, att.content, { contentType: safeMime, upsert: false });
      if (upErr) continue;

      await supabase.from('message_attachments').insert({
        message_id: msg.id,
        storage_path: storagePath,
        filename: att.filename,
        mime_type: safeMime,
        size_bytes: att.content.length,
      });
      attachmentCount++;
    } catch {
      // einzelne Anhaenge best-effort
    }
  }

  // ─── last_message_at aktualisieren ──────────────────────────────────────
  await supabase
    .from('conversations')
    .update({ last_message_at: now })
    .eq('id', conversationId);

  // ─── Admin-Benachrichtigung (Push an Mitarbeiter mit kunden-Permission) ──
  await createAdminNotification(supabase, {
    type: 'new_message',
    title: `Neue E-Mail von ${customerName}`,
    message: subject,
    link: '/admin/nachrichten',
  });

  // ─── email_log + Audit ──────────────────────────────────────────────────
  try {
    await supabase.from('email_log').insert({
      booking_id: bookingId,
      customer_email: mail.from,
      email_type: 'inbound_received',
      subject,
      status: 'sent',
    });
  } catch {
    // Log best-effort
  }

  await logAudit({
    action: 'inbound_email.received',
    entityType: 'nachricht',
    entityId: conversationId ?? undefined,
    entityLabel: subject,
    changes: { from: mail.from, booking_id: bookingId, attachments: attachmentCount, assigned_to: inboxAddress },
  });

  return { status: 'created', conversationId: conversationId! };
}
