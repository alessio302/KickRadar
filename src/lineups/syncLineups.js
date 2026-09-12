import { getSupabaseClient } from '../db/supabaseClient.js';
import { fetchAllRows } from '../db/fetchAllRows.js';
import { LEAGUES } from '../config/leagues.js';
import { getLeagueFixtures, getFixtureLineups, getFixtureEvents, getFixtureCards, getFixtureSubstitutions } from './goalApiClient.js';
import { teamIsPopulated, buildLineupTeam } from './lineupShape.js';
import { resolveClub } from '../news/clubMatch.js';
import { normalize } from '../util/normalize.js';
import { sendPushToLineupSubscribers } from '../push/sendPush.js';
import { pushStringsFor, SUPPORTED_PUSH_LANGUAGES } from '../push/pushI18n.js';
import { notifyFavoritedFixtureEvents } from './matchEventNotifier.js';

// Confirmed live (Kazakhstan Premier League, 2026-08-25, still true after
// switching providers from Highlightly to GOAL API): a real lineup becomes
// available right around kickoff, not necessarily the full "30 min before"
// a provider's own docs describe -- and a fixture is worth re-checking a
// bit past kickoff too, since the two sides don't always submit at exactly
// the same time. Wide enough to catch that without polling fixtures that
// are nowhere close yet.
//
// LOOKBACK_MIN confirmed live (Liverpool vs Nottingham Forest, 2026-08-29)
// to matter well beyond "a bit past kickoff": a single missed or
// rate-limited run right around kickoff dropped the fixture out of this
// window entirely for the rest of the match (this file has no in-run
// retry for a failed GOAL API call, unlike playerProfileResolver.js) --
// its lineup then only backfilled once the match reached "finished" and
// re-entered via finishedRecent below. 90 min instead of 20 keeps a
// still-live, still-unconfirmed fixture in scope for another attempt on
// every run through most of normal match length, rather than depending on
// one run inside a narrow 20-minute band succeeding.
const LOOKAHEAD_MIN = 45;
const LOOKBACK_MIN = 90;

// Separate, much tighter cutoff than PAST_WINDOW_DAYS below -- that window
// exists for the EVENTS backfill, which already has its own proper stop
// condition (events_synced_at, set once and never re-checked). Lineup
// confirmation had no such gate at all: a finished fixture whose lineup
// GOAL API simply never populates (a genuine data gap, not a timing issue)
// stayed "pending" for the full 15-day window, costing a fresh
// getFixtureLineups() call -- and keeping its whole league/date group's
// getLeagueFixtures() call alive too -- on every single 15-minute run,
// forever. 6 hours is well past any plausible late-submission delay (real
// lineups confirm within minutes of kickoff, per this file's own top
// comment); a fixture past this without a confirmed lineup on both sides
// is treated as one GOAL API won't ever populate, not one still pending.
const LINEUP_GIVE_UP_MIN = 360;

// Separately, also revisit any *finished* fixture within the app's own
// display window (matches web/src/hooks/useFixtures.js's PAST_WINDOW_DAYS)
// that's still missing a lineup or hasn't had its events fetched yet.
// Confirmed live: the near-kickoff window above is a one-shot pass -- a
// fixture whose lineup didn't confirm in that ~65-minute window (a delayed
// run, a late-submitting club) was never looked at again. Match resolution
// (getLeagueFixtures, grouped by league+date) is shared between the
// lineup and events work below, so this doesn't double the request cost
// of covering both.
const PAST_WINDOW_DAYS = 15;

function toDateString(date) {
  return date.toISOString().slice(0, 10);
}

function confirmedKey(fixtureId, clubId) {
  return `${fixtureId}:${clubId}`;
}

// Normalizes GOAL API's 3 separate endpoints (events=goals only, cards,
// substitutions -- confirmed live there's no single call that returns all
// three) into this app's existing match_events row shape, unchanged since
// the Highlightly era so the frontend (FixtureDetailOverlay.jsx) needs no
// changes for the provider swap. event_key uses GOAL API's own row id
// (stable, confirmed live) rather than reconstructing a synthetic key from
// field values.
function buildEventRows(fixtureId, homeClubId, awayClubId, { goals, cards, substitutions }) {
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
      club_id: isHomeField ? homeClubId : awayClubId,
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
      club_id: isHomeField ? homeClubId : awayClubId,
      type: /red/i.test(c.card || '') ? 'Red Card' : 'Yellow Card',
      minute: String(c.time ?? ''),
      player,
      assist: null,
      substituted: null,
      event_key: `card:${c.id}`,
    });
  }

  for (const s of substitutions) {
    // "OUT | IN" per GOAL API's own docs -- confirmed live
    // (substitution: "N. Brown | I. Saibari").
    const [outName, inName] = (s.substitution || '').split('|').map((p) => p.trim());
    if (!inName) continue;
    rows.push({
      fixture_id: fixtureId,
      club_id: s.team === 'home' ? homeClubId : awayClubId,
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

export async function syncLineups() {
  const supabase = getSupabaseClient();
  const now = new Date();
  const windowStart = new Date(now.getTime() - LOOKBACK_MIN * 60000).toISOString();
  const windowEnd = new Date(now.getTime() + LOOKAHEAD_MIN * 60000).toISOString();
  const pastCutoff = new Date(now.getTime() - PAST_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: nearKickoff, error: nkErr } = await supabase
    .from('fixtures')
    .select('id, league_id, home_club_id, away_club_id, kickoff_at, status, events_synced_at, goal_api_id')
    .gte('kickoff_at', windowStart)
    .lte('kickoff_at', windowEnd);
  if (nkErr) throw nkErr;

  const { data: finishedRecent, error: frErr } = await supabase
    .from('fixtures')
    .select('id, league_id, home_club_id, away_club_id, kickoff_at, status, events_synced_at, goal_api_id')
    .eq('status', 'finished')
    .gte('kickoff_at', pastCutoff);
  if (frErr) throw frErr;

  // Separate from nearKickoff above (which is scoped to LOOKBACK_MIN/
  // LOOKAHEAD_MIN around kickoff_at, sized for lineup confirmation, not for
  // covering a whole match) -- a fixture deep into a long second half, extra
  // time, or one this job simply hasn't run for in a while could already
  // have drifted outside that window while still genuinely 'live'. Explicit
  // status filter instead, so eventsNeeded()'s own live-events refresh below
  // never depends on kickoff timing at all.
  const { data: currentlyLive, error: liveErr } = await supabase
    .from('fixtures')
    .select('id, league_id, home_club_id, away_club_id, kickoff_at, status, events_synced_at, goal_api_id')
    .eq('status', 'live');
  if (liveErr) throw liveErr;

  const nearKickoffIds = new Set(nearKickoff.map((f) => f.id));
  const fixturesById = new Map();
  for (const f of [...nearKickoff, ...finishedRecent, ...currentlyLive]) fixturesById.set(f.id, f);
  const candidates = [...fixturesById.values()];
  if (candidates.length === 0) return { checked: 0, confirmed: 0, eventsFetched: 0 };

  // Skip fixtures whose lineups are already fully confirmed for both
  // sides -- no point spending free-tier requests re-checking something
  // that won't change.
  const { data: existingLineups, error: existingErr } = await supabase
    .from('lineups')
    .select('fixture_id, club_id, confirmed')
    .in(
      'fixture_id',
      candidates.map((f) => f.id)
    );
  if (existingErr) throw existingErr;
  const alreadyConfirmed = new Set(
    existingLineups.filter((r) => r.confirmed).map((r) => confirmedKey(r.fixture_id, r.club_id))
  );

  const lineupNeeded = (f) => {
    const bothConfirmed =
      alreadyConfirmed.has(confirmedKey(f.id, f.home_club_id)) && alreadyConfirmed.has(confirmedKey(f.id, f.away_club_id));
    if (bothConfirmed) return false;
    const minutesSinceKickoff = (now.getTime() - new Date(f.kickoff_at).getTime()) / 60000;
    return minutesSinceKickoff <= LINEUP_GIVE_UP_MIN;
  };
  // User-reported: goals/cards/subs sometimes just never arrived during a
  // live match, sitting missing for the rest of it -- confirmed live
  // (2026-09-12, Real Madrid vs Rayo Vallecano) that GOAL API's own REST
  // view already had a goal syncLiveEvents.js's WebSocket never wrote,
  // despite that connection being otherwise healthy (a different match on
  // the same connection kept updating fine). That WS is inherently a best-
  // effort push with no delivery guarantee and, per this file's own
  // buildEventRows comment, no stable per-event id to reconcile against --
  // rather than chasing each new way it can silently drop something with
  // another bespoke watchdog, a 'live' fixture now gets the exact same
  // authoritative REST fetch + full-replace treatment as a freshly-finished
  // one below, just repeated on every run instead of once. Bounds any WS
  // gap, whatever its cause, to this job's own ~15min cadence instead of
  // "however long until full-time" -- unconditional (no finished-count-style
  // guard) since there's no cheap signal to know in advance whether
  // anything changed for a match still being played.
  const eventsNeeded = (f) => f.status === 'live' || (f.status === 'finished' && !f.events_synced_at);

  const pending = candidates.filter((f) => lineupNeeded(f) || eventsNeeded(f));
  // checked: 0, not candidates.length -- candidates is the raw DB query
  // result before the lineupNeeded/eventsNeeded filter, none of which cost
  // a GOAL API call by itself. Reporting it here as "checked" previously
  // made a run that made ZERO GOAL API calls print a nonzero number,
  // masking exactly the kind of already-idle run this file's own
  // early-return exists to represent accurately.
  if (pending.length === 0) return { checked: 0, confirmed: 0, eventsFetched: 0 };

  const { data: dbLeagues, error: leaguesErr } = await supabase.from('leagues').select('id, slug');
  if (leaguesErr) throw leaguesErr;
  const leagueSlugById = new Map(dbLeagues.map((l) => [l.id, l.slug]));

  const { data: allClubs, error: clubsErr } = await supabase.from('clubs').select('id, name, short_name, aliases, league_id');
  if (clubsErr) throw clubsErr;
  const clubById = new Map(allClubs.map((c) => [c.id, c]));

  // Backs lineupShape.js's resolvePosition callback -- players.position
  // (football-data.org, treated as authoritative everywhere else in the
  // app) overrides GOAL API's own per-match lineup tag for the same
  // player, see that file's own comment on why. goal_api_id first since
  // it's a stable id; normalized name as a fallback for a player only
  // ever resolved that way (not every players row has goal_api_id set).
  // fetchAllRows(), not a plain .select() -- confirmed live (2026-09-12,
  // same class of bug as syncPlayerProfiles.js's own fix on 2026-09-06):
  // players has grown well past PostgREST's default 1000-row response cap,
  // so an unpaginated select here silently missed most of the table --
  // this resolvePosition lookup returned nothing for any player outside
  // whatever arbitrary first page came back, leaving their lineup entry on
  // GOAL API's own tag instead of being corrected.
  const allPlayers = await fetchAllRows(supabase, 'players', 'goal_api_id, normalized_name, position');
  const positionByGoalApiId = new Map(allPlayers.filter((p) => p.goal_api_id).map((p) => [p.goal_api_id, p.position]));
  const positionByNormalizedName = new Map(allPlayers.filter((p) => p.position).map((p) => [p.normalized_name, p.position]));
  const resolvePosition = (entry) =>
    (entry.playerId && positionByGoalApiId.get(entry.playerId)) ||
    (entry.lineupPlayer && positionByNormalizedName.get(normalize(entry.lineupPlayer))) ||
    null;

  let checked = 0;
  let confirmedCount = 0;
  let eventsFetched = 0;
  const newlyConfirmedFixtures = [];

  // Group by (league, date) -- one GOAL API fixtures call covers every
  // pending fixture in that league on that date, instead of one call per
  // fixture. Simpler than the old Highlightly grouping (by country+date,
  // since Highlightly's /matches was country-scoped): GOAL API's fixtures
  // endpoint is already scoped to one league, and our own league_id maps
  // 1:1 to it via LEAGUES' goalApiLeagueId.
  const groups = new Map();
  for (const f of pending) {
    const leagueSlug = leagueSlugById.get(f.league_id);
    const league = LEAGUES.find((l) => l.slug === leagueSlug);
    if (!league) continue;
    const dateStr = toDateString(new Date(f.kickoff_at));
    const key = `${league.slug}|${dateStr}`;
    if (!groups.has(key)) groups.set(key, { league, dateStr, fixtures: [] });
    groups.get(key).fixtures.push(f);
  }

  for (const { league, dateStr, fixtures: groupFixtures } of groups.values()) {
    const leagueClubs = allClubs.filter((c) => c.league_id === groupFixtures[0]?.league_id);

    // Cached in fixtures.goal_api_id (048_fixtures_goal_api_id.sql), same
    // column syncLiveEvents.js's resolveGoalApiIds() writes -- a fixture's
    // GOAL API id never changes once resolved, so this file's own
    // getLeagueFixtures() call (previously made unconditionally, every
    // 15-min run, for every group with anything still pending) only
    // actually runs when the group has at least one fixture this file (or
    // syncLiveEvents.js, while the match was live) hasn't already resolved.
    const needsResolution = groupFixtures.some((f) => !f.goal_api_id);
    let apiFixtures = null;
    if (needsResolution) {
      try {
        apiFixtures = await getLeagueFixtures(league.goalApiLeagueId, dateStr);
      } catch (err) {
        console.error(`GOAL API fixtures failed for ${league.slug} ${dateStr}:`, err.message);
      }
    }

    for (const f of groupFixtures) {
      const homeClub = clubById.get(f.home_club_id);
      const awayClub = clubById.get(f.away_club_id);
      if (!homeClub || !awayClub) continue;

      let goalApiId = f.goal_api_id;
      if (!goalApiId) {
        if (!apiFixtures) continue; // resolution needed but failed (or wasn't attempted) this run
        const match = apiFixtures.find((m) => {
          const homeMatch = resolveClub(m.homeTeam?.name, leagueClubs)?.id === homeClub.id;
          const awayMatch = resolveClub(m.awayTeam?.name, leagueClubs)?.id === awayClub.id;
          return homeMatch && awayMatch;
        });
        if (!match) continue;
        goalApiId = String(match.id);
        // Best-effort: a failed write here only costs re-resolving this one
        // fixture again next run, never lost lineup/events coverage for it.
        const { error: cacheErr } = await supabase.from('fixtures').update({ goal_api_id: goalApiId }).eq('id', f.id);
        if (cacheErr) console.error(`Failed to cache goal_api_id for fixture ${f.id}:`, cacheErr.message);
      }

      checked += 1;

      if (lineupNeeded(f)) {
        let lineups;
        try {
          lineups = await getFixtureLineups(goalApiId);
        } catch (err) {
          console.error(`GOAL API lineups failed for match ${goalApiId}:`, err.message);
          lineups = null;
        }

        if (lineups?.hasLineups) {
          const homeTeam = buildLineupTeam(lineups.home, lineups.homeFormation, resolvePosition);
          const awayTeam = buildLineupTeam(lineups.away, lineups.awayFormation, resolvePosition);
          if (homeTeam) homeTeam.formation = lineups.homeFormation || null;
          if (awayTeam) awayTeam.formation = lineups.awayFormation || null;

          // Pushes once per fixture per run when it goes from "not
          // confirmed" to "at least one side confirmed" -- known, accepted
          // gap: if the two sides' sheets land in different runs a few
          // minutes apart, this can send a second push for the same
          // fixture. Rare (both sides usually submit close together) and
          // low-cost compared to the complexity of suppressing it. Only
          // fixtures near their actual kickoff are push-worthy -- a
          // fixture only picked up here because it's an older backfill
          // target would otherwise fire a push about a days-old lineup.
          let fixtureNewlyConfirmed = false;
          for (const { club, team } of [
            { club: homeClub, team: homeTeam },
            { club: awayClub, team: awayTeam },
          ]) {
            if (!teamIsPopulated(team)) continue;
            const wasConfirmed = alreadyConfirmed.has(confirmedKey(f.id, club.id));
            const { error: upsertErr } = await supabase.from('lineups').upsert(
              {
                fixture_id: f.id,
                club_id: club.id,
                confirmed: true,
                formation: team.formation,
                players: { initialLineup: team.initialLineup, substitutes: team.substitutes, coach: team.coach },
                published_at: new Date().toISOString(),
              },
              { onConflict: 'fixture_id,club_id' }
            );
            if (upsertErr) {
              console.error(`Failed to store lineup for fixture ${f.id} club ${club.id}:`, upsertErr.message);
              continue;
            }
            confirmedCount += 1;
            if (!wasConfirmed) fixtureNewlyConfirmed = true;
          }
          if (fixtureNewlyConfirmed && nearKickoffIds.has(f.id)) {
            newlyConfirmedFixtures.push({ fixtureId: f.id, homeClub, awayClub, leagueSlug: league.slug });
          }
        }
      }

      if (eventsNeeded(f)) {
        let goals, cards, substitutions;
        try {
          [goals, cards, substitutions] = await Promise.all([
            getFixtureEvents(goalApiId),
            getFixtureCards(goalApiId),
            getFixtureSubstitutions(goalApiId),
          ]);
        } catch (err) {
          console.error(`GOAL API events/cards/substitutions failed for match ${goalApiId}:`, err.message);
          goals = null;
        }

        if (goals) {
          const rows = buildEventRows(f.id, homeClub.id, awayClub.id, { goals, cards, substitutions });
          // Full replace, not merge: src/lineups/syncLiveEvents.js may have
          // already written rows for this fixture while it was live, keyed
          // by content (its WS payload has no stable per-event id, unlike
          // these REST endpoints) -- clearing first guarantees the row set
          // ends up exactly matching GOAL API's own REST data, with no
          // leftover WS-only duplicates sitting alongside it. Runs on every
          // tick for a still-'live' fixture now (see eventsNeeded() above),
          // not just once at full-time -- each pass is a clean, independent
          // "replace with current REST truth", so repeating it mid-match is
          // exactly as safe as the original once-at-finish call, just more
          // frequent.
          const { error: deleteErr } = await supabase.from('match_events').delete().eq('fixture_id', f.id);
          if (deleteErr) console.error(`Failed to clear existing events for fixture ${f.id}:`, deleteErr.message);
          if (rows.length > 0) {
            const { error: eventsErr } = await supabase.from('match_events').upsert(rows, { onConflict: 'fixture_id,event_key' });
            if (eventsErr) console.error(`Failed to store events for fixture ${f.id}:`, eventsErr.message);
            else {
              // Now safe to call from here (previously deliberately never
              // was, see matchEventNotifier.js's own comment on why): that
              // restriction only existed because a domestic fixture's live
              // goals could still be sitting in match_events under
              // syncLiveEvents.js's own different event_key scheme, so
              // notifying again here with these rows' own keys would have
              // re-notified everything a second time right as the match
              // ended. Domestic fixtures have exactly one match_events
              // writer now -- this one, live or finished alike -- so
              // notified_match_events' own (fixture_id, event_key)
              // insert-as-claim naturally covers both without ever
              // double-notifying the same real event.
              try {
                await notifyFavoritedFixtureEvents(supabase, f.id, league.slug, rows);
              } catch (err) {
                console.error(`Failed to notify favorited-fixture events for fixture ${f.id}:`, err.message);
              }
            }
          }
          // events_synced_at is a permanent "this fixture is fully and
          // finally done, never fetch again" flag (see this file's own top
          // comment on LINEUP_GIVE_UP_MIN/PAST_WINDOW_DAYS) -- eventsNeeded()
          // doesn't even consult it for a 'live' fixture, so setting it here
          // wouldn't currently change this run's own behavior, but it would
          // still be a lie: the fixture isn't done, it's still being played.
          // Reserved for the one point that's actually true, same as before
          // this change -- the moment status flips to 'finished'.
          if (f.status === 'finished') {
            const { error: markErr } = await supabase
              .from('fixtures')
              .update({ events_synced_at: new Date().toISOString() })
              .eq('id', f.id);
            if (markErr) console.error(`Failed to mark events_synced_at for fixture ${f.id}:`, markErr.message);
            else eventsFetched += 1;
          } else {
            eventsFetched += 1;
          }
        }
      }
    }
  }

  const pushResults = [];
  for (const { fixtureId, homeClub, awayClub, leagueSlug } of newlyConfirmedFixtures) {
    try {
      // Club names stay untranslated (same policy as everywhere else in
      // the app); only the "Aufstellung bestätigt"/"Lineup confirmed"/...
      // title varies per subscriber's stored language -- see
      // push_subscriptions.language / sendPushToLineupSubscribers.
      const byLanguage = {};
      for (const lang of SUPPORTED_PUSH_LANGUAGES) {
        byLanguage[lang] = {
          title: pushStringsFor(lang).lineupTitle,
          body: `${homeClub.name} vs ${awayClub.name}`,
          url: `/?league=${leagueSlug}&fixture=${fixtureId}`,
        };
      }
      pushResults.push(await sendPushToLineupSubscribers(byLanguage));
    } catch (err) {
      console.error('Lineup push send failed:', err.message);
    }
  }

  return {
    checked,
    confirmed: confirmedCount,
    eventsFetched,
    newlyConfirmedFixtures: newlyConfirmedFixtures.length,
    pushResults,
  };
}

const isMain = process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href;
if (isMain) {
  syncLineups()
    .then((result) => console.log('Lineup sync complete:', result))
    .catch((err) => {
      console.error('Lineup sync failed:', err);
      process.exitCode = 1;
    });
}
