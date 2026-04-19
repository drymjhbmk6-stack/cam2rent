/**
 * Meta Graph API Client — Facebook + Instagram
 *
 * Dokumentation:
 *   - Facebook Pages:   https://developers.facebook.com/docs/pages-api
 *   - Instagram Graph:  https://developers.facebook.com/docs/instagram-platform
 *
 * Authentifizierung:
 *   - Long-Lived Page Token (gültig ~60 Tage, auto-refresh)
 *   - Instagram-Publishing läuft über den Token der verknüpften FB-Page
 */

const GRAPH_API_VERSION = 'v21.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

export class MetaApiError extends Error {
  code: number;
  subcode?: number;
  fbtrace_id?: string;
  constructor(message: string, code: number, subcode?: number, fbtrace_id?: string) {
    super(message);
    this.name = 'MetaApiError';
    this.code = code;
    this.subcode = subcode;
    this.fbtrace_id = fbtrace_id;
  }
}

type GraphResponse<T> = T & { error?: { message: string; type: string; code: number; error_subcode?: number; fbtrace_id?: string } };

async function graphFetch<T = unknown>(
  path: string,
  { method = 'GET', token, body, query }: { method?: 'GET' | 'POST' | 'DELETE'; token?: string; body?: Record<string, unknown>; query?: Record<string, string | number | undefined> } = {}
): Promise<T> {
  const url = new URL(`${GRAPH_BASE}${path.startsWith('/') ? path : `/${path}`}`);
  if (token) url.searchParams.set('access_token', token);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
  }

  const init: RequestInit = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) init.body = JSON.stringify(body);

  const res = await fetch(url.toString(), init);
  const json = (await res.json()) as GraphResponse<T>;

  if (json.error) {
    throw new MetaApiError(json.error.message, json.error.code, json.error.error_subcode, json.error.fbtrace_id);
  }
  if (!res.ok) {
    throw new MetaApiError(`HTTP ${res.status}`, res.status);
  }
  return json as T;
}

// ──────────────────────────────────────────────────────────────────────────
// OAuth / Token-Management
// ──────────────────────────────────────────────────────────────────────────

/**
 * Tauscht einen Short-Lived User-Token gegen einen Long-Lived User-Token (60 Tage).
 */
export async function exchangeLongLivedUserToken(shortToken: string): Promise<{ access_token: string; expires_in: number }> {
  return graphFetch('/oauth/access_token', {
    query: {
      grant_type: 'fb_exchange_token',
      client_id: process.env.META_APP_ID,
      client_secret: process.env.META_APP_SECRET,
      fb_exchange_token: shortToken,
    },
  });
}

/**
 * Holt alle FB-Pages des Nutzers + deren Long-Lived Page Tokens.
 * Page-Tokens sind "never expire", solange der User-Token gültig war.
 */
export async function getUserPages(userToken: string): Promise<Array<{ id: string; name: string; access_token: string; category: string; tasks: string[] }>> {
  const res = await graphFetch<{ data: Array<{ id: string; name: string; access_token: string; category: string; tasks: string[] }> }>(
    '/me/accounts',
    { token: userToken, query: { fields: 'id,name,access_token,category,tasks', limit: 100 } }
  );
  return res.data;
}

/**
 * Holt den Instagram-Business-Account, der mit einer FB-Page verknüpft ist.
 */
export async function getInstagramAccountForPage(pageId: string, pageToken: string): Promise<{ id: string; username: string; name: string; profile_picture_url: string } | null> {
  const res = await graphFetch<{ instagram_business_account?: { id: string } }>(`/${pageId}`, {
    token: pageToken,
    query: { fields: 'instagram_business_account' },
  });
  if (!res.instagram_business_account?.id) return null;

  const ig = await graphFetch<{ id: string; username: string; name: string; profile_picture_url: string }>(
    `/${res.instagram_business_account.id}`,
    { token: pageToken, query: { fields: 'id,username,name,profile_picture_url' } }
  );
  return ig;
}

/**
 * Metadaten einer FB-Page holen.
 */
export async function getPageInfo(pageId: string, pageToken: string): Promise<{ id: string; name: string; picture: { data: { url: string } } }> {
  return graphFetch(`/${pageId}`, {
    token: pageToken,
    query: { fields: 'id,name,picture{url}' },
  });
}

// ──────────────────────────────────────────────────────────────────────────
// Facebook Page Publishing
// ──────────────────────────────────────────────────────────────────────────

/**
 * Text-Post auf FB-Page (mit optionalem Link).
 */
export async function publishFacebookTextPost(pageId: string, pageToken: string, message: string, link?: string): Promise<{ id: string }> {
  return graphFetch(`/${pageId}/feed`, {
    method: 'POST',
    token: pageToken,
    body: { message, ...(link ? { link } : {}) },
  });
}

/**
 * Foto-Post auf FB-Page (ein Bild).
 */
export async function publishFacebookPhotoPost(pageId: string, pageToken: string, imageUrl: string, caption: string): Promise<{ id: string; post_id: string }> {
  return graphFetch(`/${pageId}/photos`, {
    method: 'POST',
    token: pageToken,
    body: { url: imageUrl, caption, published: true },
  });
}

/**
 * Mehrere Fotos in einem Post (Album) auf FB-Page.
 */
export async function publishFacebookMultiPhotoPost(pageId: string, pageToken: string, imageUrls: string[], caption: string): Promise<{ id: string }> {
  // Schritt 1: Einzelbilder unpublished hochladen
  const mediaIds = await Promise.all(
    imageUrls.map((url) =>
      graphFetch<{ id: string }>(`/${pageId}/photos`, {
        method: 'POST',
        token: pageToken,
        body: { url, published: false },
      })
    )
  );

  // Schritt 2: Feed-Post mit attached_media
  return graphFetch(`/${pageId}/feed`, {
    method: 'POST',
    token: pageToken,
    body: {
      message: caption,
      attached_media: mediaIds.map((m) => ({ media_fbid: m.id })),
    },
  });
}

// ──────────────────────────────────────────────────────────────────────────
// Instagram Publishing
// ──────────────────────────────────────────────────────────────────────────

/**
 * Erstellt einen IG-Media-Container (Single Image). Zwei-Stufen-Publishing:
 * 1) Container erstellen → creationId
 * 2) Container veröffentlichen
 */
export async function createInstagramImageContainer(igAccountId: string, pageToken: string, imageUrl: string, caption: string): Promise<{ id: string }> {
  return graphFetch(`/${igAccountId}/media`, {
    method: 'POST',
    token: pageToken,
    body: { image_url: imageUrl, caption },
  });
}

/**
 * Erstellt Carousel-Container (2-10 Bilder).
 */
export async function createInstagramCarouselContainer(igAccountId: string, pageToken: string, imageUrls: string[], caption: string): Promise<{ id: string }> {
  if (imageUrls.length < 2 || imageUrls.length > 10) {
    throw new Error('Carousel benötigt 2-10 Bilder');
  }

  // Einzel-Container für jedes Bild (is_carousel_item: true)
  const childIds = await Promise.all(
    imageUrls.map((url) =>
      graphFetch<{ id: string }>(`/${igAccountId}/media`, {
        method: 'POST',
        token: pageToken,
        body: { image_url: url, is_carousel_item: true },
      })
    )
  );

  // Carousel-Container mit Kind-IDs
  return graphFetch(`/${igAccountId}/media`, {
    method: 'POST',
    token: pageToken,
    body: {
      media_type: 'CAROUSEL',
      children: childIds.map((c) => c.id).join(','),
      caption,
    },
  });
}

/**
 * Veröffentlicht einen vorher erstellten Container.
 */
export async function publishInstagramContainer(igAccountId: string, pageToken: string, creationId: string): Promise<{ id: string }> {
  return graphFetch(`/${igAccountId}/media_publish`, {
    method: 'POST',
    token: pageToken,
    body: { creation_id: creationId },
  });
}

/**
 * Wartet bis der Container-Status READY ist (max 30 Sekunden).
 */
export async function waitForInstagramContainer(creationId: string, pageToken: string, maxWaitMs = 30000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const res = await graphFetch<{ status_code: string }>(`/${creationId}`, {
      token: pageToken,
      query: { fields: 'status_code' },
    });
    if (res.status_code === 'FINISHED') return;
    if (res.status_code === 'ERROR' || res.status_code === 'EXPIRED') {
      throw new Error(`Container-Status: ${res.status_code}`);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error('Timeout beim Warten auf IG-Container');
}

/**
 * Ein-Stufen-Helper: Container erstellen, warten, veröffentlichen.
 */
export async function publishInstagramImage(igAccountId: string, pageToken: string, imageUrl: string, caption: string): Promise<{ id: string }> {
  const container = await createInstagramImageContainer(igAccountId, pageToken, imageUrl, caption);
  await waitForInstagramContainer(container.id, pageToken);
  return publishInstagramContainer(igAccountId, pageToken, container.id);
}

export async function publishInstagramCarousel(igAccountId: string, pageToken: string, imageUrls: string[], caption: string): Promise<{ id: string }> {
  const container = await createInstagramCarouselContainer(igAccountId, pageToken, imageUrls, caption);
  await waitForInstagramContainer(container.id, pageToken);
  return publishInstagramContainer(igAccountId, pageToken, container.id);
}

// ──────────────────────────────────────────────────────────────────────────
// Insights (Reach, Likes, Kommentare)
// ──────────────────────────────────────────────────────────────────────────

export interface PostInsights {
  reach: number;
  impressions: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  clicks: number;
}

export async function getFacebookPostInsights(postId: string, pageToken: string): Promise<PostInsights> {
  // post_impressions, post_impressions_unique, post_clicks sind auf Page-Posts verfügbar
  const metrics = ['post_impressions', 'post_impressions_unique', 'post_clicks', 'post_reactions_by_type_total'];
  const res = await graphFetch<{ data: Array<{ name: string; values: Array<{ value: unknown }> }> }>(`/${postId}/insights`, {
    token: pageToken,
    query: { metric: metrics.join(',') },
  });

  const get = (name: string): number => {
    const m = res.data.find((d) => d.name === name);
    const v = m?.values?.[0]?.value;
    return typeof v === 'number' ? v : 0;
  };

  const reactions = res.data.find((d) => d.name === 'post_reactions_by_type_total')?.values?.[0]?.value as Record<string, number> | undefined;
  const likes = reactions ? Object.values(reactions).reduce((sum, n) => sum + (typeof n === 'number' ? n : 0), 0) : 0;

  return {
    reach: get('post_impressions_unique'),
    impressions: get('post_impressions'),
    likes,
    comments: 0, // Kommentare via comments-Endpoint holen
    shares: 0,
    saves: 0,
    clicks: get('post_clicks'),
  };
}

export async function getInstagramPostInsights(mediaId: string, pageToken: string): Promise<PostInsights> {
  const res = await graphFetch<{ data: Array<{ name: string; values: Array<{ value: number }> }> }>(`/${mediaId}/insights`, {
    token: pageToken,
    query: { metric: 'reach,likes,comments,shares,saved,total_interactions' },
  });

  const get = (name: string): number => {
    const m = res.data.find((d) => d.name === name);
    return m?.values?.[0]?.value ?? 0;
  };

  return {
    reach: get('reach'),
    impressions: get('reach'),
    likes: get('likes'),
    comments: get('comments'),
    shares: get('shares'),
    saves: get('saved'),
    clicks: 0,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Post löschen
// ──────────────────────────────────────────────────────────────────────────

export async function deleteFacebookPost(postId: string, pageToken: string): Promise<void> {
  await graphFetch(`/${postId}`, { method: 'DELETE', token: pageToken });
}

export async function deleteInstagramPost(mediaId: string, pageToken: string): Promise<void> {
  await graphFetch(`/${mediaId}`, { method: 'DELETE', token: pageToken });
}

// ──────────────────────────────────────────────────────────────────────────
// OAuth-Redirect-URL helpers
// ──────────────────────────────────────────────────────────────────────────

export function buildFacebookLoginUrl(redirectUri: string, state: string): string {
  const url = new URL('https://www.facebook.com/v21.0/dialog/oauth');
  url.searchParams.set('client_id', process.env.META_APP_ID ?? '');
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('state', state);
  // Scopes für den klassischen Facebook-Login-Flow.
  // Die `instagram_business_*`-Varianten funktionieren NUR über Instagram-Login
  // (graph.instagram.com), NICHT über www.facebook.com OAuth — daher hier die
  // klassischen Namen. Voraussetzung: Im Meta-Dashboard muss der IG-Use-Case
  // auf "API setup with Facebook login" eingestellt sein.
  url.searchParams.set(
    'scope',
    [
      'pages_show_list',
      'pages_read_engagement',
      'pages_manage_posts',
      'instagram_basic',
      'instagram_content_publish',
      'instagram_manage_insights',
      'business_management',
    ].join(',')
  );
  return url.toString();
}

export async function exchangeCodeForToken(code: string, redirectUri: string): Promise<{ access_token: string; expires_in?: number }> {
  return graphFetch('/oauth/access_token', {
    query: {
      client_id: process.env.META_APP_ID,
      client_secret: process.env.META_APP_SECRET,
      redirect_uri: redirectUri,
      code,
    },
  });
}
