// Fallback thumbnail resolver: used when an RSS item's own feed entry
// carries no usable image (rssSource.js's extractImage() found nothing, or
// only found a tracking pixel -- confirmed live, marca-general's inline
// <img> picked up an imrworldwide.com ad pixel instead of a real photo).
// Fetches the article's own page and reads its og:image meta tag, the same
// thing a chat app/social-media unfurl would show for that link -- every
// outlet observed so far (Bundesliga.com, kicker, BBC, Guardian) sets one
// even when their RSS feed's own <item> doesn't carry an image field.
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const META_PATTERNS = [
  /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i,
  /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["']/i,
  /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
  /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i,
];

export async function fetchOgImage(articleUrl, { timeoutMs = 6000 } = {}) {
  if (!articleUrl) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(articleUrl, {
      headers: { 'User-Agent': BROWSER_UA, Accept: 'text/html,application/xhtml+xml' },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    // og:image sits in <head> HTML-order-wise, but that's no guarantee it's
    // early in the raw response -- confirmed live (2026-09-19, user-reported
    // unreliable Bundesliga News images): bundesliga.com's own pages now
    // front-load ~180KB of inline scripts/hydration data before their own
    // og:image meta tag, well past the original 60000-char cap here, so
    // this returned null on literally every bundesliga-com article despite
    // the tag being present and this file's own regexes matching it fine in
    // isolation (confirmed via diagnoseBundesligaImages.js). Raised with
    // real headroom above that observed ~183000-char offset -- still well
    // under a full page (850KB+ for these specific pages) to keep this
    // bounded, since it runs inline in the scrape loop once per genuinely
    // new+relevant article, not per feed item.
    const reader = res.body?.getReader();
    if (!reader) return null;
    let html = '';
    const decoder = new TextDecoder();
    while (html.length < 400000) {
      const { done, value } = await reader.read();
      if (done) break;
      html += decoder.decode(value, { stream: true });
    }
    reader.cancel().catch(() => {});
    for (const pattern of META_PATTERNS) {
      const match = pattern.exec(html);
      if (match?.[1]) return match[1];
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
