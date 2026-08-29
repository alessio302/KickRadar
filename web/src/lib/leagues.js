// Mirrors backend/src/config/leagues.js (slugs must match the `leagues.slug`
// column) -- duplicated rather than shared across the two separate npm
// packages (backend is a plain Node script runner, this is a Vite app).
// Colors are frontend-only display metadata, not stored in the DB.
export const LEAGUES = [
  { slug: 'serie-a', label: 'Serie A', color: '#0F5FA6' },
  { slug: 'bundesliga', label: 'Bundesliga', color: '#D0132C' },
  { slug: 'premier-league', label: 'Premier League', color: '#3D1560' },
  { slug: 'ligue-1', label: 'Ligue 1', color: '#1A2E5A' },
  { slug: 'la-liga', label: 'LaLiga', color: '#C9A227' },
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
