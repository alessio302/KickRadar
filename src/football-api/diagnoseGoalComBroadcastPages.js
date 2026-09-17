// One-off: user pointed out goal.com publishes per-locale, fixture-level
// broadcaster overview articles (e.g. the /it Serie A "dove vedere" page,
// and /de equivalents for Bundesliga/Champions League/"today's matches").
// These look like evergreen, daily-updated articles at FIXED URLs (not a
// new URL per day), which -- if true and if the content is actually
// extractable text/list rather than client-rendered -- would be a genuinely
// free, no-API way to get real per-fixture "which channel" data via the
// same LLM-extraction pattern the news pipeline already uses. Validates,
// before building anything: (1) robots.txt allows fetching these paths,
// (2) the pages are reachable or blocked, (3) what the actual response
// looks like -- a real per-match list, or something empty of the useful
// text.
//
// Round 2 (user follow-up): not just "Sky vs DAZN" but the SPECIFIC channel
// (e.g. "Sky Sport Bundesliga 1" not just "Sky", "Sky Sport Uno" for Italy)
// and whether a usable logo image accompanies each broadcaster mention.
// Dumps the FULL visible text (no 2500-char cutoff this time) for the two
// most fixture-dense pages, greps for numbered-channel patterns, and lists
// every <img> near a Sky/DAZN/Prime mention so we can see what logo assets
// (if any) the page actually embeds.
const CANDIDATE_URLS = [
  'https://www.goal.com/it/notizie/calendario-serie-a-dove-vedere-le-partite-su-sky-dazn/15xq0ezenmop915t22cio9f74h',
  'https://www.goal.com/de/meldungen/fussball-heute-im-tv-und-im-live-stream-top-spiele/5681oylra2dy1htomenl3fsww',
  'https://www.goal.com/de/meldungen/champions-league-heute-live-tv-live-stream-uebertragung-spiele-dazn-sky-deuschland/1koxjxykow9r513duvv14z1e4m',
  'https://www.goal.com/de/meldungen/laeuft-die-konferenz-heute-live-bei-dazn-oder-sky-fussball-in-der-bundesliga-3-spieltag-im-tv-und-livestream-sehen/blt0303051498004158',
];

async function checkRobots() {
  const res = await fetch('https://www.goal.com/robots.txt');
  const text = await res.text();
  console.log(`robots.txt status=${res.status}, length=${text.length}`);
}

function extractBroadcastImages(html) {
  const imgs = [...html.matchAll(/<img[^>]+>/gi)].map((m) => m[0]);
  return imgs.filter((tag) => /sky|dazn|prime|amazon|wow|logo/i.test(tag));
}

async function checkPage(url, { fullText = false } = {}) {
  console.log(`\n=== ${url} ===`);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; KickRadarDiagnose/1.0)' } });
    const html = await res.text();
    console.log(`status=${res.status}, bytes=${html.length}`);
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    console.log(`visible-text length=${text.length}`);
    console.log(fullText ? text : text.slice(0, 1500));

    const channelMentions = text.match(/(Sky Sport[\w äöü]*\d*|DAZN\s?\d|Amazon Prime[\w äöü]*|Sky Sport (Uno|Bundesliga|Calcio|Football|Premier League)[\w äöü]*\d*)/gi) || [];
    console.log(`\nnumbered/named-channel mentions (raw, may repeat): ${[...new Set(channelMentions)].join(' | ') || 'NONE FOUND'}`);

    const broadcastImgs = extractBroadcastImages(html);
    console.log(`\nbroadcast-related <img> tags found: ${broadcastImgs.length}`);
    broadcastImgs.slice(0, 10).forEach((tag) => console.log(`  ${tag}`));
  } catch (err) {
    console.log(`fetch failed: ${err.message}`);
  }
}

async function main() {
  await checkRobots();
  await checkPage(CANDIDATE_URLS[0], { fullText: true }); // Serie A
  await checkPage(CANDIDATE_URLS[3], { fullText: true }); // Bundesliga matchday (most fixture-dense)
  await checkPage(CANDIDATE_URLS[1]); // daily overview
  await checkPage(CANDIDATE_URLS[2]); // Champions League
}

main()
  .catch((err) => {
    console.error('Diagnose failed:', err);
    process.exitCode = 1;
  })
  .finally(() => process.exit(process.exitCode ?? 0));
