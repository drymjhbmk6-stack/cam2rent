// ════════════════════════════════════════════════════════════════════════
// Bot-Erkennung anhand des User-Agent
// ════════════════════════════════════════════════════════════════════════
//
// Reine Server-Heuristik fuer die Blog-Aufruf-Statistik: trennt automatisierte
// Aufrufe (Suchmaschinen-Crawler, KI-Crawler, Social-Vorschau-Bots, Monitoring,
// Skripte) von echten Browser-Besuchen. Bewusst konservativ — im Zweifel als
// Bot werten, damit die "Mensch"-Zahl moeglichst sauber bleibt.

// Bekannte Crawler/KI-Bots/Vorschau-Bots/Monitoring/Skript-Clients.
const BOT_UA_RE =
  /bot\b|bot\/|crawl|spider|slurp|mediapartners|bingpreview|facebookexternalhit|facebookcatalog|embedly|quora|pinterest|vkshare|w3c_validator|validator|baidu|yandex|sogou|exabot|ia_archiver|archive\.org|gptbot|chatgpt|oai-searchbot|openai|claudebot|claude-web|anthropic|perplexity|youbot|ccbot|google-extended|googleother|google-inspectiontool|apis-google|feedfetcher|applebot|amazonbot|bytespider|petalbot|dataforseo|semrush|ahrefs|mj12|dotbot|seznam|bublupreview|whatsapp|telegram|discord|slackbot|slack-imgproxy|twitterbot|linkedinbot|skypeuripreview|redditbot|flipboard|nuzzel|tumblr|headlesschrome|phantomjs|puppeteer|playwright|selenium|python-requests|python-urllib|curl\/|wget\/|libwww|httpclient|http_request|go-http|okhttp|java\/|axios\/|node-fetch|got\s|guzzle|scrapy|monitor|uptime|pingdom|statuscake|site24x7|newrelic|datadog|lighthouse|gtmetrix|pagespeed|chrome-lighthouse|prerender/i;

/**
 * Liefert true, wenn der User-Agent zu einem Bot/Crawler/Skript gehoert.
 * Ein fehlender User-Agent zaehlt als Bot — echte Browser senden immer einen.
 */
export function isBotUserAgent(ua: string | null | undefined): boolean {
  if (!ua || ua.trim() === '') return true;
  return BOT_UA_RE.test(ua);
}
