// One-off diagnostic, not part of the regular pipeline. Confirmed so far
// (see git history of this file for the earlier rounds):
//
// - ovsyndication.kicker.de's "universal" app API uses attribute-based XML.
// - Bundesliga: league id "1", urlName "bundesliga", currentSeasonId
//   "2026/27" (must be URL-encoded before going into a path segment).
// - LeagueSeasonInfo/3/ligid/{id}/saison/{season} returns the league's full
//   team list (id/shortName/longName/trackingUrl) but NOT a full match
//   schedule -- reading the published `kickerde-api-client` source (its
//   `league_season_info.py` mapping) confirmed the only other block in that
//   response is `<gamedays>`, which is just matchday-number-to-date-range,
//   with no team/match info at all.
// - MyTeamSync/3/vrnid/{teamId} is the only endpoint with actual match
//   data, but (confirmed live) it only ever returns ~2 matches per team --
//   apparently "next match" and "most recent match" across ALL
//   competitions, not a full schedule and not filtered to one league. Each
//   match's homeTeam/guestTeam objects carry `urlName` (the slug kicker.de
//   uses in match page URLs) and `token`; the match itself carries `id`,
//   `leagueId`, `leagueUrlName`, `seasonId`, `date`.
// - Grepped the entire kickerde-api-client source for lineup/formation/
//   aufstellung: no hits (the "formation"-looking matches were false
//   positives on the substring inside "information"). This unofficial API
//   does not expose lineups at all -- confirms the plan to construct the
//   kicker.de match page URL from the fields above and scrape its HTML.
//
// This run: pull the Bundesliga team list, call MyTeamSync for each team
// until we find a match whose leagueId matches Bundesliga's, then try a
// few candidate /aufstellung URL patterns against the REAL kicker.de site
// (this runner has real internet access) and log status codes + a content
// snippet, so the correct pattern can be confirmed from live data instead
// of guessed.
const API_BASE_URL = 'https://ovsyndication.kicker.de/API/universal/3.0';
const SITE_BASE_URL = 'https://www.kicker.de';
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const BROWSER_HEADERS = {
  'User-Agent': BROWSER_UA,
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1',
};

async function apiGet(path) {
  const res = await fetch(`${API_BASE_URL}/${path}`, {
    headers: { Accept: 'application/xml', 'Cache-Control': 'no-cache' },
  });
  console.log(`GET ${path} -> ${res.status} ${res.statusText}`);
  const text = await res.text();
  return { ok: res.ok, status: res.status, text };
}

function attr(block, name) {
  return block.match(new RegExp(`${name}="([^"]*)"`))?.[1];
}

function parseMatches(xml) {
  return xml
    .split('<match ')
    .slice(1)
    .map((block) => {
      const homeBlockMatch = block.match(/<homeTeam ([^>]*)\/>/);
      const guestBlockMatch = block.match(/<guestTeam ([^>]*)\/>/);
      return {
        id: attr(block, 'id'),
        leagueId: attr(block, 'leagueId'),
        leagueUrlName: attr(block, 'leagueUrlName'),
        seasonId: attr(block, 'seasonId'),
        date: attr(block, 'date'),
        completed: attr(block, 'completed'),
        homeTeam: homeBlockMatch
          ? { urlName: attr(homeBlockMatch[1], 'urlName'), longName: attr(homeBlockMatch[1], 'longName') }
          : null,
        guestTeam: guestBlockMatch
          ? { urlName: attr(guestBlockMatch[1], 'urlName'), longName: attr(guestBlockMatch[1], 'longName') }
          : null,
      };
    });
}

async function tryFetchPage(url) {
  try {
    const res = await fetch(url, { headers: BROWSER_HEADERS, redirect: 'manual' });
    const text = await res.text();
    const location = res.headers.get('location');
    console.log(`  ${res.status} ${res.statusText}${location ? ` -> redirect: ${location}` : ''} (${url})`);
    console.log('    headers:', JSON.stringify(Object.fromEntries(res.headers.entries())));
    const hasAufstellung = /ufstellung/i.test(text);
    console.log(`    contains "ufstellung": ${hasAufstellung}, length: ${text.length}`);
    console.log('    body snippet:', text.slice(0, 800).replace(/\s+/g, ' '));
  } catch (err) {
    console.log(`  fetch failed for ${url}: ${err.message}`);
  }
}

async function main() {
  const leaguesResp = await apiGet('LeagueListHome/3');
  const leagueBlocks = leaguesResp.text.split('<league ').slice(1);
  const bundesligaBlock = leagueBlocks.find((b) => /urlName="bundesliga"/.test(b));
  if (!bundesligaBlock) {
    console.log('Could not find Bundesliga in LeagueListHome -- aborting.');
    return;
  }
  const leagueId = attr(bundesligaBlock, 'id');
  const seasonId = attr(bundesligaBlock, 'currentSeasonId');
  const seasonStartYear = seasonId.split('/')[0];
  console.log('Bundesliga:', { leagueId, seasonId, seasonStartYear });

  const seasonResp = await apiGet(`LeagueSeasonInfo/3/ligid/${leagueId}/saison/${encodeURIComponent(seasonId)}`);
  const teamBlocks = seasonResp.text.split('<team ').slice(1);
  const teamIds = teamBlocks.map((b) => attr(b, 'id')).filter(Boolean);
  console.log(`Found ${teamIds.length} Bundesliga team ids:`, teamIds);

  let foundMatch = null;
  for (const teamId of teamIds) {
    const syncResp = await apiGet(`MyTeamSync/3/vrnid/${teamId}`);
    const matches = parseMatches(syncResp.text);
    console.log(
      `Team ${teamId} matches:`,
      matches.map((m) => ({ id: m.id, leagueId: m.leagueId, leagueUrlName: m.leagueUrlName, date: m.date }))
    );
    const bundesligaMatch = matches.find((m) => m.leagueId === leagueId);
    if (bundesligaMatch && bundesligaMatch.homeTeam && bundesligaMatch.guestTeam) {
      foundMatch = bundesligaMatch;
      break;
    }
  }

  if (!foundMatch) {
    console.log('No Bundesliga-league match found in any scanned team\'s MyTeamSync -- try more teams.');
    return;
  }

  console.log('Using match for URL pattern test:', foundMatch);
  const home = foundMatch.homeTeam.urlName;
  const guest = foundMatch.guestTeam.urlName;
  const matchId = foundMatch.id;
  const league = foundMatch.leagueUrlName;

  const candidates = [
    `${SITE_BASE_URL}/${home}-gegen-${guest}-${seasonStartYear}-${league}-${matchId}/aufstellung`,
    `${SITE_BASE_URL}/${home}-gegen-${guest}-${seasonStartYear}-${league}/${matchId}/aufstellung`,
    `${SITE_BASE_URL}/${home}-gegen-${guest}-${matchId}/aufstellung`,
    `${SITE_BASE_URL}/${home}-gegen-${guest}-${seasonStartYear}-${league}-${matchId}`,
  ];
  console.log('Baseline fetch of the kicker.de homepage (to check if 202 is site-wide bot mitigation):');
  await tryFetchPage(SITE_BASE_URL);

  console.log('Trying candidate URLs:');
  for (const url of candidates) {
    await tryFetchPage(url);
  }
}

main().catch((err) => {
  console.error('Diagnostic failed:', err);
  process.exitCode = 1;
});
