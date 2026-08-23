// Fixed league metadata, mirrors the `leagues` table seed in sql/schema.sql.
// Keeping this in code too so scripts can run before/without a DB round trip.
export const LEAGUES = [
  {
    slug: 'serie-a',
    name: 'Serie A',
    country: 'Italy',
    apiFootballId: 135,
    newsSource: 'tuttomercatoweb',
  },
  {
    slug: 'bundesliga',
    name: 'Bundesliga',
    country: 'Germany',
    apiFootballId: 78,
    newsSource: 'kicker',
  },
  {
    slug: 'premier-league',
    name: 'Premier League',
    country: 'England',
    apiFootballId: 39,
    newsSource: 'skysports',
  },
  {
    slug: 'ligue-1',
    name: 'Ligue 1',
    country: 'France',
    apiFootballId: 61,
    newsSource: 'rmcsport',
  },
];

export function leagueBySlug(slug) {
  return LEAGUES.find((l) => l.slug === slug);
}

export function leagueByNewsSource(sourceKey) {
  return LEAGUES.find((l) => l.newsSource === sourceKey);
}
