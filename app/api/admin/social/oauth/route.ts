/**
 * OAuth-Flow für Meta (Facebook + Instagram).
 *
 * GET  /api/admin/social/oauth?action=start   → Redirect zu Meta-Login
 * GET  /api/admin/social/oauth?code=...       → Callback: Code → Token → Accounts anlegen
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import {
  buildFacebookLoginUrl,
  exchangeCodeForToken,
  exchangeLongLivedUserToken,
  getUserPages,
  getInstagramAccountForPage,
} from '@/lib/meta/graph-api';
import { randomBytes } from 'crypto';
import { logAudit } from '@/lib/audit';

function getBaseUrl(req: NextRequest): string {
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? 'cam2rent.de';
  const proto = req.headers.get('x-forwarded-proto') ?? 'https';
  return `${proto}://${host}`;
}

function getRedirectUri(req: NextRequest): string {
  return `${getBaseUrl(req)}/api/admin/social/oauth`;
}

function externalRedirect(req: NextRequest, path: string): NextResponse {
  return NextResponse.redirect(`${getBaseUrl(req)}${path}`);
}

export async function GET(req: NextRequest) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const action = url.searchParams.get('action');
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');
  const redirectUri = getRedirectUri(req);

  // ── Schritt 1: Login-URL generieren ───────────────────────────────────
  if (action === 'start') {
    if (!process.env.META_APP_ID || !process.env.META_APP_SECRET) {
      return NextResponse.json(
        { error: 'META_APP_ID / META_APP_SECRET nicht gesetzt (Coolify Env-Variablen)' },
        { status: 400 }
      );
    }
    const state = randomBytes(16).toString('hex');
    // State in Cookie speichern (kurz gültig)
    const loginUrl = buildFacebookLoginUrl(redirectUri, state);
    const res = NextResponse.json({ url: loginUrl });
    res.cookies.set('meta_oauth_state', state, { httpOnly: true, maxAge: 600, sameSite: 'lax', secure: true });
    return res;
  }

  // ── Schritt 2: Meta hat Fehler zurückgegeben ──────────────────────────
  if (error) {
    return externalRedirect(req, `/admin/social?error=${encodeURIComponent(error)}`);
  }

  // ── Schritt 3: Callback mit Code ──────────────────────────────────────
  if (code) {
    // CSRF-Schutz: state aus URL muss mit Cookie uebereinstimmen.
    // Ohne diesen Vergleich konnte ein Angreifer einen Owner via Phishing-
    // Link auf eine Meta-Authorize-URL locken; Meta hat den Code dann an
    // unseren Callback geschickt, der ihn — auf der gueltigen Owner-Session —
    // verarbeitet hat: Angreifers FB-Page wuerde danach fuer cam2rent posten.
    const stateParam = url.searchParams.get('state') ?? '';
    const stateCookie = req.cookies.get('meta_oauth_state')?.value ?? '';
    const stateOk = stateParam.length > 0
      && stateCookie.length > 0
      && stateParam.length === stateCookie.length
      && (() => {
        let r = 0;
        for (let i = 0; i < stateParam.length; i++) r |= stateParam.charCodeAt(i) ^ stateCookie.charCodeAt(i);
        return r === 0;
      })();
    if (!stateOk) {
      const res = externalRedirect(req, '/admin/social?error=invalid_state');
      res.cookies.delete('meta_oauth_state');
      return res;
    }

    try {
      // Token-Exchange
      const { access_token: shortToken } = await exchangeCodeForToken(code, redirectUri);
      const { access_token: userToken } = await exchangeLongLivedUserToken(shortToken);

      // Alle Pages holen
      const pages = await getUserPages(userToken);
      if (pages.length === 0) {
        return externalRedirect(req, '/admin/social?error=no_pages');
      }

      const supabase = createServiceClient();
      const expires = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(); // 60 Tage

      // Jede Page speichern + verknüpften IG-Account ermitteln
      for (const page of pages) {
        // Page-Token ist "never expire" solange User-Token gültig war → trotzdem 60d anzeigen
        const { data: fbAccount } = await supabase
          .from('social_accounts')
          .upsert(
            {
              platform: 'facebook',
              external_id: page.id,
              name: page.name,
              access_token: page.access_token,
              token_expires_at: expires,
              is_active: true,
            },
            { onConflict: 'platform,external_id' }
          )
          .select('id')
          .single();

        // IG-Account verknüpft?
        try {
          const ig = await getInstagramAccountForPage(page.id, page.access_token);
          if (ig && fbAccount) {
            await supabase.from('social_accounts').upsert(
              {
                platform: 'instagram',
                external_id: ig.id,
                name: ig.name,
                username: ig.username,
                picture_url: ig.profile_picture_url,
                access_token: page.access_token, // IG nutzt den Page-Token
                token_expires_at: expires,
                linked_account_id: fbAccount.id,
                is_active: true,
              },
              { onConflict: 'platform,external_id' }
            );
          }
        } catch (err) {
          console.warn('[social oauth] IG-Account-Lookup fehlgeschlagen für Page', page.id, err);
        }
      }

      await logAudit({
        action: 'social_oauth.connect',
        entityType: 'social_oauth',
        changes: { pages_connected: pages.length },
        request: req,
      });

      const res = externalRedirect(req, '/admin/social/einstellungen?connected=1');
      res.cookies.delete('meta_oauth_state');
      return res;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const res = externalRedirect(req, `/admin/social/einstellungen?error=${encodeURIComponent(msg)}`);
      res.cookies.delete('meta_oauth_state');
      return res;
    }
  }

  return NextResponse.json({ error: 'Ungültiger Aufruf' }, { status: 400 });
}

/** DELETE /api/admin/social/oauth?id=... → Account trennen */
export async function DELETE(req: NextRequest) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id fehlt' }, { status: 400 });

  const supabase = createServiceClient();
  const { error } = await supabase.from('social_accounts').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit({
    action: 'social_oauth.disconnect',
    entityType: 'social_oauth',
    entityId: id,
    request: req,
  });

  return NextResponse.json({ success: true });
}
