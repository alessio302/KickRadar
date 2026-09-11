// Temporary diagnostic (removed after use): syncEuropeanHighlights.js's
// hardcoded Prime Video Deutschland channel_id (UCK2izXoHvraUFaPMU5B7vMQ)
// started 404ing on its RSS feed (confirmed live via the scheduled sync's
// own job logs, 2026-09-11) -- the @primevideosportde handle itself still
// resolves fine per a web search, so either the channel_id changed or was
// wrong to begin with. Fetches the channel's own page HTML (this sandbox
// can't reach youtube.com directly, hence the GitHub Actions runner) and
// extracts whatever real channelId it finds, plus re-checks the old id's
// feed for comparison.
async function main() {
  const res = await fetch('https://www.youtube.com/@primevideosportde', {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
  });
  console.log('Channel page status:', res.status);
  const html = await res.text();
  const idMatches = [...new Set([...html.matchAll(/"channelId":"(UC[\w-]{22})"/g)].map((m) => m[1]))];
  const canonicalMatch = html.match(/<link rel="canonical" href="([^"]+)"/);
  console.log('Found channelId occurrences:', idMatches);
  console.log('Canonical link:', canonicalMatch?.[1]);

  const oldId = 'UCK2izXoHvraUFaPMU5B7vMQ';
  const oldFeedRes = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${oldId}`);
  console.log('Old channel_id feed status:', oldFeedRes.status, oldFeedRes.statusText);
  if (oldFeedRes.ok) {
    const xml = await oldFeedRes.text();
    const titles = [...xml.matchAll(/<title>([^<]+)<\/title>/g)].map((m) => m[1]);
    console.log('Old channel_id feed titles:', JSON.stringify(titles, null, 2));
    const published = [...xml.matchAll(/<published>([^<]+)<\/published>/g)].map((m) => m[1]);
    console.log('Old channel_id feed published dates:', JSON.stringify(published));
  }

  for (const id of idMatches) {
    const feedRes = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${id}`);
    console.log(`Candidate ${id} feed status:`, feedRes.status);
    if (feedRes.ok) {
      const xml = await feedRes.text();
      const titles = [...xml.matchAll(/<title>([^<]+)<\/title>/g)].map((m) => m[1]).slice(0, 6);
      console.log(`  first titles:`, JSON.stringify(titles));
    }
  }
}

main().catch((err) => {
  console.error('Diagnostic failed:', err);
  process.exitCode = 1;
});
