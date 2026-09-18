// Follow-up to diagnoseLiveMinuteGap.js: that script ruled out the GOAL API
// daily budget (only 225/1000 used) and found the real symptom instead --
// every currently-live domestic fixture has goal_api_id=UNRESOLVED, so
// syncLiveEvents.js's resolveGoalApiIds() never gets far enough to
// subscribe to the WS for them at all, regardless of budget or WS
// reliability. This script re-runs that same resolution logic for exactly
// the stuck fixtures, with verbose output at every step, to see WHERE it's
// failing: GOAL API returning no fixtures for that league/date, a fixture
// present but under a date GOAL API disagrees with (UTC vs. local
// midnight), or club-name resolution (resolveClub()) simply not matching
// our own club name/short_name/aliases against GOAL API's own team name.
import { getSupabaseClient } from '../db/supabaseClient.js';
import { LEAGUES } from '../config/leagues.js';
import { getLeagueFixtures } from './goalApiClient.js';
import { resolveClub } from '../news/clubMatch.js';

function toDateString(date) {
  return date.toISOString().slice(0, 10);
}

async function main() {
  const supabase = getSupabaseClient();

  const { data: leagueRows, error: leaguesErr } = await supabase.from('leagues').select('id, slug');
  if (leaguesErr) throw leaguesErr;
  const leagueSlugById = new Map(leagueRows.map((l) => [l.id, l.slug]));

  const { data: liveFixtures, error: liveErr } = await supabase
    .from('fixtures')
    .select('id, league_id, home_club_id, away_club_id, kickoff_at, goal_api_id')
    .eq('status', 'live')
    .is('goal_api_id', null);
  if (liveErr) throw liveErr;

  console.log(`${liveFixtures.length} live fixture(s) with goal_api_id still unresolved.\n`);

  const { data: allClubs, error: clubsErr } = await supabase.from('clubs').select('id, name, short_name, aliases, league_id');
  if (clubsErr) throw clubsErr;
  const clubById = new Map(allClubs.map((c) => [c.id, c]));

  for (const f of liveFixtures) {
    const leagueSlug = leagueSlugById.get(f.league_id);
    const league = LEAGUES.find((l) => l.slug === leagueSlug);
    const homeClub = clubById.get(f.home_club_id);
    const awayClub = clubById.get(f.away_club_id);
    const dateStr = toDateString(new Date(f.kickoff_at));

    console.log(`--- fixture ${f.id}: ${homeClub?.name ?? '?'} vs ${awayClub?.name ?? '?'} (${leagueSlug}, kickoff_at=${f.kickoff_at}, queried date=${dateStr}) ---`);

    if (!league) {
      console.log('  No LEAGUES config entry for this slug -- cannot resolve.');
      continue;
    }
    if (!homeClub || !awayClub) {
      console.log(`  Missing club row: homeClub=${!!homeClub} awayClub=${!!awayClub}`);
      continue;
    }

    let apiFixtures;
    try {
      apiFixtures = await getLeagueFixtures(league.goalApiLeagueId, dateStr);
    } catch (err) {
      console.log(`  getLeagueFixtures(${league.goalApiLeagueId}, ${dateStr}) FAILED: ${err.message}`);
      continue;
    }
    console.log(`  GOAL API returned ${apiFixtures.length} fixture(s) for ${leagueSlug} on ${dateStr}:`);
    for (const m of apiFixtures) {
      console.log(`    id=${m.id} "${m.homeTeam?.name}" vs "${m.awayTeam?.name}" (date=${m.date ?? m.utcDate ?? '?'})`);
    }

    const leagueClubs = allClubs.filter((c) => c.league_id === homeClub.league_id);
    const match = apiFixtures.find((m) => {
      const homeMatch = resolveClub(m.homeTeam?.name, leagueClubs)?.id === homeClub.id;
      const awayMatch = resolveClub(m.awayTeam?.name, leagueClubs)?.id === awayClub.id;
      return homeMatch && awayMatch;
    });
    if (match) {
      console.log(`  MATCHED to GOAL API fixture id=${match.id} -- resolution should have succeeded; something else is wrong.`);
    } else {
      console.log(`  NO MATCH. Per-candidate resolveClub() results:`);
      for (const m of apiFixtures) {
        const homeResolved = resolveClub(m.homeTeam?.name, leagueClubs);
        const awayResolved = resolveClub(m.awayTeam?.name, leagueClubs);
        console.log(
          `    "${m.homeTeam?.name}" -> ${homeResolved ? homeResolved.name + (homeResolved.id === homeClub.id ? ' (OUR HOME CLUB)' : ' (different club)') : 'NO MATCH'}` +
            ` | "${m.awayTeam?.name}" -> ${awayResolved ? awayResolved.name + (awayResolved.id === awayClub.id ? ' (OUR AWAY CLUB)' : ' (different club)') : 'NO MATCH'}`
        );
      }
    }
    console.log('');
  }
}

main().catch((err) => {
  console.error('Diagnose goal_api_id resolution failed:', err);
  process.exitCode = 1;
});
