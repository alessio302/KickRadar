// Read-only, no DB writes: dry-runs the real, now-throttled GOAL-API-based
// player resolution logic (search -> disambiguate by club -> full
// profile), reusing resolveGoalApiProfile()'s actual exported internals
// isn't possible (it's private to playerProfileResolver.js), so this
// re-implements the same call shape -- but with the SAME throttle/retry
// constants that module now uses, to confirm they actually hold up
// end-to-end after the 429/502 findings from the previous two runs.
import { searchPlayers, getPlayer } from '../lineups/goalApiClient.js';

const MIN_GOAL_API_INTERVAL_MS = 6500;
const RETRY_BACKOFF_MS = 12000;
let lastCallAt = 0;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function throttled(fn) {
  const wait = lastCallAt + MIN_GOAL_API_INTERVAL_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastCallAt = Date.now();
  try {
    return await fn();
  } catch (err) {
    if (!/\b(429|502)\b/.test(err.message)) throw err;
    console.warn('rate/gateway error, retrying once:', err.message);
    await sleep(RETRY_BACKOFF_MS);
    lastCallAt = Date.now();
    return await fn();
  }
}

function normalize(text) {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

function pickBestMatch(results, candidateClubNames) {
  if (results.length === 0) return null;
  if (results.length === 1) return results[0];
  const candidates = candidateClubNames.filter(Boolean).map(normalize);
  const scored = results.filter((r) => {
    const teamName = normalize(r.team?.name || '');
    return teamName && candidates.some((c) => teamName.includes(c) || c.includes(teamName));
  });
  return scored.length === 1 ? scored[0] : null;
}

const CASES = [
  { name: 'Erling Haaland', clubs: ['Manchester City'] },
  { name: 'Rodrygo', clubs: ['Real Madrid'] },
  { name: 'Silva', clubs: ['Chelsea'] },
];

async function main() {
  for (const { name, clubs } of CASES) {
    console.log(`\n=== "${name}" (candidate clubs: ${clubs.join(', ')}) ===`);
    const results = await throttled(() => searchPlayers(name));
    console.log(`${results.length} search result(s):`, results.map((r) => `${r.name} (${r.team?.name ?? 'no team'})`));

    const match = pickBestMatch(results, clubs);
    if (!match) {
      console.log('No confident match -- would fall back to transfermarkt.de.');
      continue;
    }
    console.log('Picked:', match.name, '/', match.team?.name);

    const profile = await throttled(() => getPlayer(match.id));
    console.log('Full profile fields:', {
      image: profile.image,
      birthdate: profile.birthdate,
      type: profile.type,
      team: profile.team,
      goals: profile.goals,
      assists: profile.assists,
      rating: profile.rating,
    });
  }
}

main().catch((err) => {
  console.error('Diagnostic failed:', err);
  process.exitCode = 1;
});
