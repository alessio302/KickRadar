import * as cheerio from 'cheerio';

// Shared factory for HTML-scraped sources (no usable RSS -- RMC Sport).
// All selectors are env-overridable for the same reason as rssSource.js:
// the real DOM structure needs to be confirmed with real internet access,
// which this sandbox doesn't have. Defaults are best-effort guesses.
export function createHtmlSource({
  sourceKey,
  listUrlEnvVar,
  defaultListUrl,
  itemSelectorEnvVar,
  defaultItemSelector,
  titleSelectorEnvVar,
  defaultTitleSelector,
  linkSelectorEnvVar,
  defaultLinkSelector,
  baseUrl,
}) {
  return {
    sourceKey,
    async fetchLatest() {
      const listUrl = process.env[listUrlEnvVar] || defaultListUrl;
      const itemSelector = process.env[itemSelectorEnvVar] || defaultItemSelector;
      const titleSelector = process.env[titleSelectorEnvVar] || defaultTitleSelector;
      const linkSelector = process.env[linkSelectorEnvVar] || defaultLinkSelector;

      const res = await fetch(listUrl, {
        headers: {
          // A bot-labeled UA gets blocked by some sites (confirmed on
          // tuttomercatoweb's RSS endpoint), so use a real browser UA here too.
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        },
      });
      if (!res.ok) {
        throw new Error(`Failed to fetch ${listUrl}: ${res.status} ${res.statusText}`);
      }
      const html = await res.text();
      const $ = cheerio.load(html);

      const items = [];
      $(itemSelector).each((_, el) => {
        const titleEl = titleSelector ? $(el).find(titleSelector).first() : $(el);
        const linkEl = linkSelector ? $(el).find(linkSelector).first() : $(el);
        const title = titleEl.text().trim();
        let link = linkEl.attr('href') || $(el).attr('href');
        if (link && !link.startsWith('http')) {
          link = new URL(link, baseUrl).toString();
        }
        if (title && link) {
          items.push({
            title,
            link,
            guid: link,
            publishedAt: new Date().toISOString(), // list pages rarely expose a reliable date; refine per-article if needed
            summary: title,
          });
        }
      });
      return items;
    },
  };
}
