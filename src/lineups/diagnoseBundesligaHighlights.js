// Temporary diagnostic: check reachability + real shape of the Bundesliga
// YouTube playlist's public RSS/Atom feed, same check already done for
// Serie A (diagnoseYoutubeHighlights.js) before this content was folded
// into the real implementation. bundesliga.com's own match-highlights page
// was tried first but confirmed live to render its player entirely
// client-side (no og:video, no __NEXT_DATA__, no video/mp4/m3u8 reference
// anywhere in the raw HTML) -- too fragile for a cron job without a
// headless browser, so back to the YouTube-playlist approach that already
// works for Serie A.
const PLAYLIST_ID = 'PLVLmrIcWyTjY';
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

  const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((m) => m[1]);
  console.log('entry count:', entries.length);

  const parsed = entries.slice(0, 10).map((entry) => {
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
