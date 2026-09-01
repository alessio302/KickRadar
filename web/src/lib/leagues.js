// Mirrors backend/src/config/leagues.js (slugs must match the `leagues.slug`
// column) -- duplicated rather than shared across the two separate npm
// packages (backend is a plain Node script runner, this is a Vite app).
// Colors and logo are frontend-only display metadata, not stored in the DB.
// logo URLs confirmed live from GOAL API's fixtures response (embedded
// `league.logo` field, e.g. { id, name, logo, popularity }) -- a fixed set
// of 5 static image URLs, hardcoded the same way color already was rather
// than adding a DB column + sync job for data that never changes.
export const LEAGUES = [
  { slug: 'serie-a', label: 'Serie A', color: '#0F5FA6', logo: 'https://media.goal-api.com/badges/logo_leagues/207_serie-a.png' },
  { slug: 'bundesliga', label: 'Bundesliga', color: '#D0132C', logo: 'https://media.goal-api.com/badges/logo_leagues/175_bundesliga.png' },
  { slug: 'premier-league', label: 'Premier League', color: '#3D1560', logo: 'https://media.goal-api.com/badges/logo_leagues/152_premier-league.png' },
  { slug: 'ligue-1', label: 'Ligue 1', color: '#1A2E5A', logo: 'https://media.goal-api.com/badges/logo_leagues/168_ligue-1.png' },
  { slug: 'la-liga', label: 'LaLiga', color: '#C9A227', logo: 'https://media.goal-api.com/badges/logo_leagues/302_la-liga.png' },
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
