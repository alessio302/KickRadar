import 'dotenv/config';
import { UEFA_COMPETITIONS, LEAGUES } from '../config/leagues.js';

// Follow-up to the earlier diagnoseHeadToHeadCoverage.js (since removed),
// which 404'd on 4 guessed REST shapes and concluded GOAL API has no H2H
// endpoint on FREE. The user found GOAL API's own docs (goal-api.com)
// listing exactly this: GET /h2h/:team1Id/:team2Id (+ /direct, /stats) --
// so the earlier guesses were simply wrong paths, not proof the feature
// doesn't exist. This re-tests the *documented* shape with real GOAL API
// team ids (resolved via /leagues/:id/teams, same as syncClubGoalApiIds.js
// does for domestic clubs) to get a conclusive answer, including whether
// FREE tier gets a 200 or a 401/403 paywall on it.

const BASE_URL = process.env.GOAL_API_BASE_URL || 'https://api.goal-api.com/v1';

async function rawCall(path) {
  const apiKey = process.env.GOAL_API_KEY;
  const res = await fetch(`${BASE_URL}${path}`, { headers: { Authorization: `Bearer ${apiKey}` } });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

function trim(value, max = 800) {
  const s = JSON.stringify(value);
  return s.length > max ? s.slice(0, max) + `...<truncated, ${s.length} chars total>` : s;
}

async function main() {
  // Pick two teams we know GOAL API tracks: use a domestic league's own
  // getLeagueTeams call (cheap, well-understood shape) for two Serie A
  // sides likely to have played each other many times.
  const serieA = LEAGUES.find((l) => l.slug === 'serie-a');
  console.log('--- Resolving two Serie A team ids via /leagues/:id/teams ---');
  const teamsRes = await rawCall(`/leagues/${serieA.goalApiLeagueId}/teams`);
  console.log('status', teamsRes.status);
  if (teamsRes.status !== 200) {
    console.log(trim(teamsRes.body));
    return;
  }
  const teams = teamsRes.body.data ?? [];
  const juve = teams.find((t) => /juventus/i.test(t.name));
  const milan = teams.find((t) => /^milan$|a\.?c\.?\s*milan/i.test(t.name));
  console.log('Juventus match:', juve ? { id: juve.id, name: juve.name } : null);
  console.log('Milan match:', milan ? { id: milan.id, name: milan.name } : null);

  if (!juve || !milan) {
    console.log('Could not resolve both teams by name, dumping first 5 team names for inspection:');
    console.log(teams.slice(0, 5).map((t) => ({ id: t.id, name: t.name })));
    return;
  }

  for (const suffix of ['', '/direct', '/stats']) {
    const path = `/h2h/${juve.id}/${milan.id}${suffix}`;
    console.log(`\n--- GET ${path} ---`);
    const r = await rawCall(path);
    console.log('status', r.status);
    console.log(trim(r.body));
  }

  // Also try a UEFA competition pairing, since the feature could be gated
  // per-competition rather than per-account.
  console.log('\n--- Resolving two UEFA (Europa League) team ids ---');
  const uel = UEFA_COMPETITIONS.find((c) => c.slug === 'europa-league');
  const uelTeamsRes = await rawCall(`/leagues/${uel.goalApiLeagueId}/teams`);
  console.log('status', uelTeamsRes.status);
  if (uelTeamsRes.status === 200) {
    const uelTeams = uelTeamsRes.body.data ?? [];
    const [t1, t2] = uelTeams;
    if (t1 && t2) {
      console.log('Using', t1.name, 'vs', t2.name);
      for (const suffix of ['', '/direct', '/stats']) {
        const path = `/h2h/${t1.id}/${t2.id}${suffix}`;
        console.log(`\n--- GET ${path} ---`);
        const r = await rawCall(path);
        console.log('status', r.status);
        console.log(trim(r.body));
      }
    }
  }

  console.log('\nDone.');
}

main().catch((err) => {
  console.error('Diagnostic failed:', err);
  process.exit(1);
});
