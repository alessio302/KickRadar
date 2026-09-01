// Temporary diagnostic: check reachability + real shape of the Premier
// League YouTube playlist the user found, same check already done for
// Serie A and Bundesliga before being folded into the real implementation.
// The user's own concern: Premier League highlights are usually split
// across each club's own channel rather than one central league channel,
// so this specifically checks whether this playlist actually covers every
// club's matches or just a subset.
const PLAYLIST_ID = 'PLObHa0NzkUKI';
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

  const titleMatch = xml.match(/<title>(.*?)<\/title>/);
  console.log('feed title:', titleMatch?.[1]);
  const authorMatch = xml.match(/<author>\s*<name>(.*?)<\/name>/);
  console.log('feed author:', authorMatch?.[1]);

  const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((m) => m[1]);
  console.log('entry count:', entries.length);

  const parsed = entries.map((entry) => {
    const videoId = entry.match(/<yt:videoId>(.*?)<\/yt:videoId>/)?.[1];
    const title = entry.match(/<title>(.*?)<\/title>/)?.[1];
    const author = entry.match(/<name>(.*?)<\/name>/)?.[1];
    const published = entry.match(/<published>(.*?)<\/published>/)?.[1];
    return { videoId, title, author, published };
  });
  console.log(JSON.stringify(parsed, null, 2));
}

main().catch((err) => {
  console.error('Diagnostic failed:', err);
  process.exitCode = 1;
});
