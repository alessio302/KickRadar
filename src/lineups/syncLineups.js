import { getSupabaseClient } from '../db/supabaseClient.js';
import { LEAGUES } from '../config/leagues.js';
import { getMatches, getLineups, getEvents } from './highlightlyClient.js';
import { resolveClub } from '../news/clubMatch.js';
import { sendPushToLineupSubscribers } from '../push/sendPush.js';

// Highlightly's own league.name for each of our leagues -- confirmed live
// via diagnoseHighlightly.js for the original 4 (Serie A id 115669,
// Bundesliga 67162, Premier League 33973, Ligue 1 52695) and via
// diagnoseHighlightlySpain.js for La Liga (id 119924). Filtering by this
// (not just countryName) matters: each country also returns lower
// divisions, women's/youth competitions and cups sharing the same country
// (confirmed for Spain too: Segunda División, Primera División Femenina).
const HIGHLIGHTLY_LEAGUE_NAME = {
  'serie-a': 'Serie A',
  bundesliga: 'Bundesliga',
  'premier-league': 'Premier League',
  'ligue-1': 'Ligue 1',
  'la-liga': 'La Liga',
};

// Confirmed live (Kazakhstan Premier League, 2026-08-25): a real lineup
// becomes available right around kickoff, not necessarily the full
// "30 min before" Highlightly's docs describe -- and a fixture is worth
// re-checking a bit past kickoff too, since the two sides don't always
// submit at exactly the same time. Wide enough to catch that without
// polling fixtures that are nowhere close yet.
const LOOKAHEAD_MIN = 45;
const LOOKBACK_MIN = 20;

// Separately, also revisit any *finished* fixture within the app's own
// display window (matches web/src/hooks/useFixtures.js's PAST_WINDOW_DAYS)
// that's still missing a lineup or hasn't had its events fetched yet.
// Confirmed live: the near-kickoff window above is a one-shot pass -- a
// fixture whose lineup didn't confirm in that ~65-minute window (a delayed
// run, a late-submitting club) was never looked at again, and 46 of the
// last 47 finished fixtures had no lineup at all. Match resolution
// (getMatches, grouped by country+date) is shared between the lineup and
// events work below, so this doesn't double the request cost of covering
// both.
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

// Same dedup-key shape the earlier (since-reverted) live-event notifier
// used -- kept here since it's a reasonable, already-proven way to
// identify "the same event" without relying on Highlightly handing out a
// stable per-event id.
function eventKey(event) {
  return `${event.type}|${event.team?.id ?? ''}|${event.player ?? ''}|${event.time ?? ''}`;
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

  // Group by (country, date) to reuse one Highlightly /matches call across
  // every fixture that shares it, instead of one call per fixture -- stays
  // comfortably inside the free plan's 100 req/day even on a busy matchday.
  // Shared between the lineup and events work below.
  const groups = new Map();
  for (const f of pending) {
    const leagueSlug = leagueSlugById.get(f.league_id);
    const league = LEAGUES.find((l) => l.slug === leagueSlug);
    if (!league) continue;
    const dateStr = toDateString(new Date(f.kickoff_at));
    const key = `${league.country}|${dateStr}`;
    if (!groups.has(key)) groups.set(key, { country: league.country, dateStr, leagueSlug, fixtures: [] });
    groups.get(key).fixtures.push(f);
  }

  for (const { country, dateStr, leagueSlug, fixtures: groupFixtures } of groups.values()) {
    let hlMatches;
    try {
      const data = await getMatches({ date: dateStr, countryName: country });
      const all = Array.isArray(data) ? data : data.data || data.matches || [];
      hlMatches = all.filter((m) => m.league?.name === HIGHLIGHTLY_LEAGUE_NAME[leagueSlug]);
    } catch (err) {
      console.error(`Highlightly /matches failed for ${country} ${dateStr}:`, err.message);
      continue;
    }

    for (const f of groupFixtures) {
      const homeClub = clubById.get(f.home_club_id);
      const awayClub = clubById.get(f.away_club_id);
      if (!homeClub || !awayClub) continue;

      const leagueClubs = allClubs.filter((c) => c.league_id === f.league_id);
      const match = hlMatches.find((m) => {
        const homeMatch = resolveClub(m.homeTeam?.name, leagueClubs)?.id === homeClub.id;
        const awayMatch = resolveClub(m.awayTeam?.name, leagueClubs)?.id === awayClub.id;
        return homeMatch && awayMatch;
      });
      if (!match) continue;

      checked += 1;

      if (lineupNeeded(f)) {
        let lineups;
        try {
          lineups = await getLineups(match.id);
        } catch (err) {
          console.error(`Highlightly /lineups failed for match ${match.id}:`, err.message);
          lineups = null;
        }

        if (lineups) {
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
            { club: homeClub, team: lineups.homeTeam },
            { club: awayClub, team: lineups.awayTeam },
          ]) {
            if (!teamIsPopulated(team)) continue;
            const wasConfirmed = alreadyConfirmed.has(confirmedKey(f.id, club.id));
            const { error: upsertErr } = await supabase.from('lineups').upsert(
              {
                fixture_id: f.id,
                club_id: club.id,
                confirmed: true,
                formation: team.formation && team.formation !== 'Unknown' ? team.formation : null,
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
            newlyConfirmedFixtures.push({ fixtureId: f.id, homeClub, awayClub, leagueSlug });
          }
        }
      }

      if (eventsNeeded(f)) {
        let events;
        try {
          events = await getEvents(match.id);
        } catch (err) {
          console.error(`Highlightly /events failed for match ${match.id}:`, err.message);
          events = null;
        }

        if (events) {
          const rows = (Array.isArray(events) ? events : events.data || []).map((event) => {
            const club = resolveClub(event.team?.name, leagueClubs);
            return {
              fixture_id: f.id,
              club_id: club?.id ?? null,
              type: event.type,
              minute: String(event.time ?? ''),
              player: event.player ?? null,
              assist: event.assist ?? null,
              substituted: event.substituted ?? null,
              event_key: eventKey(event),
            };
          });
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
      pushResults.push(
        await sendPushToLineupSubscribers({
          title: 'Aufstellung bestätigt',
          body: `${homeClub.name} vs ${awayClub.name}`,
          url: `/?league=${leagueSlug}&fixture=${fixtureId}`,
        })
      );
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
