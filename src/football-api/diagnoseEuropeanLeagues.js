// Diagnostic: checks both football-data.org and GOAL API for UEFA club
// competition coverage (Champions League, Europa League, Conference League).
//
// football-data.org competition IDs confirmed from their public /competitions
// listing (no auth required): 2001 = UCL, 2146 = UEL, 2191 = UECL.
//
// GOAL API has no fixed numeric IDs for UEFA comps -- their /countries list
// resolves countries by name, and within each country their /leagues endpoint
// lists leagues. UEFA competitions appear under country name "Europe" or
// "UEFA" depending on the provider version; this script probes both and logs
// exactly what comes back so the output is self-documenting.
//
// Run via the diagnose-european-leagues.yml action (workflow_dispatch).
// Needs FOOTBALL_DATA_API_KEY and GOAL_API_KEY secrets.

const FOOTBALL_DATA_BASE_URL =
  process.env.FOOTBALL_DATA_BASE_URL || 'https://api.football-data.org/v4';
const GOAL_API_BASE_URL = process.env.GOAL_API_BASE_URL || 'https://api.goal-api.com/v1';

// ── Helpers ──────────────────────────────────────────────────────────────────

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
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  ${title}`);
  console.log('═'.repeat(60));
}

function ok(msg) { console.log(`  ✓  ${msg}`); }
function warn(msg) { console.log(`  ⚠  ${msg}`); }
function fail(msg) { console.log(`  ✗  ${msg}`); }
function info(msg) { console.log(`     ${msg}`); }

// ── football-data.org ─────────────────────────────────────────────────────────

const FD_TARGETS = [
  { id: 2001, name: 'Champions League (UCL)' },
  { id: 2146, name: 'Europa League (UEL)' },
  { id: 2191, name: 'Conference League (UECL)' },
];

async function checkFootballData() {
  section('football-data.org — UEFA competition check');

  // First: list all competitions the key has access to
  console.log('\n[1] Listing all accessible competitions...');
  const listRes = await fdCall('/competitions');
  if (!listRes.ok) {
    fail(`/competitions returned ${listRes.status}: ${listRes.body}`);
  } else {
    const all = listRes.body.competitions ?? [];
    info(`Total competitions accessible: ${all.length}`);
    const europeanComps = all.filter(
      (c) =>
        c.area?.name === 'Europe' ||
        ['UCL', 'UEL', 'UECL', 'CLI'].includes(c.code),
    );
    if (europeanComps.length === 0) {
      warn('No UEFA/European competitions found in /competitions listing');
    } else {
      ok(`European competitions in plan: ${europeanComps.length}`);
      for (const c of europeanComps) {
        info(`  id=${c.id}  code=${c.code}  name=${c.name}  area=${c.area?.name}`);
      }
    }
  }

  // Per-competition probe: competition meta, teams, fixtures
  for (const target of FD_TARGETS) {
    console.log(`\n[2] Probing competition id=${target.id} (${target.name})...`);
    await sleep(6500); // respect 10 req/min free tier

    const compRes = await fdCall(`/competitions/${target.id}`);
    if (!compRes.ok) {
      fail(`  /competitions/${target.id} → ${compRes.status}: ${String(compRes.body).slice(0, 120)}`);
      continue;
    }
    const comp = compRes.body;
    ok(`Competition found: "${comp.name}" (${comp.code}), area: ${comp.area?.name}`);
    info(`  Current season: ${comp.currentSeason?.startDate} – ${comp.currentSeason?.endDate}`);
    info(`  Winner last season: ${comp.currentSeason?.winner?.name ?? 'n/a'}`);

    await sleep(6500);

    const teamsRes = await fdCall(`/competitions/${target.id}/teams`);
    if (!teamsRes.ok) {
      warn(`  /competitions/${target.id}/teams → ${teamsRes.status}: ${String(teamsRes.body).slice(0, 120)}`);
    } else {
      const teams = teamsRes.body.teams ?? [];
      ok(`Teams accessible: ${teams.length} clubs in current season`);
      info(`  Sample: ${teams.slice(0, 4).map((t) => t.name).join(', ')}${teams.length > 4 ? ', ...' : ''}`);
    }

    await sleep(6500);

    const matchRes = await fdCall(`/competitions/${target.id}/matches`, {
      dateFrom: new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10),
      dateTo: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
    });
    if (!matchRes.ok) {
      warn(`  /competitions/${target.id}/matches (±14d) → ${matchRes.status}: ${String(matchRes.body).slice(0, 120)}`);
    } else {
      const matches = matchRes.body.matches ?? [];
      ok(`Matches (±14 days): ${matches.length} fixtures accessible`);
      if (matches.length > 0) {
        const sample = matches[0];
        info(`  Sample: ${sample.homeTeam?.name} vs ${sample.awayTeam?.name} on ${sample.utcDate?.slice(0, 10)} (${sample.status})`);
      }
    }

    await sleep(6500);

    const standRes = await fdCall(`/competitions/${target.id}/standings`);
    if (!standRes.ok) {
      warn(`  /competitions/${target.id}/standings → ${standRes.status}: ${String(standRes.body).slice(0, 120)}`);
    } else {
      const standings = standRes.body.standings ?? [];
      ok(`Standings accessible: ${standings.length} group(s)/phase(s)`);
      const types = standings.map((s) => `${s.type}/${s.stage}`).join(', ');
      info(`  Types: ${types}`);
    }
  }
}

// ── GOAL API ─────────────────────────────────────────────────────────────────

async function checkGoalApi() {
  section('GOAL API — UEFA competition check');

  // GOAL API organises leagues under countries. UEFA comps may appear under a
  // "Europe" or "International" country entry. Probe /countries first.
  console.log('\n[1] Fetching /countries list...');
  const countriesRes = await goalCall('/countries');
  if (!countriesRes.ok) {
    fail(`/countries → ${countriesRes.status}: ${String(countriesRes.body).slice(0, 200)}`);
    return;
  }

  const countries = countriesRes.body.data ?? [];
  info(`Total countries: ${countries.length}`);

  const candidateNames = ['europe', 'international', 'uefa', 'world'];
  const candidates = countries.filter(
    (c) => candidateNames.some((n) => c.name?.toLowerCase().includes(n)),
  );

  if (candidates.length === 0) {
    warn('No "Europe"/"International"/"UEFA" country entry found in GOAL API /countries.');
    info('Listing all country names for manual inspection:');
    for (const c of countries) {
      info(`  id=${c.id}  name=${c.name}`);
    }
    return;
  }

  ok(`Found ${candidates.length} candidate country entries for UEFA comps:`);
  for (const c of candidates) {
    info(`  id=${c.id}  name=${c.name}`);
  }

  // For each candidate country, fetch leagues and look for UCL/UEL/UECL
  const ucl_keywords = ['champions', 'ucl'];
  const uel_keywords = ['europa league', 'uel'];
  const uecl_keywords = ['conference', 'uecl'];

  for (const country of candidates) {
    console.log(`\n[2] Fetching /countries/${country.id}/leagues (${country.name})...`);
    const leaguesRes = await goalCall(`/countries/${country.id}/leagues`);
    if (!leaguesRes.ok) {
      fail(`  /countries/${country.id}/leagues → ${leaguesRes.status}: ${String(leaguesRes.body).slice(0, 120)}`);
      continue;
    }
    const leagues = leaguesRes.body.data ?? [];
    ok(`  ${leagues.length} league(s) under "${country.name}"`);

    for (const league of leagues) {
      const lname = league.name?.toLowerCase() ?? '';
      let tag = '';
      if (ucl_keywords.some((k) => lname.includes(k))) tag = '→ UCL candidate';
      else if (uel_keywords.some((k) => lname.includes(k))) tag = '→ UEL candidate';
      else if (uecl_keywords.some((k) => lname.includes(k))) tag = '→ UECL candidate';
      info(`    id=${league.id}  name="${league.name}"  ${tag}`);
    }

    // For any UCL/UEL/UECL hits try to fetch fixtures to confirm data access
    const hits = leagues.filter((league) => {
      const lname = league.name?.toLowerCase() ?? '';
      return (
        ucl_keywords.some((k) => lname.includes(k)) ||
        uel_keywords.some((k) => lname.includes(k)) ||
        uecl_keywords.some((k) => lname.includes(k))
      );
    });

    for (const hit of hits) {
      const today = new Date().toISOString().slice(0, 10);
      console.log(`\n[3] Probing fixtures for "${hit.name}" (id=${hit.id}) on ${today}...`);
      await sleep(1000);
      const fixtRes = await goalCall(`/leagues/${hit.id}/fixtures`, { date: today });
      if (!fixtRes.ok) {
        warn(`  /leagues/${hit.id}/fixtures → ${fixtRes.status}: ${String(fixtRes.body).slice(0, 120)}`);
      } else {
        const fixtures = fixtRes.body.data ?? [];
        ok(`  Fixtures on ${today}: ${fixtures.length}`);
        if (fixtures.length > 0) {
          const f = fixtures[0];
          info(`  Sample: ${f.homeTeam?.name ?? f.home?.name} vs ${f.awayTeam?.name ?? f.away?.name}`);
        }
      }

      // Also try teams
      await sleep(1000);
      const teamsRes = await goalCall(`/leagues/${hit.id}/teams`);
      if (!teamsRes.ok) {
        warn(`  /leagues/${hit.id}/teams → ${teamsRes.status}: ${String(teamsRes.body).slice(0, 120)}`);
      } else {
        const teams = teamsRes.body.data ?? [];
        ok(`  Teams accessible: ${teams.length}`);
        info(`  Sample: ${teams.slice(0, 4).map((t) => t.name).join(', ')}${teams.length > 4 ? ', ...' : ''}`);
      }
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('KickRadar — European Leagues API Diagnostic');
  console.log(`Run at: ${new Date().toISOString()}`);

  await checkFootballData();
  await checkGoalApi();

  section('Summary');
  console.log('Check the ✓ / ⚠ / ✗ lines above for each API.');
  console.log('Full JSON is logged inline for any endpoint that returns data.');
}

main().catch((err) => {
  console.error('\nDiagnostic failed with unhandled error:', err);
  process.exitCode = 1;
});
