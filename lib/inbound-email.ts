/**
 * Inbound-E-Mail-Verarbeitung (Resend Inbound).
 *
 * Diese Datei kapselt ALLES, was provider-spezifisch ist: Webhook-
 * Signaturpruefung (Svix-Schema, das Resend nutzt) und das Parsen des
 * Payloads. Ein spaeterer Provider-Wechsel (Postmark/Mailgun) beruehrt
 * nur diese Datei — der Webhook-Handler in app/api/inbound-email bleibt
 * unveraendert.
 */

import crypto from 'node:crypto';

// ─── Webhook-Signaturpruefung (Svix-Schema) ─────────────────────────────────

/**
 * Verifiziert die Svix-Webhook-Signatur, die Resend mitschickt.
 *
 * Signiert wird `${svix-id}.${svix-timestamp}.${rawBody}` per HMAC-SHA256.
 * Das Secret hat das Format `whsec_<base64>` — der base64-Teil ist der
 * eigentliche Schluessel. Der `svix-signature`-Header enthaelt ein oder
 * mehrere leerzeichengetrennte `v1,<base64sig>`-Eintraege.
 */
export function verifyInboundSignature(
  rawBody: string,
  headers: {
    svixId: string | null;
    svixTimestamp: string | null;
    svixSignature: string | null;
  },
  secret: string,
): boolean {
  const { svixId, svixTimestamp, svixSignature } = headers;
  if (!svixId || !svixTimestamp || !svixSignature || !secret) return false;

  // Replay-Schutz: Timestamp darf nicht mehr als 5 Min abweichen.
  const ts = Number(svixTimestamp);
  if (!Number.isFinite(ts)) return false;
  const ageSec = Math.abs(Date.now() / 1000 - ts);
  if (ageSec > 300) return false;

  const secretBytes = secret.startsWith('whsec_')
    ? Buffer.from(secret.slice(6), 'base64')
    : Buffer.from(secret, 'utf8');

  const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`;
  const expected = crypto
    .createHmac('sha256', secretBytes)
    .update(signedContent)
    .digest('base64');
  const expectedBuf = Buffer.from(expected);

  // Header kann mehrere Signaturen enthalten (Key-Rotation).
  for (const part of svixSignature.split(' ')) {
    const sig = part.includes(',') ? part.split(',')[1] : part;
    if (!sig) continue;
    const sigBuf = Buffer.from(sig);
    if (
      sigBuf.length === expectedBuf.length &&
      crypto.timingSafeEqual(sigBuf, expectedBuf)
    ) {
      return true;
    }
  }
  return false;
}

// ─── Payload-Parsing ────────────────────────────────────────────────────────

export interface InboundAttachment {
  filename: string;
  contentBase64: string;
}

export interface ParsedInboundEmail {
  from: string;
  fromName: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  messageId: string | null;
  inReplyTo: string | null;
  attachments: InboundAttachment[];
}

/** "Max Mustermann <max@example.de>" -> { email, name } */
export function parseEmailAddress(raw: unknown): { email: string; name: string } {
  const str = typeof raw === 'string' ? raw.trim() : '';
  if (!str) return { email: '', name: '' };
  const match = str.match(/^(.*?)<([^>]+)>$/);
  if (match) {
    return {
      name: match[1].trim().replace(/^["']|["']$/g, ''),
      email: match[2].trim().toLowerCase(),
    };
  }
  return { email: str.toLowerCase(), name: '' };
}

function readHeader(headers: unknown, name: string): string | null {
  const want = name.toLowerCase();
  if (Array.isArray(headers)) {
    for (const h of headers) {
      if (h && typeof h === 'object' && 'name' in h && 'value' in h) {
        if (String((h as { name: unknown }).name).toLowerCase() === want) {
          return String((h as { value: unknown }).value);
        }
      }
    }
  } else if (headers && typeof headers === 'object') {
    for (const [k, v] of Object.entries(headers as Record<string, unknown>)) {
      if (k.toLowerCase() === want) return String(v);
    }
  }
  return null;
}

/**
 * Parst den Resend-Inbound-Webhook-Payload. Tolerant gegenueber leichten
 * Schema-Abweichungen (Resend Inbound ist jung). Gibt null zurueck, wenn
 * keine Absenderadresse ermittelbar ist.
 */
export function parseInboundPayload(json: unknown): ParsedInboundEmail | null {
  if (!json || typeof json !== 'object') return null;
  const root = json as Record<string, unknown>;
  // Resend wrappt die Nutzdaten in `data`.
  const data = (root.data && typeof root.data === 'object'
    ? (root.data as Record<string, unknown>)
    : root) as Record<string, unknown>;

  const fromRaw = data.from ?? data.sender ?? '';
  const { email: from, name: fromName } = parseEmailAddress(
    typeof fromRaw === 'string' ? fromRaw : '',
  );
  if (!from || !from.includes('@')) return null;

  const toRaw = data.to;
  const to = Array.isArray(toRaw)
    ? parseEmailAddress(String(toRaw[0] ?? '')).email
    : parseEmailAddress(typeof toRaw === 'string' ? toRaw : '').email;

  const headers = data.headers;
  const messageId =
    (typeof data.message_id === 'string' ? data.message_id : null) ??
    readHeader(headers, 'Message-ID') ??
    readHeader(headers, 'Message-Id');
  const inReplyTo =
    (typeof data.in_reply_to === 'string' ? data.in_reply_to : null) ??
    readHeader(headers, 'In-Reply-To') ??
    readHeader(headers, 'References');

  const attachments: InboundAttachment[] = [];
  const rawAtt = data.attachments;
  if (Array.isArray(rawAtt)) {
    for (const a of rawAtt) {
      if (!a || typeof a !== 'object') continue;
      const att = a as Record<string, unknown>;
      const content = att.content;
      let base64 = '';
      if (typeof content === 'string') {
        base64 = content;
      } else if (
        content &&
        typeof content === 'object' &&
        Array.isArray((content as { data?: unknown }).data)
      ) {
        // Node-Buffer-JSON-Form { type: 'Buffer', data: [...] }
        base64 = Buffer.from(
          (content as { data: number[] }).data,
        ).toString('base64');
      }
      if (!base64) continue;
      attachments.push({
        filename:
          typeof att.filename === 'string' && att.filename.trim()
            ? att.filename.trim()
            : 'anhang',
        contentBase64: base64,
      });
    }
  }

  return {
    from,
    fromName,
    to,
    subject: typeof data.subject === 'string' ? data.subject : '',
    text: typeof data.text === 'string' ? data.text : '',
    html: typeof data.html === 'string' ? data.html : '',
    messageId: messageId ? messageId.trim() : null,
    inReplyTo: inReplyTo ? inReplyTo.trim() : null,
    attachments,
  };
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
