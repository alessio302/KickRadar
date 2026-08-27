// Fixed league metadata, mirrors the `leagues` table seed in sql/schema.sql.
// Keeping this in code too so scripts can run before/without a DB round trip.
//
// externalCompetitionId is football-data.org's numeric competition id
// (equivalent string codes also work with their API: SA, BL1, PL, FL1).
export const LEAGUES = [
  {
    slug: 'serie-a',
    name: 'Serie A',
    country: 'Italy',
    externalCompetitionId: 2019,
    newsSource: 'tuttomercatoweb',
  },
  {
    slug: 'bundesliga',
    name: 'Bundesliga',
    country: 'Germany',
    externalCompetitionId: 2002,
    newsSource: 'kicker',
  },
  {
    slug: 'premier-league',
    name: 'Premier League',
    country: 'England',
    externalCompetitionId: 2021,
    newsSource: 'skysports',
  },
  {
    slug: 'ligue-1',
    name: 'Ligue 1',
    country: 'France',
    externalCompetitionId: 2015,
    newsSource: 'footmercato',
  },
  {
    slug: 'la-liga',
    name: 'LaLiga',
    country: 'Spain',
    externalCompetitionId: 2014,
    newsSource: 'marca',
  },
];

export function leagueBySlug(slug) {
  return LEAGUES.find((l) => l.slug === slug);
}

export function leagueByNewsSource(sourceKey) {
  return LEAGUES.find((l) => l.newsSource === sourceKey);
}
