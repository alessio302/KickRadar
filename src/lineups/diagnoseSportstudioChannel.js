// Temporary diagnostic (removed after use): user-suggested alternative
// highlights source (ZDF sportstudio fussball,
// https://youtube.com/@sportstudiofussball) since Prime Video Deutschland
// (the current source, see syncEuropeanHighlights.js) hasn't uploaded
// anything since 2026-09-08. Checks: (1) the channel's real channel_id,
// (2) whether its feed actually has recent CL highlight videos with a
// parseable title format, (3) whether those videos are embeddable at all --
// confirmed live earlier this session that DAZN's whole channel blocked
// embedding (9/9 oEmbed calls 401), so this needs checking before
// switching, not assumed from the RSS feed alone.
async function main() {
  const res = await fetch('https://www.youtube.com/@sportstudiofussball', {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
  });
  console.log('Channel page status:', res.status);
  const html = await res.text();
  const canonicalMatch = html.match(/<link rel="canonical" href="([^"]+)"/);
  const channelId = canonicalMatch?.[1]?.match(/channel\/(UC[\w-]{22})/)?.[1];
  console.log('Canonical link:', canonicalMatch?.[1]);
  console.log('Resolved channelId:', channelId);
  if (!channelId) return;

  const feedRes = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`);
  console.log('Feed status:', feedRes.status, feedRes.statusText);
  if (!feedRes.ok) return;
  const xml = await feedRes.text();

  const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((m) => m[1]);
  console.log(`Entry count: ${entries.length}`);
  const parsed = entries.map((entry) => {
    const videoId = entry.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1];
    const title = entry.match(/<title>([^<]+)<\/title>/)?.[1];
    const published = entry.match(/<published>([^<]+)<\/published>/)?.[1];
    return { videoId, title, published };
  });
  console.log('Feed entries:', JSON.stringify(parsed, null, 2));

  // Check embeddability via oEmbed for up to 5 of the most recent entries
  // that look like real match highlights (title contains "Highlights" or
  // similar), not shorts/reaction clips.
  const candidates = parsed.filter((p) => p.videoId).slice(0, 6);
  for (const { videoId, title } of candidates) {
    try {
      const oembedRes = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
      console.log(`oEmbed ${videoId} (${title}): ${oembedRes.status}`);
    } catch (err) {
      console.log(`oEmbed ${videoId} failed:`, err.message);
    }
  }
}

main().catch((err) => {
  console.error('Diagnostic failed:', err);
  process.exitCode = 1;
});
