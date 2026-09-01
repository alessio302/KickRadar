// Temporary diagnostic: check whether bundesliga.com's own match-highlights
// pages (as opposed to a YouTube playlist) are a viable source -- the user
// pointed at https://www.bundesliga.com/de/bundesliga/videos/match-highlights/ESHzIgvB
// specifically. Unlike the Serie A YouTube RSS feed, this is bundesliga.com's
// own video CMS (the ESHzIgvB-style id doesn't look like a YouTube id), so
// this checks: (1) what the single match page actually serves (embedded
// player, og:video, JSON blob), and (2) whether the listing page exposes a
// discoverable, scrapable feed of recent matches' ids without needing a
// private API key.
const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
};

async function inspect(label, url) {
  console.log(`\n=== ${label}: ${url} ===`);
  const res = await fetch(url, { headers: HEADERS });
  console.log('status:', res.status);
  const html = await res.text();
  console.log('length:', html.length);

  const ogVideo = html.match(/<meta[^>]+property=["']og:video[^"']*["'][^>]+content=["']([^"']+)["']/i);
  console.log('og:video match:', ogVideo?.[1] ?? null);

  const youtubeRefs = [...html.matchAll(/youtube\.com\/embed\/([a-zA-Z0-9_-]{6,})/g)].map((m) => m[1]);
  console.log('youtube embed ids found:', [...new Set(youtubeRefs)].slice(0, 5));

  const mp4Refs = [...html.matchAll(/https:\/\/[^"'\s]+\.mp4[^"'\s]*/g)].map((m) => m[0]);
  console.log('mp4 urls found:', [...new Set(mp4Refs)].slice(0, 3));

  const m3u8Refs = [...html.matchAll(/https:\/\/[^"'\s]+\.m3u8[^"'\s]*/g)].map((m) => m[0]);
  console.log('m3u8 urls found:', [...new Set(m3u8Refs)].slice(0, 3));

  const nextData = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  console.log('__NEXT_DATA__ present:', !!nextData, nextData ? `(${nextData[1].length} chars)` : '');
  if (nextData) {
    // Dump a bounded slice so we can see the real shape without flooding the log.
    console.log('NEXT_DATA sample:', nextData[1].slice(0, 1500));
  }

  const apiRefs = [...html.matchAll(/https:\/\/[a-z0-9.-]*bundesliga\.com\/[^"'\s]*api[^"'\s]*/gi)].map((m) => m[0]);
  console.log('bundesliga.com api-looking urls found:', [...new Set(apiRefs)].slice(0, 5));

  return html;
}

async function main() {
  await inspect('single match page', 'https://www.bundesliga.com/de/bundesliga/videos/match-highlights/ESHzIgvB');
  await inspect('listing page (en)', 'https://www.bundesliga.com/en/bundesliga/videos/match-highlights');
}

main().catch((err) => {
  console.error('Diagnostic failed:', err);
  process.exitCode = 1;
});
