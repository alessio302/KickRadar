// Mirrors backend/src/config/leagues.js (slugs must match the `leagues.slug`
// column) -- duplicated rather than shared across the two separate npm
// packages (backend is a plain Node script runner, this is a Vite app).
// Colors and logo are frontend-only display metadata, not stored in the DB.
// logo URLs confirmed live from GOAL API's fixtures response (embedded
// `league.logo` field, e.g. { id, name, logo, popularity }) -- a fixed set
// of 5 static image URLs, hardcoded the same way color already was rather
// than adding a DB column + sync job for data that never changes.
//
// teamCount/europeZones/relegationZones drive the standings table's zone
// colour bar (see StandingsTab.jsx). These are NOT fixed rules -- how many
// Champions League spots each league gets is re-decided every season by
// UEFA's association-coefficient ranking (the two associations with the
// best coefficient the previous season each get one extra "European
// Performance Spot"), and domestic cup results (Coppa Italia/DFB-Pokal
// winners bumping the league-position cutoff for Europa/Conference League)
// shift the exact Europe/relegation split further during the season. The
// numbers below are the 2026/27 season's actual allocation (confirmed via
// UEFA.com/national federation reporting as of Sept 2026: England and
// Spain hold this season's two extra Champions League slots, hence 5
// instead of 4) and deliberately collapse Europa League + Conference
// League into one combined "Europe" zone rather than trying to track the
// cup-dependent EL/UECL cutoff position-by-position -- that split isn't
// stable enough within a season to color a table row on. Needs revisiting
// each summer once the new UEFA coefficient ranking is published.
export const LEAGUES = [
  {
    slug: 'serie-a',
    label: 'Serie A',
    color: '#0F5FA6',
    logo: 'https://media.goal-api.com/badges/logo_leagues/207_serie-a.png',
    teamCount: 20,
    europeZones: { cl: 4, europe: 2 }, // 1-4 Champions League, 5-6 Europa/Conference League
    relegationZones: { direct: 3 }, // 18-20 direct, no relegation play-off in Serie A
  },
  {
    slug: 'bundesliga',
    label: 'Bundesliga',
    color: '#D0132C',
    logo: 'https://media.goal-api.com/badges/logo_leagues/175_bundesliga.png',
    teamCount: 18,
    europeZones: { cl: 4, europe: 2 }, // 1-4 Champions League, 5-6 Europa/Conference League
    relegationZones: { direct: 2, playoff: 1 }, // 17-18 direct, 16th plays off vs. 2. Bundesliga's 3rd place
  },
  {
    slug: 'premier-league',
    label: 'Premier League',
    color: '#3D1560',
    logo: 'https://media.goal-api.com/badges/logo_leagues/152_premier-league.png',
    teamCount: 20,
    europeZones: { cl: 5, europe: 3 }, // 1-5 Champions League (England holds a 2026/27 bonus slot), 6-8 Europa/Conference League
    relegationZones: { direct: 3 },
  },
  {
    slug: 'ligue-1',
    label: 'Ligue 1',
    color: '#1A2E5A',
    logo: 'https://media.goal-api.com/badges/logo_leagues/168_ligue-1.png',
    teamCount: 18,
    europeZones: { cl: 4, europe: 3 }, // 1-3 Champions League direct + 4th via play-off round, 5-7 Europa/Conference League
    relegationZones: { direct: 2, playoff: 1 }, // 17-18 direct, 16th plays off
  },
  {
    slug: 'la-liga',
    label: 'LaLiga',
    color: '#C9A227',
    logo: 'https://media.goal-api.com/badges/logo_leagues/302_la-liga.png',
    teamCount: 20,
    europeZones: { cl: 5, europe: 2 }, // 1-5 Champions League (Spain holds a 2026/27 bonus slot), 6-7 Europa/Conference League
    relegationZones: { direct: 3 },
  },
];

export function leagueBySlug(slug) {
  return LEAGUES.find((l) => l.slug === slug);
}

// Cyclic neighbor lookup for swipe-to-switch (see useLeagueCarousel.js) --
// direction 1 = next (wraps LaLiga -> Serie A), -1 = previous (wraps
// Serie A -> LaLiga). Falls back to the first league if the current slug
// isn't found at all (shouldn't happen, but a wrap is a safer default than
// throwing mid-gesture).
export function adjacentLeague(slug, direction) {
  const idx = LEAGUES.findIndex((l) => l.slug === slug);
  const base = idx === -1 ? 0 : idx;
  return LEAGUES[(base + direction + LEAGUES.length) % LEAGUES.length];
}

// Which competition zone a table position falls into for a given league,
// or null outside every zone (mid-table). Relegation is counted from the
// bottom of that league's own team count, not a fixed row number, since
// Bundesliga/Ligue 1 (18 teams) and the other three (20 teams) don't share
// one relegation cutoff. See LEAGUES' own comment on why Europa League and
// Conference League are one combined 'europe' zone.
export function zoneForPosition(slug, position) {
  const league = leagueBySlug(slug);
  if (!league || !position) return null;
  const { teamCount, europeZones, relegationZones } = league;

  if (position <= europeZones.cl) return 'cl';
  if (position <= europeZones.cl + europeZones.europe) return 'europe';

  const fromBottom = teamCount - position + 1;
  if (fromBottom <= (relegationZones.direct ?? 0)) return 'relegation';
  if (fromBottom <= (relegationZones.direct ?? 0) + (relegationZones.playoff ?? 0)) return 'relegationPlayoff';
  return null;
}
