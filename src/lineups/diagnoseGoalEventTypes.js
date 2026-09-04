import { getLeagueFixtures, getFixtureEvents, getFixtureCards } from './goalApiClient.js';
import { LEAGUES } from '../config/leagues.js';

// Temporary diagnostic (delete after use): answers a real question --
// does GOAL API's events feed carry a distinct type for penalty goals or
// disallowed/cancelled goals, or does syncLineups.js's buildEventRows
// silently drop something real via its `if (g.type !== 'GOAL') continue`
// filter? Scans real recently-finished fixtures across all 5 leagues and
// collects every distinct raw `type` value seen on a goal event, plus one
// full example object per distinct type, instead of guessing from the
// existing code's own assumptions.
const DAYS_BACK = 7;
const MAX_FIXTURES = 50;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function dateStr(d) {
  return d.toISOString().slice(0, 10);
}

async function main() {
  const typeExamples = new Map(); // type -> example object
  const cardTypeExamples = new Map();
  let fixturesScanned = 0;
  let fixturesWithGoals = 0;

  outer: for (const league of LEAGUES) {
    for (let i = 1; i <= DAYS_BACK; i++) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      const ds = dateStr(d);
      let fixtures;
      try {
        fixtures = await getLeagueFixtures(league.goalApiLeagueId, ds);
      } catch (err) {
        console.error(`fixtures failed ${league.slug} ${ds}:`, err.message);
        continue;
      }
      // No filtering by GOAL API's own status field here -- its exact name
      // isn't established anywhere in the existing codebase (syncLineups.js
      // matches by date+team names against our own DB status instead), and
      // every fixture on a date this far in the past is already finished
      // regardless of what that field is called.
      for (const f of fixtures) {
        if (fixturesScanned >= MAX_FIXTURES) break outer;
        fixturesScanned += 1;
        try {
          const goals = await getFixtureEvents(f.id);
          if (goals.length > 0) fixturesWithGoals += 1;
          for (const g of goals) {
            const t = String(g.type ?? 'undefined');
            if (!typeExamples.has(t)) typeExamples.set(t, g);
          }
          await sleep(250);
          const cards = await getFixtureCards(f.id);
          for (const c of cards) {
            const t = String(c.card ?? 'undefined');
            if (!cardTypeExamples.has(t)) cardTypeExamples.set(t, c);
          }
          await sleep(250);
        } catch (err) {
          console.error(`events/cards failed for fixture ${f.id}:`, err.message);
        }
      }
    }
  }

  console.log(`Scanned ${fixturesScanned} fixtures (cap ${MAX_FIXTURES}) across up to ${DAYS_BACK} days x 5 leagues, ${fixturesWithGoals} had at least one goal-endpoint entry.`);
  console.log('\n--- Distinct goal-event `type` values seen (with one example each) ---');
  for (const [t, example] of typeExamples) {
    console.log(`\ntype = "${t}":`, JSON.stringify(example, null, 2));
  }
  console.log('\n--- Distinct card `card` values seen (with one example each) ---');
  for (const [t, example] of cardTypeExamples) {
    console.log(`\ncard = "${t}":`, JSON.stringify(example, null, 2));
  }
}

main().catch((err) => {
  console.error('Diagnostic failed:', err);
  process.exitCode = 1;
});
