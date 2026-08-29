// Read-only, no DB writes: dry-runs the new GOAL-API-based player
// resolution logic (search -> disambiguate by club -> full profile) for a
// few real, currently-relevant players, without needing the
// sql/027_player_profiles.sql columns to exist yet (that migration hasn't
// been run in prod at the time of this diagnostic). Confirms the
// disambiguation actually picks the right person for a common surname,
// not just that the API call succeeds.
import { searchPlayers, getPlayer } from '../lineups/goalApiClient.js';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// First attempt (no spacing) hit 429 RATE_LIMIT_EXCEEDED on the very first
// call -- GOAL API apparently enforces a per-second/per-minute rate limit
// distinct from its 1000/day quota, same class of thing Gemini's 15/min
// turned out to be earlier in this project. Also fetches the raw
// X-RateLimit-* headers (if present) on one request to learn the actual
// limit empirically instead of guessing a safe spacing.
async function probeRateLimitHeaders() {
  const apiKey = process.env.GOAL_API_KEY;
  const res = await fetch('https://api.goal-api.com/v1/players?search=Messi', {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  console.log('Rate-limit headers on a fresh request:', {
    limit: res.headers.get('x-ratelimit-limit'),
    remaining: res.headers.get('x-ratelimit-remaining'),
    reset: res.headers.get('x-ratelimit-reset'),
    type: res.headers.get('x-ratelimit-type'),
    status: res.status,
  });
}

const POSITION_SINGULAR = {
  Goalkeepers: 'Goalkeeper',
  Defenders: 'Defender',
  Midfielders: 'Midfielder',
  Forwards: 'Forward',
};

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
  // A genuinely common surname, to see how many real hits GOAL API's
  // global search actually returns and whether club disambiguation
  // correctly narrows it to one -- this is the case that matters most.
  { name: 'Silva', clubs: ['Chelsea'] },
];

async function main() {
  await probeRateLimitHeaders();
  await sleep(3000);

  for (const { name, clubs } of CASES) {
    console.log(`\n=== "${name}" (candidate clubs: ${clubs.join(', ')}) ===`);
    let results;
    try {
      results = await searchPlayers(name);
    } catch (err) {
      console.log('search failed:', err.message);
      await sleep(3000);
      continue;
    }
    console.log(`${results.length} search result(s):`, results.map((r) => `${r.name} (${r.team?.name ?? 'no team'})`));

    const match = pickBestMatch(results, clubs);
    if (!match) {
      console.log('No confident match -- would fall back to transfermarkt.de.');
      await sleep(3000);
      continue;
    }
    console.log('Picked:', match.name, '/', match.team?.name);

    await sleep(3000);
    const profile = await getPlayer(match.id);
    console.log('Full profile fields:', {
      image: profile.image,
      birthdate: profile.birthdate,
      type: profile.type,
      normalizedPosition: POSITION_SINGULAR[profile.type] || profile.type,
      team: profile.team,
      goals: profile.goals,
      assists: profile.assists,
      rating: profile.rating,
    });
    await sleep(3000);
  }
}

main().catch((err) => {
  console.error('Diagnostic failed:', err);
  process.exitCode = 1;
});
