// Diagnostic: what statistics-shaped data (shots, possession, corners, xG,
// form, head-to-head, standings-like fields, ...) do football-data.org and
// GOAL API actually return for a match -- specifically for the UEFA club
// competitions, where this app's own MatchStatsTab (form/head-to-head/
// standing, all keyed by clubs.id) can't run at all (see
// EuropaFixtureDetailOverlay.jsx's own comment: European fixtures have no
// clubs table row). Answers "what could a UEFA-fixture Statistiken tab
// actually be built from" before designing one.
//
// Prints full raw JSON for one sample fixture per source/competition so the
// output is self-documenting -- this is a one-off investigation script, not
// meant to assert pass/fail.
//
// Run via the diagnose-match-stats-coverage.yml action (workflow_dispatch).
// Needs FOOTBALL_DATA_API_KEY and GOAL_API_KEY secrets.

const FOOTBALL_DATA_BASE_URL = process.env.FOOTBALL_DATA_BASE_URL || 'https://api.football-data.org/v4';
const GOAL_API_BASE_URL = process.env.GOAL_API_BASE_URL || 'https://api.goal-api.com/v1';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fdCall(path, params = {}) {
  const apiKey = process.env.FOOTBALL_DATA_API_KEY;
  if (!apiKey) throw new Error('Missing FOOTBALL_DATA_API_KEY');
  const url = new URL(`${FOOTBALL_DATA_BASE_URL}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v != null) url.searchParams.set(k, v);
  }
  const res = await fetch(url, { headers: { 'X-Auth-Token': apiKey } });
  if (res.status === 429) {
    const wait = Number(res.headers.get('retry-after') || 60) * 1000;
    console.warn(`  [fd] 429 on ${path}, waiting ${wait / 1000}s...`);
    await sleep(wait);
    return fdCall(path, params);
  }
  const body = await res.text();
  return { status: res.status, ok: res.ok, body: res.ok ? JSON.parse(body) : body };
}

async function goalCall(path, params = {}) {
  const apiKey = process.env.GOAL_API_KEY;
  if (!apiKey) throw new Error('Missing GOAL_API_KEY');
  const url = new URL(`${GOAL_API_BASE_URL}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v != null) url.searchParams.set(k, String(v));
  }
  const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
  if (res.status === 429) {
    const wait = Math.min(Number(res.headers.get('retry-after') || 30) * 1000, 60000);
    console.warn(`  [goal] 429 on ${path}, waiting ${wait / 1000}s...`);
    await sleep(wait);
    return goalCall(path, params);
  }
  const body = await res.text();
  return { status: res.status, ok: res.ok, body: res.ok ? JSON.parse(body) : body };
}

function section(title) {
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`  ${title}`);
  console.log('═'.repeat(70));
}
function ok(msg) { console.log(`  ✓  ${msg}`); }
function warn(msg) { console.log(`  ⚠  ${msg}`); }
function fail(msg) { console.log(`  ✗  ${msg}`); }
function info(msg) { console.log(`     ${msg}`); }
function dump(label, obj) {
  console.log(`     ${label}:`);
  console.log(
    JSON.stringify(obj, null, 2)
      .split('\n')
      .map((l) => `       ${l}`)
      .join('\n')
  );
}

// ── football-data.org: UCL (the one UEFA comp it covers) ───────────────────

async function checkFootballDataUcl() {
  section('football-data.org — Champions League (id=2001) match shape');

  const matchRes = await fdCall('/competitions/2001/matches', {
    dateFrom: new Date(Date.now() - 21 * 86400000).toISOString().slice(0, 10),
    dateTo: new Date().toISOString().slice(0, 10),
  });
  if (!matchRes.ok) {
    fail(`/competitions/2001/matches → ${matchRes.status}: ${String(matchRes.body).slice(0, 200)}`);
    return;
  }
  const matches = matchRes.body.matches ?? [];
  info(`Matches in the last 21 days: ${matches.length}`);
  const finished = matches.filter((m) => m.status === 'FINISHED');
  const sample = finished[finished.length - 1] ?? matches[matches.length - 1];
  if (!sample) {
    warn('No matches at all to inspect in this window.');
    return;
  }
  ok(`Sample: ${sample.homeTeam?.name} vs ${sample.awayTeam?.name} (${sample.status}, ${sample.utcDate?.slice(0, 10)})`);
  info('Full raw match object (this is everything the /matches list endpoint gives per fixture):');
  dump('match', sample);

  // The v4 docs mention a separate single-match endpoint that sometimes
  // carries more detail (referees, extended score breakdown) than the list
  // endpoint -- worth a direct look too, still free-tier.
  await sleep(6500);
  const singleRes = await fdCall(`/matches/${sample.id}`);
  if (!singleRes.ok) {
    warn(`/matches/${sample.id} → ${singleRes.status}: ${String(singleRes.body).slice(0, 200)}`);
  } else {
    info('Full raw single-match object (/matches/{id}):');
    dump('match (single)', singleRes.body);
  }
}

// ── GOAL API: one sample fixture per UEFA competition ───────────────────────

const UEFA_GOAL_API_LEAGUES = [
  { slug: 'champions-league', goalApiLeagueId: 'cmr77dw3900f5rx06j05wgzv4' },
  { slug: 'europa-league', goalApiLeagueId: 'cmr77dw3900f6rx06tuqwft2d' },
  { slug: 'conference-league', goalApiLeagueId: 'cmr77dw3900f9rx06laad8onf' },
];

async function findRecentGoalApiFixture(leagueId) {
  // Walk backwards a few days looking for a finished fixture -- GOAL API's
  // /leagues/{id}/fixtures is date-scoped, no date-range query, so this is
  // a handful of one-day probes rather than one range call.
  for (let daysAgo = 0; daysAgo <= 10; daysAgo++) {
    const date = new Date(Date.now() - daysAgo * 86400000).toISOString().slice(0, 10);
    await sleep(1000);
    const res = await goalCall(`/leagues/${leagueId}/fixtures`, { date });
    if (!res.ok) continue;
    const fixtures = res.body.data ?? [];
    const finished = fixtures.find((f) => /finished|ft/i.test(f.status ?? f.matchStatus ?? ''));
    if (finished) return { fixture: finished, date };
    if (fixtures.length > 0 && daysAgo === 0) {
      // Keep the first same-day fixture as a fallback sample even if not
      // finished, so the script still shows *a* shape when nothing's
      // finished yet today.
      return { fixture: fixtures[0], date, notFinished: true };
    }
  }
  return null;
}

async function checkGoalApiCompetition({ slug, goalApiLeagueId }) {
  section(`GOAL API — ${slug} fixture + events/cards/substitutions shape`);

  const found = await findRecentGoalApiFixture(goalApiLeagueId);
  if (!found) {
    warn(`No fixture found for ${slug} in the last 10 days.`);
    return;
  }
  const { fixture, date, notFinished } = found;
  ok(`Sample fixture (${date}${notFinished ? ', not finished -- best available' : ''}):`);
  dump('fixture', fixture);

  const fixtureId = fixture.id;
  if (!fixtureId) {
    warn('Sample fixture has no id field, cannot probe events/cards/subs/statistics.');
    return;
  }

  for (const [label, path] of [
    ['events (goals)', `/fixtures/${fixtureId}/events`],
    ['cards', `/fixtures/${fixtureId}/cards`],
    ['substitutions', `/fixtures/${fixtureId}/substitutions`],
    // Not in goalApiClient.js today -- probing directly to see whether GOAL
    // API's FREE tier exposes a statistics endpoint at all (shots,
    // possession, corners, ...) before deciding whether it's worth wrapping.
    ['statistics (unconfirmed endpoint)', `/fixtures/${fixtureId}/statistics`],
    ['lineups', `/fixtures/${fixtureId}/lineups`],
  ]) {
    await sleep(1000);
    const res = await goalCall(path);
    if (!res.ok) {
      warn(`${label} → ${res.status}: ${String(res.body).slice(0, 150)}`);
      continue;
    }
    ok(`${label} → 200`);
    dump(label, res.body);
  }
}

async function main() {
  console.log('KickRadar — Match Stats Coverage Diagnostic (football-data.org + GOAL API)');
  console.log(`Run at: ${new Date().toISOString()}`);
  console.log('Goal: find out what real data exists for a "Statistiken" tab on UEFA fixtures.');

  await checkFootballDataUcl();
  for (const comp of UEFA_GOAL_API_LEAGUES) {
    await checkGoalApiCompetition(comp);
  }

  section('Summary');
  console.log('Look for a statistics/possession/shots-shaped field in any of the dumps above.');
  console.log('If "statistics (unconfirmed endpoint)" 404s, GOAL API FREE has no such endpoint.');
}

main().catch((err) => {
  console.error('\nDiagnostic failed with unhandled error:', err);
  process.exitCode = 1;
});
