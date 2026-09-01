// Temporary diagnostic: check reachability + real shape of a YouTube
// playlist's public RSS/Atom feed (no API key, no quota) before building
// the real sync on top of it. Testing against Serie A's own official
// "English Highlights | Serie A 2026/27" playlist first, per the user's
// own request, before rolling this out to the other 4 leagues.
const PLAYLIST_ID = 'PLcv0mBdEYNdk';
const FEED_URL = `https://www.youtube.com/feeds/videos.xml?playlist_id=${PLAYLIST_ID}`;

async function main() {
  const res = await fetch(FEED_URL, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    },
  });
  console.log('status:', res.status);
  const xml = await res.text();
  console.log('length:', xml.length);

  const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((m) => m[1]);
  console.log('entry count:', entries.length);

  const parsed = entries.slice(0, 8).map((entry) => {
    const videoId = entry.match(/<yt:videoId>(.*?)<\/yt:videoId>/)?.[1];
    const title = entry.match(/<title>(.*?)<\/title>/)?.[1];
    const published = entry.match(/<published>(.*?)<\/published>/)?.[1];
    return { videoId, title, published };
  });
  console.log(JSON.stringify(parsed, null, 2));
}

main().catch((err) => {
  console.error('Diagnostic failed:', err);
  process.exitCode = 1;
});
