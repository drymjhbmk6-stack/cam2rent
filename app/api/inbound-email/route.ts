import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { createServiceClient } from '@/lib/supabase';
import { createAdminNotification } from '@/lib/admin-notifications';
import { logAudit } from '@/lib/audit';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { detectFileType } from '@/lib/file-type-check';
import {
  verifyInboundSignature,
  parseInboundPayload,
  extractBookingId,
  htmlToPlainText,
} from '@/lib/inbound-email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST /api/inbound-email
 *
 * Resend-Inbound-Webhook: echte eingehende Kunden-E-Mails landen als
 * conversations/messages im Admin-Nachrichten-Bereich. Oeffentliche Route
 * (nicht /api/admin) — abgesichert ueber die Svix-Webhook-Signatur.
 */

const inboundLimiter = rateLimit({ maxAttempts: 200, windowMs: 60 * 60 * 1000 });

// Platzhalter-sender_id fuer E-Mail-Sender ohne Kundenkonto.
const EMAIL_SENDER_PLACEHOLDER = '00000000-0000-0000-0000-000000000001';

const MAX_ATTACHMENTS = 10;
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

const SCHEMA_ERROR = /column|schema cache|PGRST|does not exist|relation .* does not exist/i;

function isSchemaError(msg: string | undefined): boolean {
  return !!msg && SCHEMA_ERROR.test(msg);
}

const EXT_BY_TYPE: Record<string, string> = {
  pdf: 'pdf', jpeg: 'jpg', png: 'png', webp: 'webp', gif: 'gif', heic: 'heic', heif: 'heif',
};
const MIME_BY_TYPE: Record<string, string> = {
  pdf: 'application/pdf', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  gif: 'image/gif', heic: 'image/heic', heif: 'image/heif',
};

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (!inboundLimiter.check(ip).success) {
    return NextResponse.json({ error: 'Zu viele Anfragen.' }, { status: 429 });
  }

  const secret = process.env.RESEND_INBOUND_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'Webhook nicht konfiguriert.' }, { status: 500 });
  }

  const rawBody = await req.text();
  const ok = verifyInboundSignature(
    rawBody,
    {
      svixId: req.headers.get('svix-id'),
      svixTimestamp: req.headers.get('svix-timestamp'),
      svixSignature: req.headers.get('svix-signature'),
    },
    secret,
  );
  if (!ok) {
    return NextResponse.json({ error: 'Ungueltige Signatur.' }, { status: 401 });
  }

  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Ungueltiger Body.' }, { status: 400 });
  }

  const mail = parseInboundPayload(json);
  if (!mail) {
    // Kein verwertbarer Absender — 200, damit Resend nicht endlos retryt.
    return NextResponse.json({ ok: true, skipped: 'unparseable' });
  }

  const supabase = createServiceClient();

  // ─── Dedupe ueber Message-ID ────────────────────────────────────────────
  if (mail.messageId) {
    const { data: existing } = await supabase
      .from('messages')
      .select('id')
      .eq('email_message_id', mail.messageId)
      .maybeSingle();
    if (existing) {
      return NextResponse.json({ ok: true, skipped: 'duplicate' });
    }
  }

  const subject = (mail.subject || '(kein Betreff)').slice(0, 200);
  const bodyText = mail.text.trim() || htmlToPlainText(mail.html) || '(kein Textinhalt)';
  const bodyHtml = mail.html.trim() || null;

  // ─── Kundenzuordnung ueber Absender-E-Mail ──────────────────────────────
  let customerId: string | null = null;
  let customerName = mail.fromName || mail.from.split('@')[0];
  try {
    const { data } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    const authUser = data?.users?.find(
      (u) => u.email?.toLowerCase() === mail.from,
    );
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

  const now = new Date().toISOString();

  // ─── Konversation anlegen falls keine gefunden ──────────────────────────
  let createdConversation = false;
  if (!conversationId) {
    const { data: conv, error: convErr } = await supabase
      .from('conversations')
      .insert({
        customer_id: customerId,
        customer_email: mail.from,
        customer_name: customerName,
        subject,
        booking_id: bookingId,
        source: 'email',
        email_message_id: mail.messageId,
        closed: false,
        last_message_at: now,
      })
      .select('id')
      .single();
    if (convErr || !conv) {
      if (isSchemaError(convErr?.message)) {
        return NextResponse.json(
          { error: 'Migration ausstehend.' },
          { status: 503 },
        );
      }
      return NextResponse.json(
        { error: 'Konversation konnte nicht angelegt werden.' },
        { status: 500 },
      );
    }
    conversationId = conv.id;
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
    // Unique-Constraint auf email_message_id -> Webhook-Duplikat.
    if (msgErr?.code === '23505') {
      // Race: parallele Zustellung derselben Mail hat eben erst eine neue
      // (jetzt leere) Konversation angelegt — wieder zuruecknehmen.
      if (createdConversation && conversationId) {
        await supabase.from('conversations').delete().eq('id', conversationId);
      }
      return NextResponse.json({ ok: true, skipped: 'duplicate' });
    }
    if (isSchemaError(msgErr?.message)) {
      return NextResponse.json({ error: 'Migration ausstehend.' }, { status: 503 });
    }
    return NextResponse.json(
      { error: 'Nachricht konnte nicht gespeichert werden.' },
      { status: 500 },
    );
  }

  // ─── Anhaenge in Storage ablegen ────────────────────────────────────────
  let attachmentCount = 0;
  for (const att of mail.attachments.slice(0, MAX_ATTACHMENTS)) {
    try {
      const buffer = Buffer.from(att.contentBase64, 'base64');
      if (buffer.length === 0 || buffer.length > MAX_ATTACHMENT_BYTES) continue;

      const detected = detectFileType(buffer);
      // Erkannte PDFs/Bilder bekommen ihren echten MIME-Typ; alles andere
      // wird als octet-stream gespeichert (Signed-URL erzwingt Download,
      // kann nie als HTML/Script gerendert werden).
      const safeMime = detected ? MIME_BY_TYPE[detected] ?? 'application/octet-stream'
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
        .upload(storagePath, buffer, { contentType: safeMime, upsert: false });
      if (upErr) continue;

      await supabase.from('message_attachments').insert({
        message_id: msg.id,
        storage_path: storagePath,
        filename: att.filename.slice(0, 255),
        mime_type: safeMime,
        size_bytes: buffer.length,
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
    changes: { from: mail.from, booking_id: bookingId, attachments: attachmentCount },
  });

  return NextResponse.json({ ok: true, conversation_id: conversationId });
}
