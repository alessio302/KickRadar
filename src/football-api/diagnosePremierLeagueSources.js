// Read-only: for candidate Premier League highlight channels, checks whether
// their most recent uploads are embeddable (oEmbed: 200 = yes, 401 = the owner
// disabled embedding, 403/other = unclear). The current source, Sky Sport
// Premier League (UC_VsQmcsFWUhGn3DTwiO8bg), had 49 of 49 stored clips return
// 401 on 2026-10-15, so this looks for a replacement feed that plays inside
// the app. Runs in GitHub Actions because the agent sandbox has no outbound
// route to youtube.com.
const CANDIDATES = [
  { name: 'current: Sky Sport Premier League (DE)', channelId: 'UC_VsQmcsFWUhGn3DTwiO8bg' },
  { name: 'Premier League official', channelId: 'UCG5qGWdu8nIRZqJ_GgDwQ-w' },
  { name: 'Sky Sports Premier League (UK)', channelId: 'UCNAf1k0yIjyGu3k9BwAg3lg' },
];
const ENTRIES_PER_CHANNEL = 15;
const DELAY_MS = 300;
const REQUEST_TIMEOUT_MS = 15_000;
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchFeedEntries(channelId) {
  const res = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`feed ${channelId} returned ${res.status}`);
  const xml = await res.text();
  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)]
    .map((m) => m[1])
    .map((entry) => ({
      videoId: entry.match(/<yt:videoId>(.*?)<\/yt:videoId>/)?.[1] ?? null,
      title: entry.match(/<title>(.*?)<\/title>/)?.[1] ?? null,
      published: entry.match(/<published>(.*?)<\/published>/)?.[1] ?? null,
    }))
    .filter((e) => e.videoId && e.title)
    .slice(0, ENTRIES_PER_CHANNEL);
}

async function checkEmbeddable(videoId) {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
      { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }
    );
    return res.status === 200 ? 'EMBEDDABLE' : res.status === 401 ? 'EMBED_DISABLED' : `HTTP_${res.status}`;
  } catch (err) {
    return `ERROR: ${err.message}`;
  }
}

async function main() {
  const summary = [];
  for (const candidate of CANDIDATES) {
    let entries;
    try {
      entries = await fetchFeedEntries(candidate.channelId);
    } catch (err) {
      console.log(`${candidate.name}: feed failed -- ${err.message}`);
      summary.push({ name: candidate.name, feed: 'failed' });
      continue;
    }
    console.log(`=== ${candidate.name} (${candidate.channelId}) -- ${entries.length} recent entries ===`);
    const counts = {};
    for (const e of entries) {
      const verdict = await checkEmbeddable(e.videoId);
      counts[verdict] = (counts[verdict] ?? 0) + 1;
      console.log(JSON.stringify({ verdict, published: e.published, videoId: e.videoId, title: e.title }));
      await sleep(DELAY_MS);
    }
    summary.push({ name: candidate.name, channelId: candidate.channelId, counts });
  }
  console.log('--- summary ---');
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error('Premier League source diagnostic failed:', err);
  process.exitCode = 1;
});
