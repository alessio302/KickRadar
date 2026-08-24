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
// Regex-based extraction here is deliberately crude rather than using a
// real XML parser, since the goal is only to see the real raw shape, not
// to build anything durable yet.
const BASE_URL = 'https://ovsyndication.kicker.de/API/universal/3.0';

async function apiGet(path) {
  const res = await fetch(`${BASE_URL}/${path}`, {
    headers: { Accept: 'application/xml', 'Cache-Control': 'no-cache' },
  });
  console.log(`GET ${path} -> ${res.status} ${res.statusText}`);
  const text = await res.text();
  return { ok: res.ok, status: res.status, text };
}

function extractTag(block, tag) {
  return block.match(new RegExp(`<${tag}>([^<]*)</${tag}>`))?.[1];
}

async function main() {
  const leaguesResp = await apiGet('LeagueListHome/3');
  console.log('--- LeagueListHome/3 raw (first 4000 chars) ---');
  console.log(leaguesResp.text.slice(0, 4000));

  const leagueBlocks = leaguesResp.text.split('<league>').slice(1);
  const bundesligaBlock = leagueBlocks.find(
    (b) => /<longName>Bundesliga<\/longName>/i.test(b) || /<urlName>bundesliga<\/urlName>/i.test(b)
  );
  if (!bundesligaBlock) {
    console.log('Could not find a "Bundesliga" entry via simple text match -- inspect the raw dump above manually.');
    return;
  }

  const leagueId = extractTag(bundesligaBlock, 'id');
  const seasonId = extractTag(bundesligaBlock, 'currentSeasonId');
  console.log('Found Bundesliga entry:', {
    id: leagueId,
    currentSeasonId: seasonId,
    longName: extractTag(bundesligaBlock, 'longName'),
    urlName: extractTag(bundesligaBlock, 'urlName'),
  });
  if (!leagueId || !seasonId) return;

  const seasonResp = await apiGet(`LeagueSeasonInfo/3/ligid/${leagueId}/saison/${seasonId}`);
  console.log('--- LeagueSeasonInfo raw (first 5000 chars) ---');
  console.log(seasonResp.text.slice(0, 5000));

  const firstTeamId = seasonResp.text.match(/<teams>[\s\S]*?<team>[\s\S]*?<id>(\d+)<\/id>/)?.[1];
  console.log('First team id found in teams list:', firstTeamId);
  if (!firstTeamId) return;

  const syncResp = await apiGet(`MyTeamSync/3/vrnid/${firstTeamId}`);
  console.log('--- MyTeamSync raw for team', firstTeamId, '(first 8000 chars) ---');
  console.log(syncResp.text.slice(0, 8000));
}

main().catch((err) => {
  console.error('Diagnostic failed:', err);
  process.exitCode = 1;
});
