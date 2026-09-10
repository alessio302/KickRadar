// One-off manual backfill of match_events (goals/cards/substitutions) for
// already-finished UCL/UEL/UECL fixtures -- the "Spielinfo" timeline tab
// (MatchInfoTimeline in FixtureDetailOverlay.jsx, reused as-is by
// EuropaFixtureDetailOverlay.jsx once this is wired up) has no European
// data source at all today: syncLiveEvents.js's WebSocket only writes
// status/score/live_minute for European fixtures (see its own top
// comment), never match_events, and there is no European counterpart to
// syncLineups.js's own REST-fallback events fetch that domestic fixtures
// get once they finish.
//
// Deliberately NOT a scheduled job (no matching .github/workflows/*.yml
// cron, workflow_dispatch only) -- it draws from the exact same shared
// 1000/day GOAL API REST budget syncLineups.js's own domestic events fetch
// already competes for, which is the whole reason that budget has been
// unreliable. Adding this as a recurring cron would just add a second
// competitor draining it, not a fix. Run on demand instead, same
// throwaway-diagnostic-via-GitHub-Actions posture as this session's other
// one-off scripts -- cheap for what it covers today (currently-finished
// UCL fixtures = ~24 REST calls total, 3 endpoints x 8 fixtures) since it
// only ever processes a fixture once (events_synced_at gates every
// candidate the exact same way it does in syncLineups.js).
//
// Reuses buildEventRows()'s exact goal/card/substitution normalization
// logic from syncLineups.js (own-goal detection via the "(o.g.)" suffix,
// red/yellow card typing, "OUT | IN" substitution splitting) -- only the
// side key changes, team_name instead of club_id, since European fixtures
// have no clubs table row (see syncEuropeanLineups.js's own top comment).
import { getSupabaseClient } from '../db/supabaseClient.js';
import { UEFA_COMPETITIONS } from '../config/leagues.js';
import { getLeagueFixtures, getFixtureEvents, getFixtureCards, getFixtureSubstitutions } from './goalApiClient.js';
import { namesLooselyMatch } from './syncEuropeanLineups.js';

const PAST_WINDOW_DAYS = 15; // same display window as syncLineups.js's own events backfill

function toDateString(date) {
  return date.toISOString().slice(0, 10);
}

// Same normalization as syncLineups.js's buildEventRows(), team_name in
// place of club_id -- see that file's own comment on each field.
function buildEventRows(fixtureId, homeTeamName, awayTeamName, { goals, cards, substitutions }) {
  const rows = [];

  for (const g of goals) {
    if (g.type !== 'GOAL') continue;
    const isHomeField = g.homeScorer != null;
    const rawName = isHomeField ? g.homeScorer : g.awayScorer;
    const assist = isHomeField ? g.homeAssist : g.awayAssist;
    if (!rawName) continue;
    const isOwnGoal = /\(o\.g\.\)/i.test(rawName);
    rows.push({
      fixture_id: fixtureId,
      team_name: isHomeField ? homeTeamName : awayTeamName,
      type: isOwnGoal ? 'Own Goal' : 'Goal',
      minute: String(g.time ?? ''),
      player: rawName,
      assist: assist || null,
      substituted: null,
      event_key: `goal:${g.id}`,
    });
  }

  for (const c of cards) {
    const isHomeField = c.homeFault != null;
    const player = isHomeField ? c.homeFault : c.awayFault;
    if (!player) continue;
    rows.push({
      fixture_id: fixtureId,
      team_name: isHomeField ? homeTeamName : awayTeamName,
      type: /red/i.test(c.card || '') ? 'Red Card' : 'Yellow Card',
      minute: String(c.time ?? ''),
      player,
      assist: null,
      substituted: null,
      event_key: `card:${c.id}`,
    });
  }

  for (const s of substitutions) {
    const [outName, inName] = (s.substitution || '').split('|').map((p) => p.trim());
    if (!inName) continue;
    rows.push({
      fixture_id: fixtureId,
      team_name: s.team === 'home' ? homeTeamName : awayTeamName,
      type: 'Substitution',
      minute: String(s.time ?? ''),
      player: inName,
      assist: null,
      substituted: outName || null,
      event_key: `sub:${s.id}`,
    });
  }

  return rows;
}

async function backfillEuropeanMatchEvents() {
  const supabase = getSupabaseClient();
  const pastCutoff = new Date(Date.now() - PAST_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: dbLeagues, error: leaguesErr } = await supabase
    .from('leagues')
    .select('id, slug')
    .in('slug', UEFA_COMPETITIONS.map((c) => c.slug));
  if (leaguesErr) throw leaguesErr;
  const leagueIds = dbLeagues.map((l) => l.id);
  const compBySlug = new Map(UEFA_COMPETITIONS.map((c) => [c.slug, c]));
  const slugByLeagueId = new Map(dbLeagues.map((l) => [l.id, l.slug]));

  const { data: candidates, error: candErr } = await supabase
    .from('fixtures')
    .select('id, league_id, home_team_name, away_team_name, kickoff_at, goal_api_id')
    .in('league_id', leagueIds)
    .eq('status', 'finished')
    .is('events_synced_at', null)
    .gte('kickoff_at', pastCutoff);
  if (candErr) throw candErr;
  if (candidates.length === 0) return { checked: 0, eventsFetched: 0 };

  // Group by (competition, date) -- one getLeagueFixtures() call resolves
  // every candidate in that group missing a cached goal_api_id, same
  // pattern as syncLineups.js's own domestic grouping.
  const groups = new Map();
  for (const f of candidates) {
    const slug = slugByLeagueId.get(f.league_id);
    const comp = compBySlug.get(slug);
    if (!comp) continue;
    const dateStr = toDateString(new Date(f.kickoff_at));
    const key = `${comp.slug}|${dateStr}`;
    if (!groups.has(key)) groups.set(key, { comp, dateStr, fixtures: [] });
    groups.get(key).fixtures.push(f);
  }

  let checked = 0;
  let eventsFetched = 0;

  for (const { comp, dateStr, fixtures: groupFixtures } of groups.values()) {
    const needsResolution = groupFixtures.some((f) => !f.goal_api_id);
    let apiFixtures = null;
    if (needsResolution) {
      try {
        apiFixtures = await getLeagueFixtures(comp.goalApiLeagueId, dateStr);
      } catch (err) {
        console.error(`GOAL API fixtures failed for ${comp.slug} ${dateStr}:`, err.message);
      }
    }

    for (const f of groupFixtures) {
      let goalApiId = f.goal_api_id;
      if (!goalApiId) {
        if (!apiFixtures) continue;
        const match = apiFixtures.find(
          (m) => namesLooselyMatch(m.homeTeam?.name, f.home_team_name) && namesLooselyMatch(m.awayTeam?.name, f.away_team_name)
        );
        if (!match) {
          console.warn(`Could not resolve GOAL API id for fixture ${f.id} (${f.home_team_name} vs ${f.away_team_name})`);
          continue;
        }
        goalApiId = String(match.id);
        const { error: cacheErr } = await supabase.from('fixtures').update({ goal_api_id: goalApiId }).eq('id', f.id);
        if (cacheErr) console.error(`Failed to cache goal_api_id for fixture ${f.id}:`, cacheErr.message);
      }

      checked += 1;
      let goals, cards, substitutions;
      try {
        [goals, cards, substitutions] = await Promise.all([
          getFixtureEvents(goalApiId),
          getFixtureCards(goalApiId),
          getFixtureSubstitutions(goalApiId),
        ]);
      } catch (err) {
        console.error(`GOAL API events/cards/substitutions failed for fixture ${f.id} (goalApiId ${goalApiId}):`, err.message);
        continue;
      }

      const rows = buildEventRows(f.id, f.home_team_name, f.away_team_name, { goals, cards, substitutions });
      const { error: deleteErr } = await supabase.from('match_events').delete().eq('fixture_id', f.id);
      if (deleteErr) console.error(`Failed to clear existing events for fixture ${f.id}:`, deleteErr.message);
      if (rows.length > 0) {
        const { error: eventsErr } = await supabase.from('match_events').upsert(rows, { onConflict: 'fixture_id,event_key' });
        if (eventsErr) console.error(`Failed to store events for fixture ${f.id}:`, eventsErr.message);
      }
      const { error: markErr } = await supabase.from('fixtures').update({ events_synced_at: new Date().toISOString() }).eq('id', f.id);
      if (markErr) console.error(`Failed to mark events_synced_at for fixture ${f.id}:`, markErr.message);
      else eventsFetched += 1;
      console.log(`${f.home_team_name} vs ${f.away_team_name}: ${rows.length} events stored.`);
    }
  }

  return { checked, eventsFetched };
}

const isMain = process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href;
if (isMain) {
  backfillEuropeanMatchEvents()
    .then((result) => console.log('European match-events backfill complete:', result))
    .catch((err) => {
      console.error('European match-events backfill failed:', err);
      process.exitCode = 1;
    });
}
