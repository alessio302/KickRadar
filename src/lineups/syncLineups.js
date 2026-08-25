import { getSupabaseClient } from '../db/supabaseClient.js';
import { LEAGUES } from '../config/leagues.js';
import { getMatches, getLineups } from './highlightlyClient.js';
import { resolveClub } from '../news/clubMatch.js';
import { sendPushToLineupSubscribers } from '../push/sendPush.js';

// Highlightly's own league.name for each of our leagues -- confirmed live
// via diagnoseHighlightly.js for the original 4 (Serie A id 115669,
// Bundesliga 67162, Premier League 33973, Ligue 1 52695). Filtering by
// this (not just countryName) matters: each country also returns lower
// divisions, women's/youth competitions and cups sharing the same country.
// La Liga's own id/name is NOT yet confirmed live the same way -- 'La Liga'
// is Highlightly's likely name for it (matches their pattern for the other
// four), but needs the same live check before relying on it.
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

function toDateString(date) {
  return date.toISOString().slice(0, 10);
}

function teamIsPopulated(team) {
  return Array.isArray(team?.initialLineup) && team.initialLineup.length > 0;
}

function confirmedKey(fixtureId, clubId) {
  return `${fixtureId}:${clubId}`;
}

export async function syncLineups() {
  const supabase = getSupabaseClient();
  const now = new Date();
  const windowStart = new Date(now.getTime() - LOOKBACK_MIN * 60000).toISOString();
  const windowEnd = new Date(now.getTime() + LOOKAHEAD_MIN * 60000).toISOString();

  const { data: fixtures, error: fixturesErr } = await supabase
    .from('fixtures')
    .select('id, league_id, home_club_id, away_club_id, kickoff_at')
    .gte('kickoff_at', windowStart)
    .lte('kickoff_at', windowEnd);
  if (fixturesErr) throw fixturesErr;
  if (fixtures.length === 0) return { checked: 0, confirmed: 0 };

  // Skip fixtures whose lineups are already fully confirmed for both
  // sides -- no point spending free-tier requests re-checking something
  // that won't change.
  const { data: existingLineups, error: existingErr } = await supabase
    .from('lineups')
    .select('fixture_id, club_id, confirmed')
    .in(
      'fixture_id',
      fixtures.map((f) => f.id)
    );
  if (existingErr) throw existingErr;
  const alreadyConfirmed = new Set(
    existingLineups.filter((r) => r.confirmed).map((r) => confirmedKey(r.fixture_id, r.club_id))
  );

  const pending = fixtures.filter(
    (f) => !(alreadyConfirmed.has(confirmedKey(f.id, f.home_club_id)) && alreadyConfirmed.has(confirmedKey(f.id, f.away_club_id)))
  );
  if (pending.length === 0) return { checked: fixtures.length, confirmed: 0 };

  const { data: dbLeagues, error: leaguesErr } = await supabase.from('leagues').select('id, slug');
  if (leaguesErr) throw leaguesErr;
  const leagueSlugById = new Map(dbLeagues.map((l) => [l.id, l.slug]));

  const { data: allClubs, error: clubsErr } = await supabase.from('clubs').select('id, name, aliases, league_id');
  if (clubsErr) throw clubsErr;
  const clubById = new Map(allClubs.map((c) => [c.id, c]));

  let checked = 0;
  let confirmedCount = 0;
  const newlyConfirmedFixtures = [];

  // Group by (country, date) to reuse one Highlightly /matches call across
  // every fixture that shares it, instead of one call per fixture -- stays
  // comfortably inside the free plan's 100 req/day even on a busy matchday.
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
      let lineups;
      try {
        lineups = await getLineups(match.id);
      } catch (err) {
        console.error(`Highlightly /lineups failed for match ${match.id}:`, err.message);
        continue;
      }

      // Pushes once per fixture per run when it goes from "not confirmed"
      // to "at least one side confirmed" -- known, accepted gap: if the
      // two sides' sheets land in different runs a few minutes apart,
      // this can send a second push for the same fixture. Rare (both
      // sides usually submit close together) and low-cost compared to
      // the complexity of suppressing it.
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
      if (fixtureNewlyConfirmed) newlyConfirmedFixtures.push({ fixture: f, homeClub, awayClub, leagueSlug });
    }
  }

  const pushResults = [];
  for (const { homeClub, awayClub, leagueSlug } of newlyConfirmedFixtures) {
    try {
      pushResults.push(
        await sendPushToLineupSubscribers({
          title: 'Aufstellung bestätigt',
          body: `${homeClub.name} vs ${awayClub.name}`,
          url: `/?league=${leagueSlug}`,
        })
      );
    } catch (err) {
      console.error('Lineup push send failed:', err.message);
    }
  }

  return { checked, confirmed: confirmedCount, newlyConfirmedFixtures: newlyConfirmedFixtures.length, pushResults };
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
