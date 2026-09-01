// Temporary diagnostic: check reachability + real shape of the Premier
// League YouTube playlist the user found, same check already done for
// Serie A and Bundesliga before being folded into the real implementation.
// The user's own concern: Premier League highlights are usually split
// across each club's own channel rather than one central league channel,
// so this specifically checks whether this playlist actually covers every
// club's matches or just a subset.
// Playlist feed title came back "2. Spieltag | 2026/27" -- same
// per-matchday smell as the Bundesliga playlist that turned out to go
// stale after one round. Checking two candidate CHANNEL ids instead, since
// the feed's own <author><name> was "Sky Sport Premier League" (German
// branding, singular "Sport") -- distinct from the UK "Sky Sports Premier
// League" channel that a plain web search also surfaces.
const PLAYLIST_ID = 'PLObHa0NzkUKI';
const CHANNEL_CANDIDATES = {
  'Sky Sport Premier League (DE, singular "Sport")': 'UC_VsQmcsFWUhGn3DTwiO8bg',
  'Sky Sports Premier League (UK, plural "Sports")': 'UCNAf1k0yIjyGu3k9BwAg3lg',
};

async function fetchFeed(label, feedUrl) {
  console.log(`\n=== ${label}: ${feedUrl} ===`);
  const res = await fetch(feedUrl, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    },
  });
  console.log('status:', res.status);
  const xml = await res.text();
  console.log('length:', xml.length);

  const titleMatch = xml.match(/<title>(.*?)<\/title>/);
  console.log('feed title:', titleMatch?.[1]);
  const authorMatch = xml.match(/<author>\s*<name>(.*?)<\/name>/);
  console.log('feed author:', authorMatch?.[1]);

  const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((m) => m[1]);
  console.log('entry count:', entries.length);

  const parsed = entries.map((entry) => {
    const videoId = entry.match(/<yt:videoId>(.*?)<\/yt:videoId>/)?.[1];
    const title = entry.match(/<title>(.*?)<\/title>/)?.[1];
    const published = entry.match(/<published>(.*?)<\/published>/)?.[1];
    return { videoId, title, published };
  });
  console.log(JSON.stringify(parsed, null, 2));
}

async function main() {
  await fetchFeed('playlist feed', `https://www.youtube.com/feeds/videos.xml?playlist_id=${PLAYLIST_ID}`);
  for (const [label, channelId] of Object.entries(CHANNEL_CANDIDATES)) {
    await fetchFeed(`channel uploads feed: ${label}`, `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`);
  }
}

main().catch((err) => {
  console.error('Diagnostic failed:', err);
  process.exitCode = 1;
});
