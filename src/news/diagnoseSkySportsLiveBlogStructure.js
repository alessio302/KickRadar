const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const LIVE_BLOG_URL =
  'https://www.skysports.com/football/live-blog/11661/12476234/transfer-centre-live-football-transfer-news-updates-and-rumours';
const SITEMAP_URL = 'https://www.skysports.com/sitemap_news_football.xml';

function snippetAround(text, pattern, radius = 300) {
  const idx = text.search(pattern);
  if (idx === -1) return null;
  return text.slice(Math.max(0, idx - radius), idx + radius);
}

async function main() {
  // --- Sitemap: does it currently carry a Hutchinson/AC Milan/Forest entry
  // as a standalone article URL? ---
  const sitemapRes = await fetch(SITEMAP_URL, {
    headers: { 'User-Agent': UA, Accept: 'application/xml, text/xml, */*' },
  });
  const sitemapXml = await sitemapRes.text();
  const urlBlocks = sitemapXml.match(/<url>[\s\S]*?<\/url>/g) || [];
  console.log(`Sitemap: ${urlBlocks.length} total <url> entries`);
  const matches = urlBlocks.filter((b) => /hutchinson|forest|milan/i.test(b));
  console.log(`Entries mentioning hutchinson/forest/milan: ${matches.length}`);
  for (const m of matches) {
    const loc = m.match(/<loc>(.*?)<\/loc>/)?.[1];
    const title = m.match(/<news:title>(.*?)<\/news:title>/)?.[1];
    console.log(' -', title, '|', loc);
  }
  console.log('First 8 sitemap entries as a sample:');
  for (const b of urlBlocks.slice(0, 8)) {
    const loc = b.match(/<loc>(.*?)<\/loc>/)?.[1];
    const title = b.match(/<news:title>(.*?)<\/news:title>/)?.[1];
    console.log(' -', title, '|', loc);
  }

  // --- Live blog page: is it server-rendered with the Hutchinson text
  // present in the raw HTML? What mechanism serves individual entries? ---
  const blogRes = await fetch(LIVE_BLOG_URL, { headers: { 'User-Agent': UA } });
  console.log('\nLive blog fetch status:', blogRes.status);
  const html = await blogRes.text();
  console.log('Live blog HTML length:', html.length);
  console.log('Contains "Hutchinson" in raw HTML:', html.includes('Hutchinson'));

  for (const pattern of [/__NEXT_DATA__/, /liveBlogId/i, /blogPostId/i, /data-post-id/i, /\/api\/[^"']*live/i, /publishedTimestamp/i]) {
    const snip = snippetAround(html, pattern);
    console.log(`\nPattern ${pattern}:`, snip ? 'FOUND' : 'not found');
    if (snip) console.log(snip);
  }
}

main().catch((err) => {
  console.error('Diagnostic failed:', err);
  process.exitCode = 1;
});
