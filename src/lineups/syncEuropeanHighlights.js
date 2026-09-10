// Attaches a highlight-clip URL to a finished UCL/UEL/UECL fixture -- same
// mechanism as src/lineups/syncHighlights.js (its own comments document the
// GOAL API videos-endpoint dead end and the case for a channel's own
// uploads feed over a per-matchday playlist; read those before touching
// this file), adapted for the 3 UEFA club competitions in two ways:
//  - No clubs table row exists for European fixtures (home_club_id/
//    away_club_id are always null -- see syncEuropeanLineups.js's own top
//    comment), so matching goes through that file's namesLooselyMatch()
//    against fixtures.home_team_name/away_team_name directly, instead of
//    resolveClub() against a clubs table row.
//  - No push-notification step, unlike syncHighlights.js's own (it pushes
//    to favorite_fixtures and clears them once a clip lands) -- confirmed
//    live EuropaTab.jsx has no favoriting/star feature at all (zero
//    favorite_fixtures references anywhere in that file), so there is no
//    European analog to that trigger to port. Left out entirely rather
//    than ported as dead code.
//
// Source, all 3 competitions: beIN SPORTS Asia's own YouTube channel
// (channel_id UCYtNSrfGdXooZYu_hkq18_w). Confirmed live via three separate
// already-finished 2026/27 UCL fixtures (Real Madrid 2-1 Inter Milan,
// Barcelona 5-1 Feyenoord, Liverpool 2-1 Atlético de Madrid) sitting in
// this channel's current uploads feed with exactly the title format
// parsed below, plus a PAST-season Europa League upload ("Athletic Club
// 0-3 Manchester United | Europa League 24/25 Match Highlights") and a
// UEFA Conference League one ("Crystal Palace 1-0 Rayo Vallecano | UEFA
// Conference League 25/26 Final Match Highlights") from the SAME channel
// id, in the same title shape -- so this one feed is expected to also
// cover EL/UECL once their 2026/27 league phase kicks off (2026-09-16/17,
// confirmed live via WebSearch; no finished EL/UECL fixtures exist yet in
// this database to verify those two competitions end-to-end the way UCL
// was). WebSearch also confirms beIN SPORTS Asia holds UEFA's live
// broadcast rights for all 3 club competitions across multiple APAC
// territories through 2026/27 -- the same "a rights-holder's broadcaster
// channel" pattern syncHighlights.js already uses for Bundesliga
// (ZDFsportstudio) and Premier League (Sky Sport Premier League), just one
// channel covering all 3 UEFA competitions instead of needing three.
//
// UEFA's own official-looking YouTube presence was checked FIRST and
// rejected, same vetting standard as every source in syncHighlights.js:
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
//  - DAZN's regional channel (@DAZNUEFAChampionsLeague, the user's own
//    original suggestion) was confirmed live to be stale (newest entry
//    from July 2024) and not even CL-specific (mixed LaLiga/Serie A/Saudi
//    Pro League clips) -- rejected for the same staleness/wrong-content
//    reasons as UEFA's own main channel, not because it's a broadcaster
//    rather than the league itself (beIN SPORTS Asia below is ALSO a
//    broadcaster, just a current and CL/EL/UECL-specific one).
import { getSupabaseClient } from '../db/supabaseClient.js';
import { UEFA_COMPETITIONS } from '../config/leagues.js';
import { namesLooselyMatch } from './syncEuropeanLineups.js';

// Title pattern confirmed live against beIN SPORTS Asia's own channel feed
// for all 3 competitions: "<home> <homeScore>-<awayScore> <away> | <comp>
// <season>[ Final] Match Highlights" -- the score sits between the two
// team names in the first pipe segment, the same shape
// syncHighlights.js's own parseScoreEmbeddedTeams handles for LaLiga's
// official channel. Kept as its own small copy here rather than imported
// from that file -- the two modules are otherwise unrelated, with their
// own top comments, and this is a 4-line function.
function parseScoreEmbeddedTeams(title) {
  const scoreLine = title.split('|')[0].trim();
  const m = scoreLine.match(/^(.+?)\s+\d+\s*-\s*\d+\s+(.+)$/);
  if (!m) return null;
  const home = m[1].trim();
  const away = m[2].trim();
  if (!home || !away) return null;
  return { home, away };
}

const BEIN_SPORTS_ASIA_FEED = 'https://www.youtube.com/feeds/videos.xml?channel_id=UCYtNSrfGdXooZYu_hkq18_w';

const YOUTUBE_SOURCE_BY_COMPETITION_SLUG = {
  'champions-league': { feedUrl: BEIN_SPORTS_ASIA_FEED, parseTeams: parseScoreEmbeddedTeams },
  'europa-league': { feedUrl: BEIN_SPORTS_ASIA_FEED, parseTeams: parseScoreEmbeddedTeams },
  'conference-league': { feedUrl: BEIN_SPORTS_ASIA_FEED, parseTeams: parseScoreEmbeddedTeams },
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

// Confirmed live (workflow_dispatch run against real data, 2026-09-10):
// 5 of 12 finished-and-candidate UCL fixtures got a highlight_video_url on
// the first run (Liverpool 2-1 Atlético de Madrid, PSG 6-1 Slovan
// Bratislava, Napoli 0-1 Arsenal, Barcelona 5-1 Feyenoord, VfB Stuttgart
// 3-1 Viking) -- the other 7, including the earlier 2026-09-08 matchday
// (e.g. Real Madrid vs Inter Milan), simply weren't in beIN SPORTS Asia's
// uploads feed's last-15-items window anymore by the time this ran, same
// "prolific channel, match highlights roll off the RSS window fast"
// caveat syncHighlights.js's own comment documents for LaLiga's official
// channel. RECHECK_INTERVAL_MS means a fixture that misses this window
// keeps getting rechecked, but a clip that's already rolled off 15 items
// by the first check will likely never be caught this way -- same
// accepted tradeoff as the domestic job, not a bug here.
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
  // today all 3 competitions map to the same beIN SPORTS Asia feed (see
  // the top comment), but this is keyed by feedUrl rather than by
  // competition so a future per-competition source swap still only
  // fetches each real URL once.
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
    if (source) {
      for (const entry of entries) {
        const teams = source.parseTeams(entry.title);
        if (!teams) continue;
        if (
          namesLooselyMatch(teams.home, fixture.home_team_name) &&
          namesLooselyMatch(teams.away, fixture.away_team_name)
        ) {
          url = `https://www.youtube.com/embed/${entry.videoId}`;
          break;
        }
      }
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
