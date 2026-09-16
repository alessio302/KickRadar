// Diagnostic: checks reachability + parseability of the general-news RSS
// candidates proposed for a new News tab (distinct from the existing
// Transfers pipeline's sources -- tuttomercatoweb/kicker/marca/skysports/
// footmercato/fichajes, see runNewsScraper.js -- these are broader
// match-report/news feeds, not transfer-only).
//
// Run via the diagnose-general-news-feeds.yml action (workflow_dispatch).
// No secrets needed -- every candidate below is a public feed.

import Parser from 'rss-parser';

const parser = new Parser({
  headers: {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    Accept: 'application/rss+xml, application/xml, text/xml, */*',
    'Accept-Language': 'en-US,en;q=0.9,de;q=0.8,it;q=0.7',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-Dest': 'document',
    'Upgrade-Insecure-Requests': '1',
  },
});

const CANDIDATES = [
  { league: 'Bundesliga', name: 'Bundesliga.com (official, EN)', url: 'https://www.bundesliga.com/en/rss/news' },
  { league: 'Bundesliga', name: 'Bundesliga.com (official, EN, alt path)', url: 'https://www.bundesliga.com/en/rss/en/rss-news.rss' },
  { league: 'Bundesliga', name: 'kicker aktuell (all football)', url: 'https://newsfeed.kicker.de/news/aktuell' },
  { league: 'Bundesliga', name: 'Sportschau Fussball', url: 'https://www.sportschau.de/fussball/index~rss2.xml' },
  { league: 'Premier League', name: 'BBC Sport Football', url: 'https://feeds.bbci.co.uk/sport/football/rss.xml' },
  { league: 'Premier League', name: 'The Guardian Football', url: 'https://www.theguardian.com/football/rss' },
  { league: 'Premier League', name: 'ESPN Soccer', url: 'https://www.espn.com/espn/rss/soccer/news' },
  { league: 'Premier League', name: 'Sky Sports football news sitemap (already used unfiltered by skysports.js for Transfers)', url: 'https://www.skysports.com/sitemap_news_football.xml' },
  { league: 'Serie A', name: 'Tuttomercatoweb (plain homepage, unfiltered)', url: 'https://www.tuttomercatoweb.com/rss/' },
  { league: 'Serie A', name: 'Calciomercato (Footballco, guess 2: /rss/news)', url: 'https://www.calciomercato.com/rss/news' },
  { league: 'Serie A', name: 'Calciomercato (Footballco, guess 3: feeds.footballco.com)', url: 'https://feeds.footballco.com/calciomercato/it/rss' },
  { league: 'Serie A', name: 'Gazzetta dello Sport (Calcio)', url: 'https://www.gazzetta.it/rss/calcio.xml' },
  { league: 'Serie A', name: 'Sky Sport IT (Calcio)', url: 'https://sport.sky.it/rss/calcio.xml' },
  { league: 'La Liga', name: 'Marca (general football, unfiltered)', url: 'https://e00-marca.uecdn.es/rss/futbol.xml' },
  { league: 'La Liga', name: 'LaLiga.com official (expected to fail: HTML not XML per prior research)', url: 'https://www.laliga.com/en-ES/news?format=feed&type=rss' },
  { league: 'Ligue 1', name: "L'Équipe (Football)", url: 'https://www.lequipe.fr/rss/actu_rss_Football.xml' },
  { league: 'Ligue 1', name: 'Foot Mercato general news (footmercato.js only scrapes the Ligue 1 transfers sub-page today)', url: 'https://www.footmercato.net/rss' },
  { league: 'Ligue 1', name: 'RMC Sport football', url: 'https://rmcsport.bfmtv.com/rss/football/' },
  { league: 'Ligue 1', name: 'Eurosport France football', url: 'https://www.eurosport.fr/rss.xml' },
  { league: 'Cross-league', name: 'Transfermarkt.com news', url: 'https://www.transfermarkt.com/rss/news' },
  { league: 'Cross-league', name: 'Transfermarkt.de Neuigkeiten', url: 'https://www.transfermarkt.de/rss/news' },
];

async function checkFeed(candidate) {
  const start = Date.now();
  try {
    const feed = await parser.parseURL(candidate.url);
    const ms = Date.now() - start;
    const first = feed.items[0];
    return {
      ...candidate,
      ok: true,
      ms,
      itemCount: feed.items.length,
      hasFullText: Boolean(first?.['content:encoded'] && first['content:encoded'].length > (first.contentSnippet?.length || 0) + 200),
      hasImage: Boolean(first?.enclosure || first?.['media:content'] || /<img/.test(first?.content || '')),
      sampleTitle: first?.title?.trim() || null,
      samplePubDate: first?.isoDate || first?.pubDate || null,
    };
  } catch (err) {
    const ms = Date.now() - start;
    return { ...candidate, ok: false, ms, error: err.message };
  }
}

async function main() {
  const results = [];
  for (const candidate of CANDIDATES) {
    console.log(`\nChecking [${candidate.league}] ${candidate.name}\n  ${candidate.url}`);
    const result = await checkFeed(candidate);
    results.push(result);
    if (result.ok) {
      console.log(
        `  OK  ${result.ms}ms  items=${result.itemCount}  fullText=${result.hasFullText}  image=${result.hasImage}`
      );
      console.log(`  sample: "${result.sampleTitle}" (${result.samplePubDate})`);
    } else {
      console.log(`  FAIL  ${result.ms}ms  ${result.error}`);
    }
  }

  console.log('\n\n=== Summary ===');
  console.table(
    results.map((r) => ({
      league: r.league,
      source: r.name,
      status: r.ok ? 'OK' : 'FAIL',
      items: r.ok ? r.itemCount : '-',
      fullText: r.ok ? r.hasFullText : '-',
      image: r.ok ? r.hasImage : '-',
      error: r.ok ? '' : r.error,
    }))
  );

  const failed = results.filter((r) => !r.ok);
  if (failed.length > 0) {
    console.log(`\n${failed.length}/${results.length} candidate feeds failed from this runner.`);
  }
}

main().catch((err) => {
  console.error('Diagnose run failed:', err);
  process.exitCode = 1;
});
