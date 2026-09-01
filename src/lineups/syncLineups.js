import { getSupabaseClient } from '../db/supabaseClient.js';
import { LEAGUES } from '../config/leagues.js';
import { getLeagueFixtures, getFixtureLineups, getFixtureEvents, getFixtureCards, getFixtureSubstitutions } from './goalApiClient.js';
import { resolveClub } from '../news/clubMatch.js';
import { sendPushToLineupSubscribers } from '../push/sendPush.js';
import { pushStringsFor, SUPPORTED_PUSH_LANGUAGES } from '../push/pushI18n.js';

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

function teamIsPopulated(team) {
  return Array.isArray(team?.initialLineup) && team.initialLineup.length > 0;
}

function confirmedKey(fixtureId, clubId) {
  return `${fixtureId}:${clubId}`;
}

// GOAL API's own singular/plural mismatch with this app's existing
// position keys (web/src/i18n/translations.js's t.lineup.positions,
// inherited from Highlightly's enum) -- confirmed live GOAL API returns
// "Goalkeepers"/"Defenders"/"Midfielders"/"Forwards" (plural) per player,
// not the singular keys the frontend already translates. Normalized here
// so the frontend contract doesn't need to change for a provider swap.
const POSITION_SINGULAR = {
  Goalkeepers: 'Goalkeeper',
  Defenders: 'Defender',
  Midfielders: 'Midfielder',
  Forwards: 'Forward',
};
const ROW_ORDER = ['Goalkeeper', 'Defender', 'Midfielder', 'Forward'];

function normalizePlayer(entry) {
  return {
    id: entry.playerId,
    name: entry.lineupPlayer,
    number: entry.lineupNumber ? Number(entry.lineupNumber) : null,
    position: POSITION_SINGULAR[entry.playerPosition] || entry.playerPosition || null,
    // Confirmed live: every lineup entry already carries this (GOAL API's
    // own CDN, e.g. https://media.goal-api.com/badges/players/96401_j-garcia.jpg)
    // -- no separate /players/:id call needed per player the way
    // playerProfileResolver.js needs for transfer stories.
    photo: entry.playerImage || null,
  };
}

// GOAL API's lineup entries are a flat list (confirmed live), not
// pre-grouped by formation line the way Highlightly's initialLineup was.
// Bucketing into the 4 broad position categories (GK/DF/MF/FW), rather
// than also splitting by the formation string's own sub-lines (e.g.
// "4-2-3-1"'s 2 defensive mid + 3 attacking mid), is a deliberate
// simplification: correct player membership, just one row per category
// instead of matching the exact tactical shape -- PitchFormation
// (FixtureDetailOverlay.jsx) renders whatever rows it's given either way.
function groupByPositionRows(entries) {
  const players = (entries ?? []).map(normalizePlayer);
  return ROW_ORDER.map((pos) => players.filter((p) => p.position === pos)).filter((row) => row.length > 0);
}

function buildLineupTeam(section) {
  if (!section) return null;
  return {
    formation: null, // set by the caller from homeFormation/awayFormation, shared per fixture not per section
    initialLineup: groupByPositionRows(section.startingLineups),
    substitutes: (section.substitutes ?? []).map(normalizePlayer),
  };
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
    .select('id, league_id, home_club_id, away_club_id, kickoff_at, status, events_synced_at')
    .gte('kickoff_at', windowStart)
    .lte('kickoff_at', windowEnd);
  if (nkErr) throw nkErr;

  const { data: finishedRecent, error: frErr } = await supabase
    .from('fixtures')
    .select('id, league_id, home_club_id, away_club_id, kickoff_at, status, events_synced_at')
    .eq('status', 'finished')
    .gte('kickoff_at', pastCutoff);
  if (frErr) throw frErr;

  const nearKickoffIds = new Set(nearKickoff.map((f) => f.id));
  const fixturesById = new Map();
  for (const f of [...nearKickoff, ...finishedRecent]) fixturesById.set(f.id, f);
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

  const lineupNeeded = (f) =>
    !(alreadyConfirmed.has(confirmedKey(f.id, f.home_club_id)) && alreadyConfirmed.has(confirmedKey(f.id, f.away_club_id)));
  const eventsNeeded = (f) => f.status === 'finished' && !f.events_synced_at;

  const pending = candidates.filter((f) => lineupNeeded(f) || eventsNeeded(f));
  if (pending.length === 0) return { checked: candidates.length, confirmed: 0, eventsFetched: 0 };

  const { data: dbLeagues, error: leaguesErr } = await supabase.from('leagues').select('id, slug');
  if (leaguesErr) throw leaguesErr;
  const leagueSlugById = new Map(dbLeagues.map((l) => [l.id, l.slug]));

  const { data: allClubs, error: clubsErr } = await supabase.from('clubs').select('id, name, short_name, aliases, league_id');
  if (clubsErr) throw clubsErr;
  const clubById = new Map(allClubs.map((c) => [c.id, c]));

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
    let apiFixtures;
    try {
      apiFixtures = await getLeagueFixtures(league.goalApiLeagueId, dateStr);
    } catch (err) {
      console.error(`GOAL API fixtures failed for ${league.slug} ${dateStr}:`, err.message);
      continue;
    }

    const leagueClubs = allClubs.filter((c) => c.league_id === groupFixtures[0]?.league_id);

    for (const f of groupFixtures) {
      const homeClub = clubById.get(f.home_club_id);
      const awayClub = clubById.get(f.away_club_id);
      if (!homeClub || !awayClub) continue;

      const match = apiFixtures.find((m) => {
        const homeMatch = resolveClub(m.homeTeam?.name, leagueClubs)?.id === homeClub.id;
        const awayMatch = resolveClub(m.awayTeam?.name, leagueClubs)?.id === awayClub.id;
        return homeMatch && awayMatch;
      });
      if (!match) continue;

      checked += 1;

      if (lineupNeeded(f)) {
        let lineups;
        try {
          lineups = await getFixtureLineups(match.id);
        } catch (err) {
          console.error(`GOAL API lineups failed for match ${match.id}:`, err.message);
          lineups = null;
        }

        if (lineups?.hasLineups) {
          const homeTeam = buildLineupTeam(lineups.home);
          const awayTeam = buildLineupTeam(lineups.away);
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
                players: { initialLineup: team.initialLineup, substitutes: team.substitutes },
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
            getFixtureEvents(match.id),
            getFixtureCards(match.id),
            getFixtureSubstitutions(match.id),
          ]);
        } catch (err) {
          console.error(`GOAL API events/cards/substitutions failed for match ${match.id}:`, err.message);
          goals = null;
        }

        if (goals) {
          const rows = buildEventRows(f.id, homeClub.id, awayClub.id, { goals, cards, substitutions });
          // Full replace, not merge: src/lineups/syncLiveEvents.js may have
          // already written rows for this fixture while it was live, keyed
          // by content (its WS payload has no stable per-event id, unlike
          // these REST endpoints) -- clearing first guarantees the row set
          // a finished fixture ends up with is exactly GOAL API's REST
          // data, with no leftover live-only duplicates sitting alongside it.
          const { error: deleteErr } = await supabase.from('match_events').delete().eq('fixture_id', f.id);
          if (deleteErr) console.error(`Failed to clear existing events for fixture ${f.id}:`, deleteErr.message);
          if (rows.length > 0) {
            const { error: eventsErr } = await supabase.from('match_events').upsert(rows, { onConflict: 'fixture_id,event_key' });
            if (eventsErr) console.error(`Failed to store events for fixture ${f.id}:`, eventsErr.message);
          }
          const { error: markErr } = await supabase
            .from('fixtures')
            .update({ events_synced_at: new Date().toISOString() })
            .eq('id', f.id);
          if (markErr) console.error(`Failed to mark events_synced_at for fixture ${f.id}:`, markErr.message);
          else eventsFetched += 1;
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
