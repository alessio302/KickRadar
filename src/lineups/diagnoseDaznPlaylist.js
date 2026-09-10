// One-off: verify the DAZN "1. Spieltag" UCL playlist the user pointed to
// (list=PLWfYkOV-XnPA) actually holds the matchday's full set of highlight
// videos via the public playlist RSS feed, before wiring it into
// syncEuropeanHighlights.js as a second source alongside the channel feed.
const playlistId = process.env.PLAYLIST_ID || 'PLWfYkOV-XnPA';
const res = await fetch(`https://www.youtube.com/feeds/videos.xml?playlist_id=${playlistId}`, {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  },
});
console.log('status:', res.status);
const xml = await res.text();
const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((m) => m[1]);
console.log(`entry count: ${entries.length}`);
for (const entry of entries) {
  const title = entry.match(/<title>(.*?)<\/title>/)?.[1] ?? null;
  const published = entry.match(/<published>(.*?)<\/published>/)?.[1] ?? null;
  const videoId = entry.match(/<yt:videoId>(.*?)<\/yt:videoId>/)?.[1] ?? null;
  console.log(JSON.stringify({ published, title, videoId }));
}
