// User-reported (2026-09-18, screenshot): Espanyol vs Elche's match-events
// timeline showed every goal/card duplicated exactly once (2 copies each,
// never 3+), except the single most-recent goal. A subagent investigation
// found matchEventsReconciler.js's isSameEvent() (the only cross-writer
// dedup mechanism -- the DB's own unique(fixture_id, event_key) constraint
// can never catch this, since the WS and REST writers use disjoint key
// namespaces by design) compares type-family + exact `player` string
// equality + `substituted` + minute-with-tolerance, with ZERO string
// normalization on `player`. Working theory: the WS path's `player` value
// (sourced from GOAL API's live WS payload, which this repo's own comments
// say "mirrors GoalServe's schema") and the REST path's `player` value
// (GOAL API's own REST wrapper) differ in some invisible way for the same
// real person -- whitespace, punctuation, accent encoding -- causing
// isSameEvent() to return false and both writers to independently insert
// their "own" row for what's really one event.
//
// This dumps every match_events row for fixtures with visible duplicates
// (same fixture_id + type + player, minute within a few of each other),
// with JSON.stringify (exposes literal whitespace) and character codes,
// to find the exact byte-level difference before patching isSameEvent()/
// the row builders.
import { getSupabaseClient } from '../db/supabaseClient.js';

function charCodes(str) {
  if (str == null) return null;
  return [...str].map((c) => c.charCodeAt(0));
}

async function main() {
  const supabase = getSupabaseClient();

  // Look at today's and yesterday's fixtures broadly -- duplicates could
  // be sitting in any recently-live/finished match, not just the one in
  // the screenshot.
  const since = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
  const { data: events, error } = await supabase
    .from('match_events')
    .select('id, fixture_id, club_id, team_name, type, minute, player, assist, substituted, event_key, created_at')
    .gte('created_at', since)
    .order('fixture_id', { ascending: true })
    .order('player', { ascending: true });
  if (error) throw error;

  console.log(`${events.length} match_events rows created in the last 2 days.\n`);

  const byFixture = new Map();
  for (const e of events) {
    if (!byFixture.has(e.fixture_id)) byFixture.set(e.fixture_id, []);
    byFixture.get(e.fixture_id).push(e);
  }

  for (const [fixtureId, rows] of byFixture) {
    // Group by (typeFamily-ish, player) to spot likely duplicates within this fixture.
    const groups = new Map();
    for (const r of rows) {
      const key = `${r.type === 'Own Goal' || r.type === 'Penalty' ? 'Goal' : r.type}|${r.player}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(r);
    }
    const dupGroups = [...groups.entries()].filter(([, rs]) => rs.length > 1);
    if (dupGroups.length === 0) continue;

    console.log(`=== fixture ${fixtureId}: ${dupGroups.length} duplicate-looking group(s) ===`);
    for (const [key, rs] of dupGroups) {
      console.log(`  group ${key}:`);
      for (const r of rs) {
        console.log(
          `    id=${r.id} type=${JSON.stringify(r.type)} minute=${JSON.stringify(r.minute)} player=${JSON.stringify(r.player)} assist=${JSON.stringify(r.assist)} substituted=${JSON.stringify(r.substituted)} event_key=${JSON.stringify(r.event_key)} club_id=${r.club_id} team_name=${JSON.stringify(r.team_name)} created_at=${r.created_at}`
        );
        console.log(`      player charCodes=${JSON.stringify(charCodes(r.player))}`);
      }
    }
    console.log('');
  }

  if ([...byFixture.values()].every((rs) => {
    const groups = new Map();
    for (const r of rs) {
      const key = `${r.type === 'Own Goal' || r.type === 'Penalty' ? 'Goal' : r.type}|${r.player}`;
      groups.set(key, (groups.get(key) ?? 0) + 1);
    }
    return [...groups.values()].every((c) => c === 1);
  })) {
    console.log('No duplicate-looking groups found in the last 2 days of match_events.');
  }
}

main().catch((err) => {
  console.error('Diagnose match events duplication failed:', err);
  process.exitCode = 1;
});
