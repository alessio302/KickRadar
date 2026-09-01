// Temporary diagnostic: check the LaLiga YouTube playlist the user found,
// same check already done for Bundesliga and Premier League before being
// folded into the real implementation. The user already flagged this as
// "the 3rd matchday" playlist -- expecting the same per-matchday-id trap,
// so this also resolves and checks that playlist's own channel uploads
// feed directly.
const PLAYLIST_ID = 'PLM5nbEkK80hA';
const FEED_URL = `https://www.youtube.com/feeds/videos.xml?playlist_id=${PLAYLIST_ID}`;

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
};

async function fetchFeed(label, feedUrl) {
  console.log(`\n=== ${label}: ${feedUrl} ===`);
  const res = await fetch(feedUrl, { headers: HEADERS });
  console.log('status:', res.status);
  const xml = await res.text();
  console.log('length:', xml.length);

  const titleMatch = xml.match(/<title>(.*?)<\/title>/);
  console.log('feed title:', titleMatch?.[1]);
  const authorMatch = xml.match(/<author>\s*<name>(.*?)<\/name>/);
  console.log('feed author:', authorMatch?.[1]);
  const channelIdMatch = xml.match(/<yt:channelId>(.*?)<\/yt:channelId>/);
  console.log('feed channelId:', channelIdMatch?.[1]);

  const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((m) => m[1]);
  console.log('entry count:', entries.length);

  const parsed = entries.map((entry) => {
    const videoId = entry.match(/<yt:videoId>(.*?)<\/yt:videoId>/)?.[1];
    const entryChannelId = entry.match(/<yt:channelId>(.*?)<\/yt:channelId>/)?.[1];
    const title = entry.match(/<title>(.*?)<\/title>/)?.[1];
    const published = entry.match(/<published>(.*?)<\/published>/)?.[1];
    return { videoId, entryChannelId, title, published };
  });
  console.log(JSON.stringify(parsed, null, 2));
  const entryChannelIds = [...new Set(parsed.map((p) => p.entryChannelId).filter(Boolean))];
  console.log('distinct per-entry channelIds:', entryChannelIds);
  return { channelId: channelIdMatch?.[1] ?? entryChannelIds[0] };
}

async function main() {
  const { channelId } = await fetchFeed('playlist feed', FEED_URL);
  if (channelId) {
    await fetchFeed('channel uploads feed', `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`);
  } else {
    console.log('\nNo channelId found in playlist feed -- cannot auto-resolve the channel.');
  }
}

main().catch((err) => {
  console.error('Diagnostic failed:', err);
  process.exitCode = 1;
});
