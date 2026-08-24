// One-off diagnostic, not part of the regular pipeline. Dumps raw XML from
// kicker.de's unofficial "universal" app API so we can see real field
// values before writing the actual lineup sync against them.
//
// Base URL and endpoint paths (LeagueListHome/3, LeagueSeasonInfo/3/ligid/
// {id}/saison/{id}, MyTeamSync/3/vrnid/{id}) come from reading the source
// of the published `kickerde-api-client` PyPI package (an unofficial,
// community-maintained Python wrapper) -- confirmed to exist in real,
// working code, but never exercised against the live API from here (this
// sandbox can't reach kicker.de at all; only a GitHub Actions runner can).
//
// Confirmed live (first run): the XML uses attributes, not child elements
// (`<league id="1" longName="Bundesliga" urlName="bundesliga" ... />`),
// and Bundesliga's currentSeasonId is "2026/27" -- which contains a slash
// that must be URL-encoded before going into a path segment, or it splits
// into an extra path component.
const BASE_URL = 'https://ovsyndication.kicker.de/API/universal/3.0';

async function apiGet(path) {
  const res = await fetch(`${BASE_URL}/${path}`, {
    headers: { Accept: 'application/xml', 'Cache-Control': 'no-cache' },
  });
  console.log(`GET ${path} -> ${res.status} ${res.statusText}`);
  const text = await res.text();
  return { ok: res.ok, status: res.status, text };
}

function attr(block, name) {
  return block.match(new RegExp(`${name}="([^"]*)"`))?.[1];
}

async function main() {
  const leaguesResp = await apiGet('LeagueListHome/3');
  console.log('--- LeagueListHome/3 raw (first 4000 chars) ---');
  console.log(leaguesResp.text.slice(0, 4000));

  const leagueBlocks = leaguesResp.text.split('<league ').slice(1);
  const bundesligaBlock = leagueBlocks.find(
    (b) => /longName="Bundesliga"/.test(b) || /urlName="bundesliga"/.test(b)
  );
  if (!bundesligaBlock) {
    console.log('Could not find a "Bundesliga" entry via simple text match -- inspect the raw dump above manually.');
    return;
  }

  const leagueId = attr(bundesligaBlock, 'id');
  const seasonId = attr(bundesligaBlock, 'currentSeasonId');
  console.log('Found Bundesliga entry:', {
    id: leagueId,
    currentSeasonId: seasonId,
    longName: attr(bundesligaBlock, 'longName'),
    urlName: attr(bundesligaBlock, 'urlName'),
  });
  if (!leagueId || !seasonId) return;

  const seasonResp = await apiGet(
    `LeagueSeasonInfo/3/ligid/${leagueId}/saison/${encodeURIComponent(seasonId)}`
  );
  console.log('--- LeagueSeasonInfo raw (first 6000 chars) ---');
  console.log(seasonResp.text.slice(0, 6000));

  const teamBlocks = seasonResp.text.split('<team ').slice(1);
  console.log(`Found ${teamBlocks.length} <team> blocks. First 5 teams:`);
  for (const block of teamBlocks.slice(0, 5)) {
    console.log({ id: attr(block, 'id'), shortName: attr(block, 'shortName'), longName: attr(block, 'longName') });
  }

  const firstTeamId = teamBlocks.length > 0 ? attr(teamBlocks[0], 'id') : undefined;
  console.log('Using first team id for MyTeamSync test:', firstTeamId);
  if (!firstTeamId) return;

  const syncResp = await apiGet(`MyTeamSync/3/vrnid/${firstTeamId}`);
  console.log('--- MyTeamSync raw for team', firstTeamId, '(first 8000 chars) ---');
  console.log(syncResp.text.slice(0, 8000));
}

main().catch((err) => {
  console.error('Diagnostic failed:', err);
  process.exitCode = 1;
});
