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
    // og:image is always in <head>, well within the first chunk of most
    // real article pages -- capping how much HTML we read (rather than
    // buffering a whole page, some of which run 200KB+) keeps this cheap
    // per-article even though it now runs inline in the scrape loop.
    const reader = res.body?.getReader();
    if (!reader) return null;
    let html = '';
    const decoder = new TextDecoder();
    while (html.length < 60000) {
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
