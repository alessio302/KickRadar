// One-off: which YouTube channel/feed is the right official highlights
// source for each of the 3 UEFA club competitions, and what does its real
// <entry><title> format look like? Same question syncHighlights.js's own
// comments document having already answered for the 5 domestic leagues.
// Run via GitHub Actions (youtube.com is EGRESS_BLOCKED from this sandbox)
// -- see diagnose-european-leagues.yml's own history for this pattern.
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  return { ok: res.ok, status: res.status, text: res.ok ? await res.text() : null };
}

async function resolveChannelId(handleUrl) {
  const { ok, status, text } = await fetchText(handleUrl);
  if (!ok) return { error: `${status}` };
  const idMatch =
    text.match(/"channelId":"(UC[\w-]+)"/) ||
    text.match(/"externalId":"(UC[\w-]+)"/) ||
    text.match(/"browseId":"(UC[\w-]+)"/) ||
    text.match(/channel\/(UC[\w-]{10,})/);
  const nameMatch = text.match(/"channelMetadataRenderer":\{"title":"([^"]+)"/);
  const subsMatch = text.match(/"subscriberCountText":\{"simpleText":"([^"]+)"/) || text.match(/"subscriberCountText":\{"accessibility":\{"accessibilityData":\{"label":"([^"]+)"/);
  return { channelId: idMatch?.[1] ?? null, name: nameMatch?.[1] ?? null, subs: subsMatch?.[1] ?? null };
}

async function dumpFeed(label, feedUrl) {
  console.log(`\n=== ${label} ===`);
  console.log(feedUrl);
  const { ok, status, text } = await fetchText(feedUrl);
  if (!ok) {
    console.log(`FEED FETCH FAILED: ${status}`);
    return;
  }
  const entries = [...text.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((m) => m[1]);
  console.log(`entries: ${entries.length}`);
  for (const entry of entries.slice(0, 15)) {
    const title = entry.match(/<title>(.*?)<\/title>/)?.[1];
    const published = entry.match(/<published>(.*?)<\/published>/)?.[1];
    const videoId = entry.match(/<yt:videoId>(.*?)<\/yt:videoId>/)?.[1];
    console.log(`- [${published}] (${videoId}) ${title}`);
  }
}

const CANDIDATES = [
  { label: 'CL: UCL-uefachampionsleague handle', url: 'https://www.youtube.com/@UCL-uefachampionsleague' },
  { label: 'CL: DAZNUEFAChampionsLeague handle (user-suggested baseline)', url: 'https://www.youtube.com/@DAZNUEFAChampionsLeague' },
  { label: 'CL: UEFA main channel', url: 'https://www.youtube.com/user/UEFA' },
  { label: 'EL: UEFAEuropaLeagueUEL handle', url: 'https://www.youtube.com/@UEFAEuropaLeagueUEL' },
  { label: 'UECL: channel UCABKzbH3IJnzFqIgrYTh1kQ', url: 'https://www.youtube.com/channel/UCABKzbH3IJnzFqIgrYTh1kQ' },
];

for (const c of CANDIDATES) {
  console.log(`\n#### Resolving ${c.label} (${c.url}) ####`);
  const info = await resolveChannelId(c.url);
  console.log(JSON.stringify(info));
  if (info.channelId) {
    await dumpFeed(c.label, `https://www.youtube.com/feeds/videos.xml?channel_id=${info.channelId}`);
  }
}

// UECL's channel id is already known directly from the search result URL
// (no handle to resolve) -- dump its feed regardless of whether the page
// regex above found it too.
await dumpFeed('UECL: channel UCABKzbH3IJnzFqIgrYTh1kQ (direct)', 'https://www.youtube.com/feeds/videos.xml?channel_id=UCABKzbH3IJnzFqIgrYTh1kQ');

// Round 2: WebSearch surfaced real 2026/27 match-highlight video pages
// (titles like "Real Madrid 2-1 Inter Milan | Champions League 26/27
// Match Highlights") but truncated any playlist_id in the snippet -- find
// the actual uploader channel straight from the video's own watch page,
// then dump THAT channel's uploads feed.
async function resolveVideoUploader(videoId) {
  const { ok, status, text } = await fetchText(`https://www.youtube.com/watch?v=${videoId}`);
  if (!ok) return { error: `${status}` };
  const channelId = text.match(/"channelId":"(UC[\w-]+)"/)?.[1] ?? null;
  const author = text.match(/"author":"([^"]+)"/)?.[1] ?? null;
  const title = text.match(/<title>([^<]*)<\/title>/)?.[1] ?? null;
  return { channelId, author, title };
}

const VIDEO_CANDIDATES = [
  { label: 'EL (24/25) match highlight video: Athletic Club 0-3 Manchester United', videoId: '8y4TGVfIDXE' },
  { label: 'EL (25/26) match highlight video: Real Betis 2-0 Lyon', videoId: '530D2K6AG7U' },
  { label: 'UECL (25/26 final) match highlight video: Crystal Palace 1-0 Rayo Vallecano', videoId: 'ftogtnv7wXg' },
];

const seenChannelIds = new Set();
for (const v of VIDEO_CANDIDATES) {
  console.log(`\n#### Resolving uploader of ${v.label} (${v.videoId}) ####`);
  const info = await resolveVideoUploader(v.videoId);
  console.log(JSON.stringify(info));
  if (info.channelId && !seenChannelIds.has(info.channelId)) {
    seenChannelIds.add(info.channelId);
    await dumpFeed(`${v.label} -- uploader channel ${info.channelId} (${info.author})`, `https://www.youtube.com/feeds/videos.xml?channel_id=${info.channelId}`);
  }
}
