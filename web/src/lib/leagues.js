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
// Performance Spot"), and domestic cup results shift the exact Europa
// League/Conference League split further during the season: if a cup
// winner already qualifies for Europe via league position anyway, their
// reserved cup-route berth rolls down to the next unclaimed league
// position instead (confirmed live for 2026/27: this happened in BOTH
// Serie A -- Inter won the Coppa Italia while already in via league
// position, bumping Milan/Juventus into a two-team Europa League bracket
// and Atalanta down to Conference League -- and Bundesliga, same
// mechanic, same outcome shape). Since that year-specific cup result
// isn't known until each domestic cup final (typically played in
// April/May, i.e. near the END of the season this table is showing), the
// el/uecl split below is each league's BASE position-only allocation --
// the one that applies when no rolldown happens -- not a guarantee of
// this season's final outcome. cl and relegationZones don't have this
// problem (no cup dependency) and are solid.
//
// The numbers below are confirmed current for the 2026/27 season (UEFA.com
// + each league's own site, cross-checked against actual 2026/27
// qualifiers): England and Spain hold this season's two UEFA European
// Performance Spots (coefficient bonus), hence 5 Champions League spots
// instead of 4. Needs revisiting each summer once the new UEFA coefficient
// ranking is published.
export const LEAGUES = [
  {
    slug: 'serie-a',
    label: 'Serie A',
    color: '#0F5FA6',
    logo: 'https://media.goal-api.com/badges/logo_leagues/207_serie-a.png',
    teamCount: 20,
    europeZones: { cl: 4, el: 1, uecl: 1 }, // 1-4 Champions League, 5 Europa League, 6 Conference League (base -- see file comment on the Coppa Italia rolldown)
    relegationZones: { direct: 3 }, // 18-20 direct, no relegation play-off in Serie A
  },
  {
    slug: 'bundesliga',
    label: 'Bundesliga',
    color: '#D0132C',
    logo: 'https://media.goal-api.com/badges/logo_leagues/175_bundesliga.png',
    teamCount: 18,
    europeZones: { cl: 4, el: 1, uecl: 1 }, // 1-4 Champions League, 5 Europa League, 6 Conference League (base -- see file comment on the DFB-Pokal rolldown)
    relegationZones: { direct: 2, playoff: 1 }, // 17-18 direct, 16th plays off vs. 2. Bundesliga's 3rd place
  },
  {
    slug: 'premier-league',
    label: 'Premier League',
    color: '#3D1560',
    logo: 'https://media.goal-api.com/badges/logo_leagues/152_premier-league.png',
    teamCount: 20,
    // 1-5 Champions League (England holds a 2026/27 bonus slot), 6-7
    // Europa League, 8 Conference League (base). England is the one
    // league with TWO independent domestic cups feeding Europe -- FA Cup
    // winner rolls into an Europa League berth if not already qualified,
    // League Cup (Carabao Cup) winner rolls into a Conference League berth
    // the same way -- each rolling down its own route independently, on
    // top of the base split below.
    europeZones: { cl: 5, el: 2, uecl: 1 },
    relegationZones: { direct: 3 },
  },
  {
    slug: 'ligue-1',
    label: 'Ligue 1',
    color: '#1A2E5A',
    logo: 'https://media.goal-api.com/badges/logo_leagues/168_ligue-1.png',
    teamCount: 18,
    // 1-3 Champions League direct + 4th via qualifying rounds (France is
    // ranked 5th by UEFA coefficient -- only the top 4 associations get a
    // direct 4th league-phase spot, confirmed current for 2026/27), 5-6
    // Europa League, 7 Conference League via play-off round (base).
    // Ligue 1's own quirk, confirmed current: its cup-winner rolldown
    // route feeds the CONFERENCE League, not the Europa League the way
    // Italy/Germany's does -- the Coupe de France winner's Conference
    // League berth rolls to the next unclaimed league position (7th) if
    // the winner already qualified for Europe via league position, same
    // mechanic as Italy/Germany just pointed at the other competition.
    europeZones: { cl: 4, el: 2, uecl: 1 },
    relegationZones: { direct: 2, playoff: 1 }, // 17-18 direct, 16th plays off
  },
  {
    slug: 'la-liga',
    label: 'LaLiga',
    color: '#C9A227',
    logo: 'https://media.goal-api.com/badges/logo_leagues/302_la-liga.png',
    teamCount: 20,
    europeZones: { cl: 5, el: 1, uecl: 1 }, // 1-5 Champions League (Spain holds a 2026/27 bonus slot), 6 Europa League, 7 Conference League (base -- Copa del Rey winner also rolls into Europa League if not already qualified)
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
// one relegation cutoff. See LEAGUES' own comment on why the el/uecl split
// is each league's base (no-cup-rolldown) allocation, not a guaranteed
// final outcome.
export function zoneForPosition(slug, position) {
  const league = leagueBySlug(slug);
  if (!league || !position) return null;
  const { teamCount, europeZones, relegationZones } = league;

  if (position <= europeZones.cl) return 'cl';
  if (position <= europeZones.cl + europeZones.el) return 'el';
  if (position <= europeZones.cl + europeZones.el + europeZones.uecl) return 'uecl';

  const fromBottom = teamCount - position + 1;
  if (fromBottom <= (relegationZones.direct ?? 0)) return 'relegation';
  if (fromBottom <= (relegationZones.direct ?? 0) + (relegationZones.playoff ?? 0)) return 'relegationPlayoff';
  return null;
}
