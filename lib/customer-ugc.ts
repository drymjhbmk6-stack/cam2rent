import { SupabaseClient } from '@supabase/supabase-js';
import { sendAndLog, escapeHtml as h } from '@/lib/email';
import { BUSINESS } from '@/lib/business-config';
import { getSiteUrl, isTestMode } from '@/lib/env-mode';

export type UgcRewardSettings = {
  approve_discount_percent: number;
  approve_min_order_value: number;
  approve_validity_days: number;
  feature_discount_percent: number;
  feature_min_order_value: number;
  feature_validity_days: number;
  max_files_per_submission: number;
  max_file_size_mb: number;
  enabled: boolean;
};

export const DEFAULT_UGC_SETTINGS: UgcRewardSettings = {
  approve_discount_percent: 15,
  approve_min_order_value: 50,
  approve_validity_days: 120,
  feature_discount_percent: 25,
  feature_min_order_value: 50,
  feature_validity_days: 180,
  max_files_per_submission: 5,
  max_file_size_mb: 50,
  enabled: true,
};

export async function loadUgcSettings(supabase: SupabaseClient): Promise<UgcRewardSettings> {
  const { data } = await supabase
    .from('admin_settings')
    .select('value')
    .eq('key', 'customer_ugc_rewards')
    .maybeSingle();
  return { ...DEFAULT_UGC_SETTINGS, ...(data?.value ?? {}) };
}

/**
 * Liefert den naechsten freien UGC-Content-Coupon-Code im Format
 * `C2R-CONTENT-NNN` (im Test-Modus mit `TEST-`-Prefix).
 *
 * Counter ist durchgehend fortlaufend (kein Jahres-Reset), separat pro
 * is_test-Pool — Live- und Test-Codes stoeren sich nicht.
 *
 * Zwei-Strategien-Ansatz (analog `generateBookingId` in lib/booking-id.ts):
 *   (1) Atomarer RPC `next_content_coupon_counter(p_is_test)` — race-sicher.
 *       Setzt voraus dass `supabase-content-coupon-counter.sql` migriert ist.
 *   (2) Fallback: SELECT-MAX-basierter Kandidat + sequentielle Verifikation
 *       gegen `coupons.code`. Sequentiell sicher; bei paralleler Last sollte
 *       (1) genutzt werden.
 *
 * `padStart(3, '0')` paddet bis 999; danach automatisch breiter (1000, …).
 */
async function nextContentCouponCode(supabase: SupabaseClient): Promise<string> {
  const testMode = await isTestMode();
  const prefix = testMode ? 'TEST-C2R-CONTENT' : 'C2R-CONTENT';

  const formatCode = (n: number): string => `${prefix}-${String(n).padStart(3, '0')}`;

  // ── Strategie 1: Atomarer RPC ────────────────────────────────────────────
  try {
    const { data: rpcData, error: rpcErr } = await supabase.rpc('next_content_coupon_counter', {
      p_is_test: testMode,
    });
    if (!rpcErr && typeof rpcData === 'number' && rpcData > 0) {
      let seqNum = rpcData;
      for (let probe = 0; probe < 50; probe++) {
        const candidate = formatCode(seqNum);
        const { data: exists } = await supabase
          .from('coupons').select('id').ilike('code', candidate).maybeSingle();
        if (!exists) return candidate;
        seqNum++;
      }
    }
  } catch {
    // Migration fehlt oder RPC down → Strategie 2 unten.
  }

  // ── Strategie 2: SELECT-MAX-Kandidat + sequentielle Verifikation ─────────
  // Höchstes existierendes Suffix laden (case-insensitive Lookup, da der
  // coupons-UNIQUE-Index UPPER(code) nutzt — siehe supabase-gutscheine.sql).
  const { data: existing } = await supabase
    .from('coupons')
    .select('code')
    .ilike('code', `${prefix}-%`)
    .order('code', { ascending: false })
    .limit(50);

  let maxSeq = 0;
  for (const row of existing ?? []) {
    const m = String(row.code).match(/-(\d+)$/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > maxSeq) maxSeq = n;
    }
  }

  let seqNum = maxSeq + 1;
  for (let probe = 0; probe < 1000; probe++) {
    const candidate = formatCode(seqNum);
    const { data: exists, error: existsErr } = await supabase
      .from('coupons').select('id').ilike('code', candidate).maybeSingle();
    if (existsErr) {
      // DB-Fehler beim Pruefen — zurueck zum Kandidaten ohne Verifikation,
      // der INSERT-Pfad wird bei UNIQUE-Konflikt sauber 23505 zurueckgeben.
      return candidate;
    }
    if (!exists) return candidate;
    seqNum++;
  }
  return formatCode(seqNum);
}

/**
 * Erstellt einen account-gebundenen Gutschein fuer einen UGC-Kunden.
 *
 * Code-Format: `C2R-CONTENT-NNN` (atomar fortlaufend via RPC, siehe
 * `nextContentCouponCode`). Approve- und Feature-Coupons teilen sich denselben
 * Counter — ein Kunde mit Approve + Feature bekommt zwei aufeinanderfolgende
 * Nummern (z.B. `-042` und `-043`). Das ist gewollt.
 *
 * „Personalisiert" = account-gebunden: `target_type='user'`,
 * `target_user_email`, `max_uses=1`, `once_per_customer=true` — nur der
 * hochladende Kunde kann einlösen.
 */
export async function createUgcCoupon(
  supabase: SupabaseClient,
  opts: {
    targetEmail: string;
    discountPercent: number;
    minOrderValue: number;
    validityDays: number;
    description: string;
  },
): Promise<string | null> {
  const code = await nextContentCouponCode(supabase);

  const now = new Date();
  const validUntil = new Date(now.getTime() + opts.validityDays * 24 * 60 * 60 * 1000);

  const { data, error } = await supabase
    .from('coupons')
    .insert({
      code,
      type: 'percent',
      value: opts.discountPercent,
      description: opts.description,
      target_type: 'user',
      target_user_email: opts.targetEmail,
      valid_from: now.toISOString(),
      valid_until: validUntil.toISOString(),
      max_uses: 1,
      min_order_value: opts.minOrderValue,
      once_per_customer: true,
      not_combinable: false,
      active: true,
    })
    .select('code')
    .single();

  if (error) {
    console.error('[ugc-coupon] create Fehler:', error.message);
    return null;
  }
  return data?.code ?? null;
}

function emailShell(bodyHtml: string, baseUrl: string): string {
  // Sweep 7 Vuln 28 — BUSINESS-Felder escapen.
  // Werte stammen aus admin_settings.business_config (system-Permission). Wenn
  // jemand mit System-Permission versehentlich oder boeswillig Phishing-Links
  // einbaut, landen die sonst in jeder UGC- und Newsletter-Mail.
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f0f0f0;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:24px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;max-width:560px;width:100%;">
        <tr><td style="background:#0a0a0a;padding:28px 32px;">
          <span style="font-size:20px;font-weight:700;color:#fff;letter-spacing:-0.5px;">cam<span style="color:#3b82f6;">2</span>rent</span>
        </td></tr>
        <tr><td style="padding:32px;">${bodyHtml}</td></tr>
        <tr><td style="background:#f9fafb;padding:20px 32px;border-top:1px solid #e5e7eb;">
          <p style="margin:0;font-size:11px;color:#9ca3af;text-align:center;">
            ${h(BUSINESS.name)} · ${h(BUSINESS.addressLine)}<br>
            <a href="${h(baseUrl)}" style="color:#9ca3af;">${h(BUSINESS.domain)}</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

export async function sendUgcApprovedEmail(params: {
  to: string;
  name: string;
  code: string;
  discountPercent: number;
  validityDays: number;
  minOrderValue: number;
}) {
  const baseUrl = await getSiteUrl();
  const body = `
    <h1 style="margin:0 0 12px;font-size:22px;font-weight:700;color:#0a0a0a;">Danke für dein Material!</h1>
    <p style="margin:0 0 24px;font-size:15px;color:#6b7280;line-height:1.6;">
      Hallo ${h(params.name)},<br><br>
      wir haben deine Fotos/Videos erhalten und freigegeben — vielen Dank! Als Dankeschön bekommst du einen
      <strong>${params.discountPercent}% Gutschein</strong> für deine nächste Miete.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;background:#fef3c7;border:2px dashed #f59e0b;border-radius:10px;">
      <tr><td style="padding:24px;text-align:center;">
        <p style="margin:0 0 6px;font-size:13px;font-weight:600;color:#92400e;text-transform:uppercase;letter-spacing:0.8px;">Dein Gutschein-Code</p>
        <p style="margin:0 0 8px;font-family:monospace;font-size:24px;font-weight:700;color:#78350f;letter-spacing:1px;">${h(params.code)}</p>
        <p style="margin:0;font-size:12px;color:#a16207;">${params.discountPercent}% Rabatt · gültig ${params.validityDays} Tage · ab ${params.minOrderValue} €</p>
      </td></tr>
    </table>
    <p style="margin:0 0 16px;font-size:14px;color:#6b7280;line-height:1.5;">
      <strong>Noch ein Bonus:</strong> Falls wir dein Material auf Instagram, Facebook oder unserer Website zeigen, bekommst du zusätzlich einen 25 %-Gutschein — wir melden uns dann automatisch bei dir.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0 8px;">
      <tr><td align="center">
        <a href="${baseUrl}/kameras" style="display:inline-block;padding:14px 32px;background:#0a0a0a;color:#fff;text-decoration:none;border-radius:10px;font-size:14px;font-weight:600;">
          Nächste Miete starten
        </a>
      </td></tr>
    </table>`;
  await sendAndLog({
    to: params.to,
    subject: `Dein ${params.discountPercent}% Gutschein ist da`,
    html: emailShell(body, baseUrl),
    emailType: 'ugc_approved',
  });
}

export async function sendUgcFeaturedEmail(params: {
  to: string;
  name: string;
  code: string;
  discountPercent: number;
  validityDays: number;
  minOrderValue: number;
  channel: string;
}) {
  const baseUrl = await getSiteUrl();
  const channelLabel =
    params.channel === 'social'
      ? 'unseren Social-Media-Kanälen'
      : params.channel === 'blog'
        ? 'unserem Blog'
        : params.channel === 'website'
          ? 'unserer Website'
          : 'unseren Kanälen';
  const body = `
    <h1 style="margin:0 0 12px;font-size:22px;font-weight:700;color:#0a0a0a;">Dein Material ist live!</h1>
    <p style="margin:0 0 24px;font-size:15px;color:#6b7280;line-height:1.6;">
      Hallo ${h(params.name)},<br><br>
      wir haben dein Foto/Video gerade auf ${channelLabel} geteilt. Tausend Dank — richtig starker Content!
      Als kleines Extra gibt es einen weiteren <strong>${params.discountPercent}% Gutschein</strong>.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;background:#f3e8ff;border:2px dashed #9333ea;border-radius:10px;">
      <tr><td style="padding:24px;text-align:center;">
        <p style="margin:0 0 6px;font-size:13px;font-weight:600;color:#6b21a8;text-transform:uppercase;letter-spacing:0.8px;">Dein Feature-Bonus</p>
        <p style="margin:0 0 8px;font-family:monospace;font-size:24px;font-weight:700;color:#581c87;letter-spacing:1px;">${h(params.code)}</p>
        <p style="margin:0;font-size:12px;color:#7c3aed;">${params.discountPercent}% Rabatt · gültig ${params.validityDays} Tage · ab ${params.minOrderValue} €</p>
      </td></tr>
    </table>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0 8px;">
      <tr><td align="center">
        <a href="${baseUrl}/kameras" style="display:inline-block;padding:14px 32px;background:#0a0a0a;color:#fff;text-decoration:none;border-radius:10px;font-size:14px;font-weight:600;">
          Jetzt einlösen
        </a>
      </td></tr>
    </table>`;
  await sendAndLog({
    to: params.to,
    subject: `Dein cam2rent-Feature-Bonus: ${params.discountPercent}% Rabatt`,
    html: emailShell(body, baseUrl),
    emailType: 'ugc_featured',
  });
}

export async function sendUgcRejectedEmail(params: {
  to: string;
  name: string;
  reason: string;
}) {
  const baseUrl = await getSiteUrl();
  const body = `
    <h1 style="margin:0 0 12px;font-size:22px;font-weight:700;color:#0a0a0a;">Zu deinem Material-Upload</h1>
    <p style="margin:0 0 16px;font-size:15px;color:#6b7280;line-height:1.6;">
      Hallo ${h(params.name)},<br><br>
      vielen Dank für deine Einreichung. Leider können wir dein Material in dieser Form nicht verwenden.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;background:#fef2f2;border:1px solid #fecaca;border-radius:10px;">
      <tr><td style="padding:16px;">
        <p style="margin:0;font-size:14px;color:#991b1b;line-height:1.5;"><strong>Begründung:</strong><br>${h(params.reason).replace(/\n/g, '<br>')}</p>
      </td></tr>
    </table>
    <p style="margin:0 0 16px;font-size:14px;color:#6b7280;line-height:1.5;">
      Du kannst jederzeit neues Material hochladen — wir freuen uns auf den nächsten Upload!
    </p>`;
  await sendAndLog({
    to: params.to,
    subject: 'Zu deinem cam2rent-Material',
    html: emailShell(body, baseUrl),
    emailType: 'ugc_rejected',
  });
}
