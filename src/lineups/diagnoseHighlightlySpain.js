import { getMatches } from './highlightlyClient.js';

// One-off, read-only: confirms Highlightly's league.name for La Liga (the
// same thing diagnoseHighlightly.js already confirmed for the original 4
// leagues -- Serie A/Bundesliga/Premier League/Ligue 1). Only needs the
// name/id, not a real lineup, so no kickoff-timing dependency like
// diagnoseHighlightly.js's second half has. Run via workflow_dispatch (see
// diagnose-highlightly-spain.yml); this sandbox has no live network access
// to Highlightly to confirm this up front.
function toDateString(date) {
  return date.toISOString().slice(0, 10);
}

async function run() {
  const now = new Date();
  const dates = [0, 1, 2, 3, 4, 5, 6].map((d) => toDateString(new Date(now.getTime() + d * 24 * 60 * 60 * 1000)));

  const leagueNames = new Map();
  for (const dateStr of dates) {
    let data;
    try {
      data = await getMatches({ date: dateStr, countryName: 'Spain' });
    } catch (err) {
      console.error(`date=${dateStr} failed:`, err.message);
      continue;
    }
    const matches = Array.isArray(data) ? data : data.data || data.matches || [];
    console.log(`date=${dateStr}: ${matches.length} matches`);
    for (const m of matches) {
      const name = m.league?.name;
      if (!name) continue;
      if (!leagueNames.has(name)) leagueNames.set(name, { id: m.league?.id, sample: [] });
      const entry = leagueNames.get(name);
      if (entry.sample.length < 2) entry.sample.push(`${m.homeTeam?.name} vs ${m.awayTeam?.name} (${m.date})`);
    }
  }

  console.log('\n=== leagues seen for countryName=Spain ===');
  for (const [name, { id, sample } ] of leagueNames.entries()) {
    console.log(`  "${name}" (id=${id})`);
    for (const s of sample) console.log(`      ${s}`);
  }
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
