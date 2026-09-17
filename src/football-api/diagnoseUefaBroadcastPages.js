// One-off: extending the fixture-card broadcaster pill (already live for
// the 5 domestic leagues) to the 3 UEFA competitions. Unlike Bundesliga/PL/
// La Liga/Ligue 1, none of the three reduce to a static day/time rule --
// Champions League is DAZN plus one Tuesday match exclusive to Amazon Prime
// (picked ad hoc, not by any rule); Europa League/Conference League are
// split across RTL (free TV), RTL+ (streaming) and Sky (cooperation deal),
// varying match to match. Validates the same 3 prerequisites as
// diagnoseGoalComBroadcastPages.js did for Serie A, for the EL/ECL
// candidate URLs found by web research (CL's own page was already
// confirmed reachable there): robots.txt allows fetching, the pages are
// reachable, and the response is real per-match text, not an empty
// client-rendered shell -- plus greps for RTL/RTL+/Prime logo <img> tags
// (not needed for Serie A, which never has those providers).
const CANDIDATE_URLS = [
  'https://www.goal.com/de/meldungen/tv-guide-und-uebertragung-der-europa-league-wo-laeuft-welches-spiel-in-deutschland-live-im-tv-und-livestream/bltba5b96fe23c2eb11',
  'https://www.goal.com/de/meldungen/tv-guide-und-uebertragung-der-conference-league-wo-laeuft-welches-spiel-in-deutschland-live-im-tv-und-livestream/bltf5d63b914e757720',
];

function extractBroadcastImages(html) {
  const imgs = [...html.matchAll(/<img[^>]+>/gi)].map((m) => m[0]);
  return imgs.filter((tag) => /rtl|prime|amazon|sky|dazn|logo/i.test(tag));
}

async function checkPage(url) {
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
    console.log(text.slice(0, 4000));

    const broadcastImgs = extractBroadcastImages(html);
    console.log(`\nbroadcast-related <img> tags found: ${broadcastImgs.length}`);
    broadcastImgs.slice(0, 12).forEach((tag) => console.log(`  ${tag}`));
  } catch (err) {
    console.log(`fetch failed: ${err.message}`);
  }
}

async function main() {
  for (const url of CANDIDATE_URLS) {
    await checkPage(url);
  }
}

main()
  .catch((err) => {
    console.error('Diagnose failed:', err);
    process.exitCode = 1;
  })
  .finally(() => process.exit(process.exitCode ?? 0));
