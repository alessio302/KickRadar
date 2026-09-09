// One-off manual backfill for a single UCL/UEL/UECL fixture's lineup --
// for a match that's already well past syncEuropeanLineups.js's own
// LINEUP_GIVE_UP_MIN (6h post-kickoff) cutoff, so the regular 15-min sync
// will never pick it up again on its own. Not on any schedule (see
// .github/workflows/backfill-european-lineup.yml -- workflow_dispatch
// only, same as this repo's diagnose-*.yml jobs), and deliberately skips
// the give-up gate entirely: a manual run here is already the deliberate
// decision to fetch this one specific fixture regardless of age, not
// something that should silently no-op past 6h old.
//
// Usage: node src/lineups/backfillEuropeanLineup.js <fixture_id>
// (or FIXTURE_ID env var, for the workflow_dispatch input)
import { getSupabaseClient } from '../db/supabaseClient.js';
import { UEFA_COMPETITIONS } from '../config/leagues.js';
import { getLeagueFixtures, getFixtureLineups } from './goalApiClient.js';
import { teamIsPopulated, buildLineupTeam } from './lineupShape.js';
import { namesLooselyMatch } from './syncEuropeanLineups.js';

function toDateString(date) {
  return date.toISOString().slice(0, 10);
}

async function backfillEuropeanLineup(fixtureId) {
  const supabase = getSupabaseClient();

  const { data: fixture, error: fixtureErr } = await supabase
    .from('fixtures')
    .select('id, league_id, home_team_name, away_team_name, kickoff_at, goal_api_id')
    .eq('id', fixtureId)
    .single();
  if (fixtureErr) throw fixtureErr;

  const { data: league, error: leagueErr } = await supabase.from('leagues').select('slug').eq('id', fixture.league_id).single();
  if (leagueErr) throw leagueErr;

  const comp = UEFA_COMPETITIONS.find((c) => c.slug === league.slug);
  if (!comp) throw new Error(`Fixture ${fixtureId} is not a UCL/UEL/UECL fixture (league slug: ${league.slug})`);

  let goalApiId = fixture.goal_api_id;
  if (!goalApiId) {
    const dateStr = toDateString(new Date(fixture.kickoff_at));
    const apiFixtures = await getLeagueFixtures(comp.goalApiLeagueId, dateStr);
    const match = apiFixtures.find(
      (m) =>
        namesLooselyMatch(m.homeTeam?.name, fixture.home_team_name) && namesLooselyMatch(m.awayTeam?.name, fixture.away_team_name)
    );
    if (!match) {
      throw new Error(
        `Could not resolve GOAL API id for fixture ${fixtureId} (${fixture.home_team_name} vs ${fixture.away_team_name} on ${dateStr})`
      );
    }
    goalApiId = String(match.id);
    const { error: cacheErr } = await supabase.from('fixtures').update({ goal_api_id: goalApiId }).eq('id', fixtureId);
    if (cacheErr) console.error(`Failed to cache goal_api_id for fixture ${fixtureId}:`, cacheErr.message);
  }

  const lineups = await getFixtureLineups(goalApiId);
  if (!lineups?.hasLineups) {
    console.log(`No lineups available from GOAL API for fixture ${fixtureId} (goalApiId ${goalApiId}).`);
    return { stored: 0 };
  }

  const homeTeam = buildLineupTeam(lineups.home, lineups.homeFormation);
  const awayTeam = buildLineupTeam(lineups.away, lineups.awayFormation);
  if (homeTeam) homeTeam.formation = lineups.homeFormation || null;
  if (awayTeam) awayTeam.formation = lineups.awayFormation || null;

  let stored = 0;
  for (const { teamName, team } of [
    { teamName: fixture.home_team_name, team: homeTeam },
    { teamName: fixture.away_team_name, team: awayTeam },
  ]) {
    if (!teamIsPopulated(team)) {
      console.log(`No lineup data for ${teamName}.`);
      continue;
    }
    const { error: upsertErr } = await supabase.from('lineups').upsert(
      {
        fixture_id: fixture.id,
        team_name: teamName,
        confirmed: true,
        formation: team.formation,
        players: { initialLineup: team.initialLineup, substitutes: team.substitutes, coach: team.coach },
        published_at: new Date().toISOString(),
      },
      { onConflict: 'fixture_id,team_name' }
    );
    if (upsertErr) throw upsertErr;
    stored += 1;
    console.log(`Stored lineup for ${teamName} (${team.initialLineup.flat().length} starters, ${team.substitutes.length} subs).`);
  }

  return { stored };
}

const fixtureIdArg = process.argv[2] || process.env.FIXTURE_ID;
if (!fixtureIdArg) {
  console.error('Usage: node src/lineups/backfillEuropeanLineup.js <fixture_id>');
  process.exitCode = 1;
} else {
  backfillEuropeanLineup(Number(fixtureIdArg))
    .then((result) => console.log('Backfill complete:', result))
    .catch((err) => {
      console.error('Backfill failed:', err);
      process.exitCode = 1;
    });
}
