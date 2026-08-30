// Fixed league metadata, mirrors the `leagues` table seed in sql/schema.sql.
// Keeping this in code too so scripts can run before/without a DB round trip.
//
// externalCompetitionId is football-data.org's numeric competition id
// (equivalent string codes also work with their API: SA, BL1, PL, FL1).
//
// goalApiLeagueId is GOAL API's own internal league id (a cuid, not their
// numeric apiId) -- confirmed live via /countries/:id/leagues scoped to
// each country. Needed because GOAL API tracks ~1000 leagues worldwide
// and generic names like "Premier League" collide across a dozen
// countries (Kenya, Somalia, Taiwan, women's/junior variants, ...); a
// global name search risks silently wiring up the wrong homonym, so this
// was resolved once per country rather than trusted from a substring match.
//
// newsSources is an array (even where every league but LaLiga only has
// one entry) rather than a single string -- runNewsScraper.js scrapes
// each one independently and tags every row with ITS OWN source key, not
// the league's, so a second source for one league (LaLiga: marca +
// fichajes, confirmed live as a genuinely different publisher, not just
// a mirror of marca's own content) never gets mislabeled as the first.
export const LEAGUES = [
  {
    slug: 'serie-a',
    name: 'Serie A',
    country: 'Italy',
    externalCompetitionId: 2019,
    goalApiLeagueId: 'cmr77dvpd006yrx06zig7907g',
    newsSources: ['tuttomercatoweb'],
  },
  {
    slug: 'bundesliga',
    name: 'Bundesliga',
    country: 'Germany',
    externalCompetitionId: 2002,
    goalApiLeagueId: 'cmr77dvgm0002rx06rt2uqxii',
    newsSources: ['kicker'],
  },
  {
    slug: 'premier-league',
    name: 'Premier League',
    country: 'England',
    externalCompetitionId: 2021,
    goalApiLeagueId: 'cmr77dvkr005nrx06lp7rvp49',
    newsSources: ['skysports'],
  },
  {
    slug: 'ligue-1',
    name: 'Ligue 1',
    country: 'France',
    externalCompetitionId: 2015,
    goalApiLeagueId: 'cmr77dvqg007crx06q1kaceyo',
    newsSources: ['footmercato'],
  },
  {
    slug: 'la-liga',
    name: 'LaLiga',
    country: 'Spain',
    externalCompetitionId: 2014,
    goalApiLeagueId: 'cmr77dvnt006nrx063v3w622e',
    newsSources: ['marca', 'fichajes'],
  },
];

export function leagueBySlug(slug) {
  return LEAGUES.find((l) => l.slug === slug);
}

export function leagueByNewsSource(sourceKey) {
  return LEAGUES.find((l) => l.newsSources.includes(sourceKey));
}
