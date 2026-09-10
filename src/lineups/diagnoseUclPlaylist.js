// One-off: check TNT Sports Football's own channel feed directly
// (channel_id UC4i_9WvfPRTuRWEaWyfKuFw, resolved via WebSearch) -- is it
// current for UCL matchday 1, and does it stay UCL-only or get diluted by
// other sports TNT Sports covers (rugby, UFC, etc, per their own site)?
const res = await fetch('https://www.youtube.com/feeds/videos.xml?channel_id=UC4i_9WvfPRTuRWEaWyfKuFw', {
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

console.log('--- embeddability check (first 5) ---');
for (const id of videoIds.slice(0, 5)) {
  const r = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`);
  console.log(`${id}: ${r.status}${r.ok ? ' (embeddable)' : ' (NOT embeddable)'}`);
}
