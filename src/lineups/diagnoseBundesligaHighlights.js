// Temporary diagnostic: check reachability + real shape of the Bundesliga
// YouTube playlist's public RSS/Atom feed, same check already done for
// Serie A (diagnoseYoutubeHighlights.js) before this content was folded
// into the real implementation. bundesliga.com's own match-highlights page
// was tried first but confirmed live to render its player entirely
// client-side (no og:video, no __NEXT_DATA__, no video/mp4/m3u8 reference
// anywhere in the raw HTML) -- too fragile for a cron job without a
// headless browser, so back to the YouTube-playlist approach that already
// works for Serie A.
// Playlist title came back "Bundesliga Highlights 1. Spieltag 2026/27" --
// unlike Serie A's continuous season-long playlist, this smells like a
// fresh playlist ZDFsportstudio creates every matchday, which would mean
// the hardcoded id here goes stale after Spieltag 1. Checking the
// CHANNEL's own uploads feed (channel_id, not playlist_id) as a way to
// sidestep that entirely -- if every matchday's highlight clips get
// uploaded to the same channel regardless of which playlist collects
// them, a channel feed never needs a weekly id update.
const PLAYLIST_ID = 'PLVLmrIcWyTjY';
const CHANNEL_ID = 'UClCIWcZNvq15p0Y-E4ToGOw'; // "sportstudio fußball powered by ZDF"

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

  const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((m) => m[1]);
  console.log('entry count:', entries.length);

  const parsed = entries.slice(0, 15).map((entry) => {
    const videoId = entry.match(/<yt:videoId>(.*?)<\/yt:videoId>/)?.[1];
    const title = entry.match(/<title>(.*?)<\/title>/)?.[1];
    const published = entry.match(/<published>(.*?)<\/published>/)?.[1];
    return { videoId, title, published };
  });
  console.log(JSON.stringify(parsed, null, 2));
}

async function main() {
  await fetchFeed('playlist feed', `https://www.youtube.com/feeds/videos.xml?playlist_id=${PLAYLIST_ID}`);
  await fetchFeed('channel uploads feed', `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`);
}

main().catch((err) => {
  console.error('Diagnostic failed:', err);
  process.exitCode = 1;
});
