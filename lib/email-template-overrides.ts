/**
 * E-Mail-Vorlagen-Overrides — Stufe 2 fuer /admin/emails/vorlagen.
 *
 * Admin kann pro Template (keyed by emailType, identisch zur catalog id)
 * Betreff und einen einleitenden Textblock ueberschreiben. Die Werte
 * werden in `admin_settings.email_template_overrides` als JSON gespeichert
 * und in `sendAndLog()` (lib/email.ts) automatisch angewendet.
 *
 * Die Ueberschreibungen greifen ueberall — echte Sends, Manuell-Versand
 * aus Buchungsdetails und die Vorschau unter /admin/emails/vorlagen.
 *
 * Rendering-Strategie:
 *   - Subject: Wenn override.subject gesetzt → ersetzt das Default-Subject.
 *   - Einleitung: Optionaler kurzer HTML-Block, der direkt nach der
 *     ersten </h1>-Ueberschrift im Body eingefuegt wird. Faellt es keine
 *     </h1> gibt, wird der Block am Anfang des Body-Bereichs eingehaengt.
 *
 * HTML-Sanitizing: Wir lassen einen kleinen, sicheren Subset zu
 * (<b>, <i>, <em>, <strong>, <u>, <br>, <p>, <a>, <span>, <ul>, <ol>, <li>,
 * <h2>, <h3>). Skripte, Iframes, Event-Handler und javascript:-Links werden
 * entfernt. Damit kann ein Admin (versehentlich) keinen XSS in eine
 * Kundenmail einbauen.
 */

import { createServiceClient } from '@/lib/supabase';

export interface EmailTemplateOverride {
  /** Komplett neuer Betreff. Leer = Default verwenden. */
  subject?: string;
  /** Optionaler HTML-Block, der nach der Ueberschrift eingefuegt wird. */
  introHtml?: string;
}

export type EmailTemplateOverrideMap = Record<string, EmailTemplateOverride>;

const CFG_KEY = 'email_template_overrides';
const CACHE_TTL_MS = 30_000;

let cached: EmailTemplateOverrideMap | null = null;
let cachedAt = 0;

export function invalidateEmailTemplateOverridesCache() {
  cached = null;
  cachedAt = 0;
}

function isPlainRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function normalize(raw: unknown): EmailTemplateOverrideMap {
  if (!isPlainRecord(raw)) return {};
  const out: EmailTemplateOverrideMap = {};
  for (const [id, val] of Object.entries(raw)) {
    if (!isPlainRecord(val)) continue;
    const entry: EmailTemplateOverride = {};
    if (typeof val.subject === 'string') {
      const trimmed = val.subject.trim();
      if (trimmed) entry.subject = trimmed;
    }
    if (typeof val.introHtml === 'string') {
      const trimmed = val.introHtml.trim();
      if (trimmed) entry.introHtml = trimmed;
    }
    if (entry.subject || entry.introHtml) {
      out[id] = entry;
    }
  }
  return out;
}

function safeParse(s: string): unknown {
  try { return JSON.parse(s); } catch { return null; }
}

export async function getEmailTemplateOverrides(): Promise<EmailTemplateOverrideMap> {
  const now = Date.now();
  if (cached && now - cachedAt < CACHE_TTL_MS) return cached;
  try {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from('admin_settings')
      .select('value')
      .eq('key', CFG_KEY)
      .maybeSingle();
    const raw = typeof data?.value === 'string' ? safeParse(data.value) : data?.value;
    const map = normalize(raw);
    cached = map;
    cachedAt = now;
    return map;
  } catch {
    return {};
  }
}

export async function getEmailTemplateOverride(id: string): Promise<EmailTemplateOverride | null> {
  const map = await getEmailTemplateOverrides();
  return map[id] ?? null;
}

export async function setEmailTemplateOverride(
  id: string,
  override: EmailTemplateOverride | null,
): Promise<EmailTemplateOverrideMap> {
  if (!id || typeof id !== 'string') {
    throw new Error('Template-ID fehlt.');
  }
  const current = await getEmailTemplateOverrides();
  const next: EmailTemplateOverrideMap = { ...current };

  // Sanitize + persist
  const cleaned = override ? sanitizeOverride(override) : null;
  if (!cleaned || (!cleaned.subject && !cleaned.introHtml)) {
    delete next[id];
  } else {
    next[id] = cleaned;
  }

  const supabase = createServiceClient();
  await supabase
    .from('admin_settings')
    .upsert({ key: CFG_KEY, value: next, updated_at: new Date().toISOString() });

  invalidateEmailTemplateOverridesCache();
  return next;
}

function sanitizeOverride(raw: EmailTemplateOverride): EmailTemplateOverride {
  const out: EmailTemplateOverride = {};
  if (raw.subject) {
    const trimmed = raw.subject.trim().slice(0, 250);
    if (trimmed) out.subject = trimmed;
  }
  if (raw.introHtml) {
    const sanitized = sanitizeIntroHtml(raw.introHtml);
    if (sanitized.trim()) out.introHtml = sanitized;
  }
  return out;
}

const ALLOWED_TAGS = new Set([
  'b', 'strong', 'i', 'em', 'u', 's', 'br', 'p', 'a', 'span', 'div',
  'ul', 'ol', 'li', 'h2', 'h3', 'small', 'code',
]);

/**
 * Sanitizer mit Allowlist. Erlaubt einen sicheren Subset an HTML —
 * entfernt <script>, <iframe>, <style>, sowie alle Event-Handler-Attribute
 * und javascript:-URLs.
 *
 * Bewusst minimal gehalten: keine vollstaendige DOMPurify-Implementierung,
 * aber ausreichend gegen versehentlich kopierten Embed-Code.
 */
export function sanitizeIntroHtml(html: string): string {
  if (!html) return '';
  let s = String(html);

  // 1) Komplett entfernte Bloecke (mit Inhalt)
  s = s.replace(/<(script|style|iframe|object|embed|noscript)\b[\s\S]*?<\/\1>/gi, '');
  // 2) Selbstschliessende oder ohne End-Tag
  s = s.replace(/<(script|style|iframe|object|embed|noscript)\b[^>]*\/?>/gi, '');

  // 3) Tags filtern: alles entfernen, das nicht in der Allowlist ist;
  //    erlaubte Tags muessen ihre Attribute ebenfalls saeubern.
  s = s.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g, (full, tag: string, attrs: string) => {
    const name = tag.toLowerCase();
    if (!ALLOWED_TAGS.has(name)) return '';
    const isClosing = full.startsWith('</');
    if (isClosing) return `</${name}>`;
    const cleanAttrs = sanitizeAttributes(name, attrs);
    return `<${name}${cleanAttrs}>`;
  });

  // 4) Restliche on*-Handler oder javascript:-URLs als Text-Fallback rauswerfen
  s = s.replace(/javascript:/gi, '');

  return s;
}

function sanitizeAttributes(tag: string, raw: string): string {
  if (!raw) return '';
  // Sehr einfacher Attribute-Parser — ausreichend fuer den Allowlist-Subset.
  const attrRegex = /\s+([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = attrRegex.exec(raw)) !== null) {
    const name = m[1].toLowerCase();
    const value = m[3] ?? m[4] ?? m[5] ?? '';
    if (name.startsWith('on')) continue;
    if (name === 'style') continue; // Vermeidet style-basierte Tricks
    if (tag === 'a') {
      if (name === 'href') {
        const href = value.trim();
        if (/^(https?:|mailto:|\/|#)/i.test(href)) {
          out.push(` href="${escapeAttr(href)}"`);
        }
        continue;
      }
      if (name === 'title') {
        out.push(` title="${escapeAttr(value)}"`);
        continue;
      }
      if (name === 'target') {
        if (value === '_blank') out.push(' target="_blank" rel="noopener noreferrer"');
        continue;
      }
    }
    if (name === 'title') {
      out.push(` title="${escapeAttr(value)}"`);
    }
    // Andere Attribute werden verworfen
  }
  return out.join('');
}

function escapeAttr(v: string): string {
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Wendet Overrides auf eine bereits gerenderte E-Mail an.
 * - Subject wird ersetzt, wenn override.subject gesetzt ist.
 * - Intro-HTML wird nach der ersten </h1> eingefuegt (oder, falls keine
 *   Ueberschrift existiert, am Anfang des Body-Containers).
 */
export function applyEmailOverride(
  rendered: { subject: string; html: string },
  override: EmailTemplateOverride | null | undefined,
): { subject: string; html: string } {
  if (!override) return rendered;
  let subject = rendered.subject;
  let html = rendered.html;

  if (override.subject) {
    subject = override.subject;
  }

  if (override.introHtml) {
    const block = `\n<div data-cam2rent-intro="1" style="margin:0 0 22px;font-size:15px;line-height:1.55;color:#374151;">${override.introHtml}</div>\n`;
    const headingClose = html.indexOf('</h1>');
    if (headingClose >= 0) {
      const insertAt = headingClose + '</h1>'.length;
      html = html.slice(0, insertAt) + block + html.slice(insertAt);
    } else {
      // Fallback: nach dem oeffnenden weissen Body-Container einsetzen
      const bodyOpen = html.match(/<td[^>]*background\s*:\s*#?ffffff[^>]*>/i);
      if (bodyOpen && bodyOpen.index !== undefined) {
        const insertAt = bodyOpen.index + bodyOpen[0].length;
        html = html.slice(0, insertAt) + block + html.slice(insertAt);
      } else {
        // Letzter Fallback: an den Anfang
        html = block + html;
      }
    }
  }

  return { subject, html };
}
