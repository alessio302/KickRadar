import * as cheerio from 'cheerio';

// Parses a Google News XML sitemap (<urlset>/<url>/<news:news>), used for
// sources whose RSS feeds turned out to be unreliable or too broad (Sky
// Sports' feed pulled golf/rugby/darts/F1 -- its football-only news
// sitemap is a cleaner source of "recent football articles" than guessing
// at RSS feed IDs).
export function createSitemapNewsSource({ sourceKey, sitemapUrlEnvVar, defaultSitemapUrl }) {
  return {
    sourceKey,
    async fetchLatest() {
      const url = process.env[sitemapUrlEnvVar] || defaultSitemapUrl;
      const res = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          Accept: 'application/xml, text/xml, */*',
        },
      });
      if (!res.ok) {
        throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
      }
      const xml = await res.text();
      const $ = cheerio.load(xml, { xmlMode: true });

      const items = [];
      $('url').each((_, el) => {
        const $el = $(el);
        const link = $el.find('loc').first().text().trim();
        const title = $el.find('news\\:title, title').first().text().trim();
        const pubDate = $el.find('news\\:publication_date, publication_date').first().text().trim();
        if (title && link) {
          items.push({
            title,
            link,
            guid: link,
            publishedAt: pubDate || new Date().toISOString(),
            summary: title,
          });
        }
      });
      return items;
    },
  };
}
