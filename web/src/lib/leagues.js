// Mirrors backend/src/config/leagues.js (slugs must match the `leagues.slug`
// column) -- duplicated rather than shared across the two separate npm
// packages (backend is a plain Node script runner, this is a Vite app).
// Colors are frontend-only display metadata, not stored in the DB.
export const LEAGUES = [
  { slug: 'serie-a', label: 'Serie A', color: '#0F5FA6' },
  { slug: 'bundesliga', label: '1. Bundesliga', color: '#D0132C' },
  { slug: 'premier-league', label: 'Premier League', color: '#3D1560' },
  { slug: 'ligue-1', label: 'Ligue 1', color: '#1A2E5A' },
  { slug: 'la-liga', label: 'La Liga', color: '#C9A227' },
];

export function leagueBySlug(slug) {
  return LEAGUES.find((l) => l.slug === slug);
}
