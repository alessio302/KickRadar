// Diagnostic: does GOAL API expose anything usable for a UEFA-fixture
// "direkter Vergleich" (head-to-head) tab, or a per-team recent-results
// endpoint that could serve "Form" for European fixtures too (which have
// no clubs.id to key the domestic useTeamForm.js query off of)?
//
// goalApiClient.js has no h2h/team-fixtures wrapper today -- none of the
// paths below are confirmed to exist, this probes a set of plausible REST
// shapes (matching GOAL API's own /leagues/{id}/fixtures, /teams/{id}/
// players conventions already in use) and logs exactly what comes back.
//
// Run via the diagnose-head-to-head-coverage.yml action (workflow_dispatch).
// Needs GOAL_API_KEY secret.

const GOAL_API_BASE_URL = process.env.GOAL_API_BASE_URL || 'https://api.goal-api.com/v1';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
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

// Real fixture already confirmed live in diagnoseMatchStatsCoverage.js's
// own run (UEL qualifying, Ferencvaros vs Trabzonspor) -- same team ids
// reused here so this probe needs no fresh fixture lookup of its own.
const HOME_TEAM_ID = 'cmri0gk70br4ulb07mfk2k6wl'; // Ferencvaros
const AWAY_TEAM_ID = 'cmri0ey33b6jrlb07mo6ei5jt'; // Trabzonspor
const SAMPLE_FIXTURE_ID = 'cmsvp3y1199o5pg075c82ynas';

async function probe(label, path, params) {
  await sleep(1000);
  const res = await goalCall(path, params);
  if (!res.ok) {
    warn(`${label} (${path}) → ${res.status}: ${String(res.body).slice(0, 150)}`);
    return;
  }
  ok(`${label} (${path}) → 200`);
  dump(label, res.body);
}

async function main() {
  console.log('KickRadar — GOAL API Head-to-Head / Team-Fixtures Coverage Diagnostic');
  console.log(`Run at: ${new Date().toISOString()}`);

  section('Head-to-head candidates');
  await probe('h2h via team pair (path)', `/teams/${HOME_TEAM_ID}/h2h/${AWAY_TEAM_ID}`);
  await probe('h2h via query params', '/head2head', { team1: HOME_TEAM_ID, team2: AWAY_TEAM_ID });
  await probe('h2h via fixture id', `/fixtures/${SAMPLE_FIXTURE_ID}/h2h`);
  await probe('h2h via fixture id (head2head)', `/fixtures/${SAMPLE_FIXTURE_ID}/head2head`);

  section('Per-team recent-results candidates (would also cover "Form" for European fixtures)');
  await probe('team matches/fixtures history', `/teams/${HOME_TEAM_ID}/fixtures`);
  await probe('team matches (alt path)', `/teams/${HOME_TEAM_ID}/matches`);
  await probe('team profile (may embed recent form)', `/teams/${HOME_TEAM_ID}`);

  section('Summary');
  console.log('Any 200 above with real match/team data is a usable source.');
  console.log('All-404 means GOAL API FREE has none of these -- head-to-head and');
  console.log('cross-competition form for European fixtures would need a different plan.');
}

main().catch((err) => {
  console.error('\nDiagnostic failed with unhandled error:', err);
  process.exitCode = 1;
});
