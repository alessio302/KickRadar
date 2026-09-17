// Read-only: user reported only 2 of Udinese's goals against Inter pushed a
// notification during the last meeting. Checks, for that specific fixture:
//   1. the recorded score vs. the number of Goal/Own Goal/Penalty rows in
//      match_events for Udinese's club_id -- a shortfall here would mean a
//      real goal never even got a match_events row (matchEventsReconciler.js's
//      content-key dedup -- type|minute|player -- silently treating two
//      distinct goals as the same event), not a push-layer bug.
//   2. for whatever Goal rows DO exist, whether notified_match_events has a
//      claim row for each -- a shortfall here (goals stored, but not all
//      claimed) would point at sendPush.js / notifyFavoritedFixtureEvents
//      itself instead.
//   3. favorite_fixtures count for the fixture, since notifyFavoritedFixtureEvents
//      short-circuits to a no-op with zero favoriters.
import { getSupabaseClient } from '../db/supabaseClient.js';

async function main() {
  const supabase = getSupabaseClient();

  const { data: clubs, error: clubsErr } = await supabase
    .from('clubs')
    .select('id, name, short_name, league_id')
    .or('name.ilike.%udinese%,name.ilike.%inter%,short_name.ilike.%udinese%,short_name.ilike.%inter%');
  if (clubsErr) throw clubsErr;
  console.log('Matching clubs:', clubs.map((c) => `${c.id}:${c.name}`));

  const udinese = clubs.find((c) => /udinese/i.test(c.name));
  const inter = clubs.find((c) => /^inter($|\s)|inter milan|internazionale/i.test(c.name));
  if (!udinese || !inter) {
    console.log('Could not confidently resolve both clubs, aborting.');
    return;
  }
  console.log('Resolved:', { udinese: udinese.id, inter: inter.id });

  const { data: fixtures, error: fixturesErr } = await supabase
    .from('fixtures')
    .select('id, kickoff_at, status, home_club_id, away_club_id, home_score, away_score')
    .or(
      `and(home_club_id.eq.${udinese.id},away_club_id.eq.${inter.id}),and(home_club_id.eq.${inter.id},away_club_id.eq.${udinese.id})`
    )
    .order('kickoff_at', { ascending: false })
    .limit(5);
  if (fixturesErr) throw fixturesErr;
  console.log('Recent Inter-Udinese fixtures:', fixtures);

  // .order(kickoff_at desc) alone can surface a future rematch (e.g. next
  // season's already-scheduled fixture) ahead of the one actually just
  // played -- what the user means by "the last Inter game" is the most
  // recent FINISHED one, not merely the most recent row.
  const fixture = fixtures.find((f) => f.status === 'finished');
  if (!fixture) {
    console.log('No finished Inter-Udinese fixture found.');
    return;
  }

  const udineseIsHome = fixture.home_club_id === udinese.id;
  const udineseScore = udineseIsHome ? fixture.home_score : fixture.away_score;
  console.log(`\n=== Fixture ${fixture.id} (${fixture.kickoff_at}, status=${fixture.status}) ===`);
  console.log(`Udinese recorded score: ${udineseScore}`);

  const { data: events, error: eventsErr } = await supabase
    .from('match_events')
    .select('id, club_id, team_name, type, minute, player, assist, substituted, event_key')
    .eq('fixture_id', fixture.id)
    .order('id', { ascending: true });
  if (eventsErr) throw eventsErr;

  const udineseGoalTypes = new Set(['Goal', 'Own Goal', 'Penalty']);
  const udineseGoals = events.filter((e) => e.club_id === udinese.id && udineseGoalTypes.has(e.type));
  console.log(`\nmatch_events rows for Udinese goals (${udineseGoals.length}):`);
  for (const g of udineseGoals) console.log(` - ${g.type} ${g.minute}' ${g.player} (event_key=${g.event_key})`);

  if (udineseGoals.length !== udineseScore) {
    console.log(
      `\n!!! MISMATCH: fixtures.${udineseIsHome ? 'home_score' : 'away_score'}=${udineseScore} but only ${udineseGoals.length} Goal-type match_events rows exist for Udinese. A real goal likely never got its own row (content-key dedup collision in matchEventsReconciler.js, or an event type/side classification miss).`
    );
  } else {
    console.log('\nGoal row count matches recorded score -- all goals ARE stored in match_events.');
  }

  // Content-key collision check across ALL of this fixture's events (not
  // just Udinese's), same formula matchEventsReconciler.js's contentKey()
  // uses -- a collision here is the smoking gun for "two real events
  // silently merged into one row".
  const byContentKey = new Map();
  for (const e of events) {
    const key = `${e.type}|${e.minute}|${e.player}|${e.substituted ?? ''}`;
    if (!byContentKey.has(key)) byContentKey.set(key, []);
    byContentKey.get(key).push(e);
  }
  const collisions = [...byContentKey.entries()].filter(([, rows]) => rows.length > 1);
  console.log(`\nContent-key collisions across all events for this fixture: ${collisions.length}`);
  for (const [key, rows] of collisions) console.log(` - ${key}: ${rows.length} rows (ids ${rows.map((r) => r.id).join(',')})`);

  const { count: favCount, error: favErr } = await supabase
    .from('favorite_fixtures')
    .select('id', { count: 'exact', head: true })
    .eq('fixture_id', fixture.id);
  if (favErr) throw favErr;
  console.log(`\nfavorite_fixtures count for this fixture: ${favCount}`);

  const { data: notified, error: notifiedErr } = await supabase
    .from('notified_match_events')
    .select('event_key')
    .eq('fixture_id', fixture.id);
  if (notifiedErr) throw notifiedErr;
  const notifiedKeys = new Set((notified ?? []).map((n) => n.event_key));
  console.log(`\nnotified_match_events rows for this fixture: ${notifiedKeys.size}`);

  console.log('\nPer-Udinese-goal claim status:');
  for (const g of udineseGoals) {
    console.log(` - ${g.type} ${g.minute}' ${g.player}: claimed=${notifiedKeys.has(g.event_key)}`);
  }

  const unclaimed = udineseGoals.filter((g) => !notifiedKeys.has(g.event_key));
  if (unclaimed.length > 0) {
    console.log(
      `\n!!! ${unclaimed.length} Udinese goal row(s) exist in match_events but were NEVER claimed in notified_match_events -- these never triggered sendPushToFixtureFavoriters at all (a bug/exception in notifyFavoritedFixtureEvents, or the insert claim itself failing silently).`
    );
  }
}

main().catch((err) => {
  console.error('Diagnostic failed:', err);
  process.exitCode = 1;
});
