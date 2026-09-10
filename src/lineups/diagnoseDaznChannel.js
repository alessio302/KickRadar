// One-off: re-check the DAZN UEFA Champions League YouTube channel
// (channel_id UCB-GdMjyokO9lZkKU_oIK6g, resolved via WebSearch) -- the
// user's own originally-suggested source, which a prior subagent run
// rejected as stale (checked via a DIFFERENT/unverified channel_id
// resolution). Re-verifying against the correct id before trusting either
// claim. Also printing <published> dates so staleness is checked from real
// data, not guessed.
const channelId = process.env.CHANNEL_ID || 'UCB-GdMjyokO9lZkKU_oIK6g';
const res = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`, {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  },
});
console.log('status:', res.status);
const xml = await res.text();
const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((m) => m[1]);
console.log(`entry count: ${entries.length}`);
for (const entry of entries.slice(0, 15)) {
  const title = entry.match(/<title>(.*?)<\/title>/)?.[1] ?? null;
  const published = entry.match(/<published>(.*?)<\/published>/)?.[1] ?? null;
  const videoId = entry.match(/<yt:videoId>(.*?)<\/yt:videoId>/)?.[1] ?? null;
  console.log(JSON.stringify({ published, title, videoId }));
}
