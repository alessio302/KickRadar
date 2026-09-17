// "Wo läuft das Spiel?" pill on fixture cards. No paid TV-data API (project
// stays free-tier-only, per explicit product decision) -- validated instead
// (diagnoseGoalComBroadcastPages.js) that 4 of our 5 leagues have German
// broadcast rights split cleanly enough to hardcode with zero per-fixture
// data at all:
//   - Premier League: 100% exclusive Sky in Germany (all 380 matches)
//   - La Liga: 100% exclusive DAZN
//   - Ligue 1: 100% exclusive DAZN
//   - Bundesliga: deterministic by kickoff weekday (confirmed live via
//     goal.com/de + bundesliga.com's own TV-Plan pages, 2025/26 rights
//     period through 2028/29): Fri/Sat -> Sky (individual matches -- DAZN's
//     Saturday product is the conference/highlights show, not full
//     individual-match rights), Sun -> DAZN. No day of the week carries
//     BOTH providers for the same single match, so this is always exactly
//     one provider, never co-exclusive.
// Serie A is the one exception -- confirmed live: many matches are
// genuinely co-exclusive (DAZN AND Sky Italia show the same match), which
// isn't reducible to a day/time rule. That one league's `broadcasters`
// column is populated by a real backend pipeline (syncSerieABroadcasters.js)
// scraping goal.com/it's own per-matchday broadcaster table -- see that
// file for the full reasoning.
//
// Logo URLs are goal.com's own hosted assets (hotlinked, same pattern this
// app already uses for club crests/badges via football-data.org/GOAL API's
// CDNs) -- confirmed reachable via diagnoseGoalComBroadcastPages.js.
export const PROVIDER_INFO = {
  dazn: {
    label: 'DAZN',
    logoUrl: 'https://eu-images.contentstack.com/v3/assets/bltcc7a7ffd2fbf71f5/blt2a657c326f3152f3/65709dfdfcc91a04075bd960/DAZN.png',
  },
  sky: {
    label: 'Sky',
    logoUrl:
      'https://assets.goal.com/images/v3/blt52fd4981ccab44fe/crop/MM5DCMRQGA5DMNZVHJXG653FHIYDUMRSGM======/sky-wow-logo.jpg?quality=60&auto=webp&format=pjpg',
  },
  now: {
    label: 'NOW',
    logoUrl: 'https://eu-images.contentstack.com/v3/assets/bltcc7a7ffd2fbf71f5/blt7b99fc273b8208cf/65a7e8a05ee0e2040acb0676/NOW_logo.png',
  },
};

// Berlin-local weekday, independent of the viewer's own device timezone --
// German broadcast rights are sold by Berlin-local kickoff slot (Fr/Sa/So),
// not UTC day, which drifts a late-evening UTC kickoff onto the wrong
// weekday for roughly a third of the calendar year (CET/CEST).
function berlinWeekday(kickoffAtIso) {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Berlin', weekday: 'short' }).format(new Date(kickoffAtIso));
}

function bundesligaBroadcasters(kickoffAtIso) {
  const weekday = berlinWeekday(kickoffAtIso);
  if (weekday === 'Sun') return ['dazn'];
  if (weekday === 'Fri' || weekday === 'Sat') return ['sky'];
  // Rare mid-week slot (heavy fixture-congestion weeks) -- not one of the
  // documented Fri/Sat/Sun rights buckets. DAZN carries the broader "every
  // Bundesliga match not otherwise Sky's" share, so it's the safer default
  // over guessing Sky for a slot Sky's own rights summary never mentions.
  return ['dazn'];
}

// leagueSlug/kickoffAtIso come from the fixture row itself; dbBroadcasters
// is that row's own `broadcasters` column (only ever populated for Serie A
// -- see this file's own top comment). Returns a plain array of provider
// keys (into PROVIDER_INFO above), e.g. ['dazn'] or ['dazn', 'sky'].
export function getBroadcasters(leagueSlug, kickoffAtIso, dbBroadcasters) {
  switch (leagueSlug) {
    case 'premier-league':
      return ['sky'];
    case 'la-liga':
    case 'ligue-1':
      return ['dazn'];
    case 'bundesliga':
      return kickoffAtIso ? bundesligaBroadcasters(kickoffAtIso) : [];
    case 'serie-a':
      return Array.isArray(dbBroadcasters) ? dbBroadcasters : [];
    default:
      return [];
  }
}
