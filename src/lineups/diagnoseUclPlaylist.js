// One-off: check the playlist the user just linked
// (list=PLOrNuH1xKh2sJ0N7pXjzvbhf5aJb7Vw-C) -- whose channel is it, is it
// current, and are its videos embeddable?
const res = await fetch('https://www.youtube.com/feeds/videos.xml?playlist_id=PLOrNuH1xKh2sJ0N7pXjzvbhf5aJb7Vw-C', {
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
  const author = entry.match(/<name>(.*?)<\/name>/)?.[1] ?? null;
  const channelId = entry.match(/<yt:channelId>(.*?)<\/yt:channelId>/)?.[1] ?? null;
  console.log(JSON.stringify({ published, title, videoId, author, channelId }));
  if (videoId) videoIds.push(videoId);
}

console.log('--- embeddability check ---');
for (const id of videoIds.slice(0, 6)) {
  const r = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`);
  console.log(`${id}: ${r.status}${r.ok ? ' (embeddable)' : ' (NOT embeddable)'}`);
}
