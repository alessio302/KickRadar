// Attaches a highlight-clip URL to a finished UCL/UEL/UECL fixture -- same
// mechanism as src/lineups/syncHighlights.js (its own comments document the
// GOAL API videos-endpoint dead end and the case for a channel's own
// uploads feed over a per-matchday playlist; read those before touching
// this file), adapted for the 3 UEFA club competitions in two ways:
//  - No clubs table row exists for European fixtures (home_club_id/
//    away_club_id are always null -- see syncEuropeanLineups.js's own top
//    comment), so matching goes against fixtures.home_team_name/
//    away_team_name directly via this file's own teamNamesMatch() (see its
//    comment further down for why that's a local, order-independent
//    word-set matcher rather than syncEuropeanLineups.js's shared
//    namesLooselyMatch()), instead of resolveClub() against a clubs table
//    row.
//  - No push-notification step, unlike syncHighlights.js's own (it pushes
//    to favorite_fixtures and clears them once a clip lands) -- confirmed
//    live EuropaTab.jsx has no favoriting/star feature at all (zero
//    favorite_fixtures references anywhere in that file), so there is no
//    European analog to that trigger to port. Left out entirely rather
//    than ported as dead code.
//
// Source history -- THREE candidates tried before landing on one that
// actually works, each rejected for a different reason a simple feed fetch
// never would have caught:
//  1. beIN SPORTS Asia (channel_id UCYtNSrfGdXooZYu_hkq18_w) -- current,
//     well-formatted, matched real fixtures... and confirmed live IN
//     PRODUCTION (2026-09-10, a real user hitting it in the app) to be
//     geo-blocked outside its own APAC broadcast territory ("Der Uploader
//     stellt dieses Video in deinem Land nicht zur Verfügung"). A feed
//     fetch can't surface that -- only actually embedding and playing a
//     video can.
//  2. DAZN's own per-competition channel (champions-league:
//     UCB-GdMjyokO9lZkKU_oIK6g) -- switched to specifically because it's a
//     LOCAL (German) broadcaster, avoiding the geo problem. It did: no
//     geo-block. But confirmed live via a full oEmbed sweep
//     (https://www.youtube.com/oembed?url=...) of every video this file
//     had attached -- 9/9 returned 401 "embedding disabled by owner". DAZN
//     disables embedding on its uploads entirely, a channel-wide policy
//     (likely protecting their paid subscription platform -- a free-to-air
//     broadcaster like ZDFsportstudio/Sky Sport Premier League, already
//     used for Bundesliga/Premier League in syncHighlights.js, has no such
//     incentive). This retroactively means beIN was never re-checked for
//     embeddability either before being dropped for geo-blocking -- moot
//     now, but a reminder that "current and well-formatted" is not
//     "usable" until BOTH the feed AND the oEmbed endpoint are checked
//     live.
//  3. Prime Video Sport Deutschland (channel_id UCK2izXoHvraUFaPMU5B7vMQ) --
//     the one that stuck. Found via a user-supplied playlist link, then
//     verified against the CHANNEL's own live feed (the playlist itself
//     turned out to be a stale prior-season one). Confirmed live
//     2026-09-10: current (real 2026/27 matchday-1 uploads), embeddable
//     (checked via oEmbed), and a single clean, consistent title shape
//     (see parsePrimeVideoTeams() below) -- unlike DAZN's mix of a clean
//     shape and a narrative-headline one. Diluted with short German-
//     language reaction/meme clips same as several domestic sources
//     already are (syncHighlights.js's own Bundesliga/Premier League
//     comments); the strict title-anchor in parsePrimeVideoTeams() below
//     already filters those out rather than needing a separate check.
//
// UEFA's own official-looking YouTube presence was checked FIRST, before
// any of the three above, and rejected, same vetting standard as every
// source in syncHighlights.js:
//  - @UCL-uefachampionsleague ("UEFA CHAMPIONS LEAGUE.") looks the most
//    official by name, but confirmed live to be a low-volume meme/reel
//    account -- 9 entries total, mostly single-moment clickbait-captioned
//    clips, nothing from the current season.
//  - The real UEFA-run channel (youtube.com/user/UEFA, channel_id
//    UCyGa1YEx9ST66rYrJTGIKOw) IS current and IS genuinely UEFA's own, but
//    posts 15+ clips a day across goals/reactions/quizzes/anthems, which
//    drowns out full match-highlight uploads inside the 15-item RSS
//    window -- no full match recap appeared in the last 15 entries at all
//    during this research, and there's no consistent title shape to parse
//    even where one does.
//  - @UEFAEuropaLeagueUEL and the "uefa conference League" channel
//    (UCABKzbH3IJnzFqIgrYTh1kQ) both resolve to real, distinct channel ids
//    but their own feeds returned 0 entries -- inactive/empty channels.
//
// europa-league/conference-league: still UNMAPPED -- Prime Video
// Deutschland's own coverage of those two wasn't checked (their 2026/27
// league phase hasn't started yet, 2026-09-16/17, so there's nothing real
// to verify against regardless -- findCandidates() below naturally yields
// zero candidates for either until then). Worth checking this same channel
// first once there's real data, before searching elsewhere.
import { getSupabaseClient } from '../db/supabaseClient.js';
import { UEFA_COMPETITIONS } from '../config/leagues.js';

// Local matcher, deliberately NOT namesLooselyMatch() from
// syncEuropeanLineups.js -- that one is shared, load-bearing code for
// resolving GOAL API's own goal_api_id (syncLiveEvents.js, the webhook),
// so it stays untouched here rather than risk it for a cosmetic feature.
// namesLooselyMatch's plain substring check turned out too strict for
// real broadcaster titles -- confirmed live (2026-09-10, across DAZN's and
// Prime Video's own German-language titles) several real cases at once:
//  - "PSG" for "Paris Saint-Germain FC" -- an abbreviation, no substring
//    relation either way.
//  - "Neapel" for "SSC Napoli", "Inter Mailand" for "FC Internazionale
//    Milano" -- German-language titles use German exonyms for the
//    city/club name, not the club's own official-language name.
//  - "Man City" for "Manchester City FC" -- same abbreviation problem as
//    PSG, one substring check can't bridge "manchester" vs "man".
//  - "Atletico Madrid" for "Club Atlético de Madrid" -- missing "de".
//  - "OSC Lille" for our own stored "Lille OSC" -- the two words are
//    plain reordered, which a substring check can never match regardless
//    of wording (neither string contains the other as a contiguous run).
// A token-SET comparison (order-independent, drop a small set of known
// connector/suffix words, apply the fixed alias substitutions below)
// fixes all five of these at once, generically, rather than patching each
// pair as its own special case.
const CLUB_SUFFIX_WORDS = new Set(['fc', 'cf', 'afc', 'ac', 'sc', 'cd', 'ud', 'ssc', 'ssd', 'calcio', 'club', 'sk', 'kv', 'fk']);
// Connector words that show up inside a full club name ("Club Atlético DE
// Madrid") but get dropped in a shorter colloquial form ("Atletico
// Madrid") -- generic grammatical filler, not specific to any one club.
const CONNECTOR_WORDS = new Set(['de', 'del', 'der', 'des', 'van', 'von', 'da', 'do', 'dos']);
// German-language exonyms a broadcaster's own titles use for a handful of
// European city/country names that anchor a club's own name -- a fixed,
// verifiable list of standard German place names, not a per-club guess.
// Extend this (not the alias tables below) whenever a future mismatch
// turns out to be this same "city translated into German" shape rather
// than an abbreviation.
const GERMAN_CITY_EXONYMS = {
  neapel: 'napoli',
  mailand: 'milano',
  munchen: 'munich', // diacritic already stripped by the time this runs
  athen: 'athens',
  warschau: 'warszawa',
  kiew: 'kyiv',
  moskau: 'moscow',
  genua: 'genova',
  turin: 'torino',
  rom: 'roma',
  florenz: 'firenze',
  lissabon: 'lisbon',
  brugge: 'brugge',
};
// Known colloquial/abbreviated forms a broadcaster's titles use in place
// of a club's own name -- confirmed live in a real feed dump (see the top
// comment). Split into two tables by shape: a PHRASE can't be caught by
// the per-token pass below (it doesn't correspond to a single word in the
// source title, e.g. "psg" isn't one of "paris"/"saint"/"germain"), so
// it's substituted as a whole word-boundary-anchored phrase before the
// string is ever split into words; a single-word alias (e.g. "inter" for
// "internazionale") is substituted per-token instead, same pass as
// GERMAN_CITY_EXONYMS, so it still works when embedded inside a longer
// title fragment like "Inter Mailand". Both grown the same way
// SHORT_NAME_OVERRIDES (syncClubs.js) is: add an entry once a REAL
// mismatch is confirmed via the console.warn below, never guessed ahead of
// time for a club that hasn't actually shown up mismatched yet -- same
// "don't guess a title format" discipline syncHighlights.js's own
// parseTeams functions already hold to.
const TEAM_PHRASE_ALIASES = {
  psg: 'paris saint germain',
  'man city': 'manchester city',
  'man utd': 'manchester united',
  'man united': 'manchester united',
};
const TEAM_TOKEN_ALIASES = {
  inter: 'internazionale',
};

function tokenSet(rawName) {
  let name = rawName
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
  for (const [phrase, full] of Object.entries(TEAM_PHRASE_ALIASES)) {
    name = name.replace(new RegExp(`\\b${phrase}\\b`, 'g'), full);
  }
  name = name.replace(/[^a-z0-9]+/g, ' ');
  const words = name
    .split(' ')
    .filter(Boolean)
    .map((w) => GERMAN_CITY_EXONYMS[w] || TEAM_TOKEN_ALIASES[w] || w)
    .filter((w) => !CLUB_SUFFIX_WORDS.has(w) && !CONNECTOR_WORDS.has(w));
  return new Set(words);
}

// Order-independent, either-direction subset match -- mirrors
// namesLooselyMatch's own "a.includes(b) || b.includes(a)" philosophy
// (neither side is assumed to be the more complete one: a broadcaster's
// title sometimes carries MORE words than our stored name, e.g. matching
// against a club's full name, and sometimes FEWER, e.g. a short colloquial
// title), just at the word level instead of the character-substring level.
function teamNamesMatch(a, b) {
  const setA = tokenSet(a);
  const setB = tokenSet(b);
  if (setA.size === 0 || setB.size === 0) return false;
  const [smaller, larger] = setA.size <= setB.size ? [setA, setB] : [setB, setA];
  for (const word of smaller) {
    if (!larger.has(word)) return false;
  }
  return true;
}

// Title pattern confirmed live against Prime Video Sport Deutschland's own
// channel feed, 2026-09-10: "UEFA Champions League <home> vs <away> |
// Highlights und Tore" -- a single, consistent shape (unlike DAZN's own
// mixed clean/narrative-headline titles), which doubles as a filter: the
// channel's many short German-language reaction/meme clips ("Kobel übers
// Spiel...", "#UCL #PrimeVideo" one-liners) simply don't match this anchor
// and are skipped, no separate check needed.
function parsePrimeVideoTeams(title) {
  const m = title.match(/^UEFA Champions League\s+(.+?)\s+vs\s+(.+?)\s*\|/);
  if (!m) return null;
  const home = m[1].trim();
  const away = m[2].trim();
  if (!home || !away) return null;
  return { home, away };
}

const YOUTUBE_SOURCE_BY_COMPETITION_SLUG = {
  'champions-league': {
    feedUrl: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCK2izXoHvraUFaPMU5B7vMQ',
    parseTeams: parsePrimeVideoTeams,
  },
  // europa-league / conference-league: intentionally absent -- see top comment.
};

const LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
const RECHECK_INTERVAL_MS = 30 * 60 * 1000;

async function fetchFeedEntries(feedUrl) {
  const res = await fetch(feedUrl, {
    headers: {
      // Same UA as syncHighlights.js's own fetchFeedEntries -- confirmed
      // live there this is cheap insurance, not load-bearing.
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    },
  });
  if (!res.ok) throw new Error(`YouTube feed request failed: ${res.status} ${res.statusText}`);
  const xml = await res.text();
  const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((m) => m[1]);
  return entries
    .map((entry) => ({
      videoId: entry.match(/<yt:videoId>(.*?)<\/yt:videoId>/)?.[1] ?? null,
      title: entry.match(/<title>(.*?)<\/title>/)?.[1] ?? null,
    }))
    .filter((e) => e.videoId && e.title);
}

// Same recheck-window/lookback shape as syncHighlights.js's own
// findCandidates, but scoped to all 3 UEFA league ids in one query instead
// of one league at a time -- there's only one feed source shared across
// all 3 competitions here (see the top comment), so there's no per-league
// reason to keep them as separate queries the way the domestic job's
// per-league loop does.
async function findCandidates(supabase, leagueIds) {
  const cutoff = new Date(Date.now() - LOOKBACK_MS).toISOString();
  const recheckBefore = new Date(Date.now() - RECHECK_INTERVAL_MS).toISOString();
  const { data, error } = await supabase
    .from('fixtures')
    .select('id, league_id, home_team_name, away_team_name, kickoff_at')
    .in('league_id', leagueIds)
    .eq('status', 'finished')
    .is('highlight_video_url', null)
    .gte('kickoff_at', cutoff)
    .or(`highlight_checked_at.is.null,highlight_checked_at.lt.${recheckBefore}`)
    .order('kickoff_at', { ascending: false });
  if (error) throw error;
  return data;
}

// Confirmed live (workflow_dispatch run against real data, 2026-09-10,
// after switching to Prime Video Deutschland): matched real matchday-1
// fixtures including Real Madrid vs Inter Mailand, Lille vs Real Betis,
// Porto vs Manchester City, Borussia Dortmund vs Villarreal -- all
// embeddable, all playing correctly in the app. Same RECHECK_INTERVAL_MS/
// rolling-15-item caveat as syncHighlights.js's own LaLiga source: a
// fixture that misses this window keeps getting rechecked, but a clip
// that's already rolled off 15 items by the first check will likely never
// be caught this way -- same accepted tradeoff as the domestic job, not a
// bug here.
export async function syncEuropeanHighlights() {
  const supabase = getSupabaseClient();

  const { data: dbLeagues, error: leaguesErr } = await supabase
    .from('leagues')
    .select('id, slug')
    .in('slug', UEFA_COMPETITIONS.map((c) => c.slug));
  if (leaguesErr) throw leaguesErr;
  if (!dbLeagues || dbLeagues.length === 0) return { checked: 0, found: 0 };

  const leagueIds = dbLeagues.map((l) => l.id);
  const candidates = await findCandidates(supabase, leagueIds);
  if (candidates.length === 0) return { checked: 0, found: 0 };

  // Fetch and parse each distinct feed URL at most once per sync run --
  // only champions-league has a mapped source today (see the top
  // comment), but this is keyed by feedUrl rather than by competition so
  // adding europa-league/conference-league sources later, even ones that
  // happen to share a feed URL, still only fetches each real URL once.
  const slugByLeagueId = new Map(dbLeagues.map((l) => [l.id, l.slug]));
  const feedUrls = new Set(
    dbLeagues
      .map((l) => YOUTUBE_SOURCE_BY_COMPETITION_SLUG[l.slug]?.feedUrl)
      .filter(Boolean)
  );

  const parsedEntriesByFeedUrl = new Map();
  for (const feedUrl of feedUrls) {
    let entries = [];
    try {
      entries = await fetchFeedEntries(feedUrl);
    } catch (err) {
      console.error(`YouTube feed fetch failed for ${feedUrl}:`, err.message);
    }
    parsedEntriesByFeedUrl.set(feedUrl, entries);
  }

  let checked = 0;
  let found = 0;

  for (const fixture of candidates) {
    checked += 1;
    if (!fixture.home_team_name || !fixture.away_team_name) {
      await supabase
        .from('fixtures')
        .update({ highlight_checked_at: new Date().toISOString() })
        .eq('id', fixture.id);
      continue;
    }

    const slug = slugByLeagueId.get(fixture.league_id);
    const source = slug ? YOUTUBE_SOURCE_BY_COMPETITION_SLUG[slug] : null;
    const entries = source ? parsedEntriesByFeedUrl.get(source.feedUrl) ?? [] : [];

    let url = null;
    const unmatchedTitleTeams = [];
    if (source) {
      for (const entry of entries) {
        const teams = source.parseTeams(entry.title);
        if (!teams) continue;
        if (teamNamesMatch(teams.home, fixture.home_team_name) && teamNamesMatch(teams.away, fixture.away_team_name)) {
          url = `https://www.youtube.com/embed/${entry.videoId}`;
          break;
        }
        unmatchedTitleTeams.push(teams);
      }
    }

    // Visibility for growing TEAM_PHRASE_ALIASES/TEAM_TOKEN_ALIASES/
    // GERMAN_CITY_EXONYMS above from real evidence instead of guessing
    // ahead of time -- confirmed this candidate had a real title in the
    // feed that PARSED into a team pair but still didn't match either
    // side, worth a human glance at the next sync run's own log rather
    // than staying silent about it.
    if (!url && unmatchedTitleTeams.length > 0) {
      console.warn(
        `No title matched fixture ${fixture.id} (${fixture.home_team_name} vs ${fixture.away_team_name}) -- parsed candidates: ${JSON.stringify(unmatchedTitleTeams)}`
      );
    }

    await supabase
      .from('fixtures')
      .update({ highlight_video_url: url, highlight_checked_at: new Date().toISOString() })
      .eq('id', fixture.id);

    if (url) found += 1;
  }

  return { checked, found };
}

const isMain = process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href;
if (isMain) {
  syncEuropeanHighlights()
    .then((result) => console.log('European highlights sync complete:', result))
    .catch((err) => {
      console.error('European highlights sync failed:', err);
      process.exitCode = 1;
    });
}
