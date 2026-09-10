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
  const idMatch = text.match(/"channelId":"(UC[\w-]+)"/);
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
