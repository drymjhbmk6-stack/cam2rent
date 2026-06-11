// ════════════════════════════════════════════════════════════════════════
// Blog-Aufruf-Tracking — Mensch vs. Bot getrennt
// ════════════════════════════════════════════════════════════════════════
//
// Eine gemeinsame Funktion fuer beide Aufruf-Pfade (Server-Component
// app/blog/[slug]/page.tsx + API app/api/blog/posts/[slug]). Zaehlt:
//   - blog_posts.view_count      = Gesamt (Mensch + Bot)  → bleibt wie bisher
//   - blog_posts.bot_view_count  = nur Bots               → Mensch = Differenz
//   - blog_views.is_bot          = pro datiertem Event, fuer die Statistik
//
// Bot-Erkennung ueber den User-Agent (lib/bot-detection.ts). Alles
// fire-and-forget — ein Tracking-Fehler darf die Artikel-Auslieferung nie
// blockieren. Defensiv gegen eine noch nicht ausgefuehrte Migration:
//   - RPC increment_blog_view fehlt → Fallback auf altes view_count-only
//     read-modify-write.
//   - blog_views.is_bot-Spalte fehlt → Insert-Retry ohne is_bot.

import type { createServiceClient } from '@/lib/supabase';
import { isBotUserAgent } from '@/lib/bot-detection';

type ServiceClient = ReturnType<typeof createServiceClient>;

export function trackBlogView(
  supabase: ServiceClient,
  opts: { postId: string; slug: string; userAgent: string | null | undefined; currentViewCount: number },
): void {
  const isBot = isBotUserAgent(opts.userAgent);
  const cleanSlug = (opts.slug ?? '').split('?')[0];

  // Zaehler atomar erhoehen (kein Race) — view_count immer, bot_view_count nur
  // bei Bots. Fallback bei fehlender Migration: altes read-modify-write.
  supabase
    .rpc('increment_blog_view', { p_post_id: opts.postId, p_is_bot: isBot })
    .then(
      ({ error }) => { if (error) fallbackIncrement(supabase, opts.postId, opts.currentViewCount); },
      () => fallbackIncrement(supabase, opts.postId, opts.currentViewCount),
    );

  // Zeitgestempeltes, anonymes Aufruf-Event MIT Bot-Flag. Retry ohne is_bot,
  // falls die Spalte noch fehlt.
  supabase
    .from('blog_views')
    .insert({ post_id: opts.postId, slug: cleanSlug, is_bot: isBot })
    .then(
      ({ error }) => { if (error) insertWithoutBotFlag(supabase, opts.postId, cleanSlug); },
      () => insertWithoutBotFlag(supabase, opts.postId, cleanSlug),
    );
}

function fallbackIncrement(supabase: ServiceClient, postId: string, current: number): void {
  supabase
    .from('blog_posts')
    .update({ view_count: current + 1 })
    .eq('id', postId)
    .then(() => {}, () => {});
}

function insertWithoutBotFlag(supabase: ServiceClient, postId: string, slug: string): void {
  supabase
    .from('blog_views')
    .insert({ post_id: postId, slug })
    .then(() => {}, () => {});
}
