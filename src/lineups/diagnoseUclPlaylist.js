// One-off: the user's linked playlist belongs to "Prime Video Sport
// Deutschland" (channelId UCK2izXoHvraUFaPMU5B7vMQ) and is embeddable, but
// that specific playlist is stale (2025/26 season). Check the CHANNEL's
// own current uploads feed directly for 2026/27 content instead.
const res = await fetch('https://www.youtube.com/feeds/videos.xml?channel_id=UCK2izXoHvraUFaPMU5B7vMQ', {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  },
});
console.log('status:', res.status);
const xml = await res.text();
const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((m) => m[1]);
console.log(`entry count: ${entries.length}`);
const videoIds = [];
for (const entry of entries) {
  const title = entry.match(/<title>(.*?)<\/title>/)?.[1] ?? null;
  const published = entry.match(/<published>(.*?)<\/published>/)?.[1] ?? null;
  const videoId = entry.match(/<yt:videoId>(.*?)<\/yt:videoId>/)?.[1] ?? null;
  console.log(JSON.stringify({ published, title, videoId }));
  if (videoId) videoIds.push(videoId);
}

console.log('--- embeddability check (first 6) ---');
for (const id of videoIds.slice(0, 6)) {
  const r = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`);
  console.log(`${id}: ${r.status}${r.ok ? ' (embeddable)' : ' (NOT embeddable)'}`);
}
