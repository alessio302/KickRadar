import { getMatches, getLineups } from './highlightlyClient.js';

// Read-only smoke test, no DB writes. Confirmed live (see git history):
// auth works, and countryName filtering does surface our 4 target leagues
// with real fixtures (Serie A id 115669, Bundesliga 67162, Premier League
// 33973, Ligue 1 52695) alongside a lot of noise -- lower divisions,
// women's/youth competitions, cups -- sharing the same country. The one
// thing still unconfirmed is whether /lineups actually populates for a
// real match once it's close to kickoff; every match checked so far was
// hours-to-days out and came back with an empty "Unknown" formation,
// which the docs say is expected that far ahead regardless of coverage
// quality. This only becomes a real signal by re-running this script
// shortly before an actual Serie A/Bundesliga/Premier League/Ligue 1
// kickoff -- hence only tracking matches in exactly those 4 competitions
// (not Serie B, 2. Bundesliga, Championship, Ligue 2, women's/youth
// leagues, or cups, which share the same country and would otherwise
// crowd out the real target when picking "the soonest match").
const COUNTRIES = ['Italy', 'Germany', 'England', 'France'];
const TARGET_LEAGUE_NAMES = new Set(['Serie A', 'Bundesliga', 'Premier League', 'Ligue 1']);

function toDateString(date) {
  return date.toISOString().slice(0, 10);
}

async function matchesForCountryAndDate(countryName, dateStr) {
  const data = await getMatches({ date: dateStr, countryName });
  const matches = Array.isArray(data) ? data : data.data || data.matches || [];
  return { matches, raw: data };
}

async function run() {
  const now = new Date();
  const dates = [0, 1, 2, 3, 4, 5, 6].map((d) => toDateString(new Date(now.getTime() + d * 24 * 60 * 60 * 1000)));

  const targetMatches = [];
  for (const countryName of COUNTRIES) {
    console.log(`\n=== country=${countryName} ===`);
    for (const dateStr of dates) {
      let result;
      try {
        result = await matchesForCountryAndDate(countryName, dateStr);
      } catch (err) {
        console.error(`  date=${dateStr} failed:`, err.message);
        continue;
      }
      if (result.matches.length === 0) continue;
      const targets = result.matches.filter((m) => TARGET_LEAGUE_NAMES.has(m.league?.name));
      console.log(`  date=${dateStr}: ${result.matches.length} matches total, ${targets.length} in our target leagues`);
      for (const m of targets) {
        console.log('   ', JSON.stringify({ id: m.id, league: m.league?.name, date: m.date, home: m.homeTeam?.name, away: m.awayTeam?.name }));
        targetMatches.push(m);
      }
    }
  }

  const upcoming = targetMatches.filter((m) => new Date(m.date) > now).sort((a, b) => new Date(a.date) - new Date(b.date));
  if (upcoming.length === 0) {
    console.log('\nNo upcoming matches found in our 4 target leagues over the next week -- either the season is between rounds right now, or the league name filter above needs adjusting (check the raw "league" fields logged for each country above).');
    return;
  }

  const soonest = upcoming[0];
  const minutesToKickoff = Math.round((new Date(soonest.date) - now) / 60000);
  console.log(`\n=== GET /lineups/${soonest.id} (soonest target-league match: ${soonest.league?.name} ${soonest.homeTeam?.name} vs ${soonest.awayTeam?.name}, kicks off in ~${minutesToKickoff} min) ===`);
  if (minutesToKickoff > 40) {
    console.log(`(more than 40 min out -- per Highlightly's docs, lineups aren't expected to be populated yet; an empty response here isn't a real signal about coverage quality)`);
  }
  try {
    const lineups = await getLineups(soonest.id);
    console.log(JSON.stringify(lineups, null, 2).slice(0, 2000));
  } catch (err) {
    console.error('failed:', err.message);
  }
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
