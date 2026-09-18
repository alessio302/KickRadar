// One-off: syncEuropeanHighlights.js's own top comment (see its
// "europa-league/conference-league: still UNMAPPED" note) left these two
// competitions unmapped because their 2026/27 league phase hadn't started
// yet as of 2026-09-16/17, so there was nothing real to check the two
// already-vetted champions-league sources (ZDFsportstudio, Prime Video
// Sport Deutschland) against. Now that the phase has started, this dumps
// both channels' current feeds in full so a human/future pass can see
// whether either one already covers UEL/UECL and, if so, in what title
// shape -- same "confirm live before guessing a source" discipline as the
// top comment of syncEuropeanHighlights.js itself.
const SOURCES = [
  { name: 'ZDFsportstudio', channelId: 'UClCIWcZNvq15p0Y-E4ToGOw' },
  { name: 'Prime Video Sport Deutschland', channelId: 'UCK2izXoHvraUFaPMU5B7vMQ' },
];

// RTL Sport -- confirmed via web search to post "X vs. Y | Highlights | UEFA
// Europa League | RTL Sport"-shaped titles, real broadcaster of UEL/UECL in
// Germany 2026/27 (RTL/NITRO free-to-air, RTL+ full coverage). No known
// channel_id yet, only a sample video URL -- resolved below via the watch
// page's own embedded channelId before the RSS feed is fetched, same
// "confirm live before guessing" discipline as the rest of this file.
const RTL_SAMPLE_VIDEO_ID = 'jCY4Awy3yKE'; // "OFI Kreta vs. TSG Hoffenheim | Highlights | UEFA Europa League | RTL Sport"

async function resolveChannelIdFromVideo(videoId) {
  const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    },
  });
  if (!res.ok) throw new Error(`watch page request failed: ${res.status} ${res.statusText}`);
  const html = await res.text();
  const m = html.match(/"channelId":"(UC[\w-]+)"/);
  return m ? m[1] : null;
}

async function fetchFeedEntries(channelId) {
  const res = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    },
  });
  if (!res.ok) throw new Error(`YouTube feed request failed: ${res.status} ${res.statusText}`);
  const xml = await res.text();
  const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((m) => m[1]);
  return entries.map((entry) => ({
    videoId: entry.match(/<yt:videoId>(.*?)<\/yt:videoId>/)?.[1] ?? null,
    title: entry.match(/<title>(.*?)<\/title>/)?.[1] ?? null,
    published: entry.match(/<published>(.*?)<\/published>/)?.[1] ?? null,
  }));
}

console.log(`\n=== Resolving RTL Sport channel id from sample video ${RTL_SAMPLE_VIDEO_ID} ===`);
try {
  const rtlChannelId = await resolveChannelIdFromVideo(RTL_SAMPLE_VIDEO_ID);
  console.log(`  resolved channelId: ${rtlChannelId}`);
  if (rtlChannelId) SOURCES.push({ name: 'RTL Sport', channelId: rtlChannelId });
} catch (err) {
  console.error(`  resolve failed: ${err.message}`);
}

for (const source of SOURCES) {
  console.log(`\n=== ${source.name} (${source.channelId}) ===`);
  let entries = [];
  try {
    entries = await fetchFeedEntries(source.channelId);
  } catch (err) {
    console.error(`  feed fetch failed: ${err.message}`);
    continue;
  }
  for (const entry of entries) {
    const isEuropa = /europa league/i.test(entry.title ?? '');
    const isConference = /conference league/i.test(entry.title ?? '');
    const flag = isEuropa ? ' <-- EUROPA LEAGUE' : isConference ? ' <-- CONFERENCE LEAGUE' : '';
    console.log(`  [${entry.published}] ${entry.videoId}: ${entry.title}${flag}`);
  }
}
