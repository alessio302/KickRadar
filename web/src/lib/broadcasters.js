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
// Real provider logos, self-hosted in our own Supabase Storage bucket
// (broadcaster-logos) -- NOT hotlinked from goal.com. Confirmed live/user-
// reported: hotlinking them directly was unreliable in the browser (Sky's
// logo failed to load entirely, most likely goal.com's CDN enforcing
// referrer-based hotlink protection against a cross-origin <img> request
// from our own domain). uploadBroadcasterLogos.js downloaded each one
// server-side ONCE (no browser Referer issue there) and uploaded it to our
// own bucket, so the app now serves them from a URL we control permanently.
// A prior revision briefly replaced these with plain colored text badges --
// reverted per explicit user direction: keep the real logos, fix the
// hosting instead of dropping them.
const LOGO_BASE = 'https://inwncmfpcjbebwivmovc.supabase.co/storage/v1/object/public/broadcaster-logos';
export const PROVIDER_INFO = {
  dazn: { label: 'DAZN', logoUrl: `${LOGO_BASE}/dazn.png` },
  sky: { label: 'Sky', logoUrl: `${LOGO_BASE}/sky.png` },
  now: { label: 'NOW', logoUrl: `${LOGO_BASE}/now.png` },
  rtlplus: { label: 'RTL+', logoUrl: `${LOGO_BASE}/rtlplus.jpg` },
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
    // Confirmed live (goal.com/de's own current-season TV-Guide pages,
    // 2026-08): RTL+ carries EVERY Europa League/Conference League match in
    // its streaming catalogue -- the free-TV picks on RTL/Nitro are a
    // subset of that same RTL+ content, not a second competing provider
    // with a different match selection -- so both are single-provider-
    // exclusive, same reasoning as La Liga/Ligue 1.
    case 'europa-league':
    case 'conference-league':
      return ['rtlplus'];
    // Champions League is DAZN for the huge majority of matches, but one
    // Tuesday match per matchday is picked ad hoc for an Amazon Prime
    // Video exclusive (no day/time rule predicts which one -- confirmed
    // live via web research, e.g. matchday 1's exclusive was Dortmund vs
    // Villarreal, a Tuesday fixture, while every other Tuesday match that
    // same week stayed on DAZN). Defaulting to DAZN here is right for
    // every Wednesday match and most Tuesday ones; the rare Tuesday
    // Amazon-exclusive shows the wrong pill until this gets its own
    // per-fixture data source (same kind of pipeline as Serie A's).
    case 'champions-league':
      return ['dazn'];
    default:
      return [];
  }
}
