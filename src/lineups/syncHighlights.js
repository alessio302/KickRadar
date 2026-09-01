// Attaches a highlight-clip URL to a finished fixture by matching entries
// from each league's own official YouTube presence (public RSS/Atom feed --
// no API key, no quota: https://www.youtube.com/feeds/videos.xml?
// playlist_id=<id> or ?channel_id=<id>) against our fixtures, then pushes
// whoever favorited it once one shows up.
//
// Replaces an earlier version of this file built on GOAL API's Videos
// resource (/videos/match/:matchId) -- confirmed live (diagnostic against
// fixture 252, Inter vs Monza 2026-08-22, resolved to GOAL API's own match
// id correctly but returned zero videos; the wider league-level sample
// pulled earlier was entirely last season's clips despite a current
// createdAt) that GOAL API's own video coverage never reaches the current
// season here, so it could never have served this feature. Per the user's
// own redirect: since each league already runs an official YouTube channel
// for this, use that instead.
//
// Two feed shapes in use, per league, since not every broadcaster runs
// things the same way (both confirmed live via diagnostic scripts before
// being folded in here):
//  - Serie A: a single season-long playlist ("English Highlights | Serie A
//    2026/27", id PLcv0mBdEYNdk) that the league's own channel keeps
//    appending to all season -- confirmed live, so a playlist_id feed is
//    stable to hardcode here.
//  - Bundesliga: ZDFsportstudio's per-matchday playlist ("Bundesliga
//    Highlights 1. Spieltag 2026/27") turned out to look like a fresh
//    playlist made every Spieltag, which would go stale after one round.
//    Its CHANNEL's uploads feed (channel_id UClCIWcZNvq15p0Y-E4ToGOw,
//    "sportstudio fußball") carries the same clips without that weekly-id
//    problem, at the cost of also carrying 2. Bundesliga, Frauen-Bundesliga
//    and unrelated #shorts uploads mixed in -- parseTeams below filters
//    those out by title before ever reaching resolveClub().
import { getSupabaseClient } from '../db/supabaseClient.js';
import { resolveClub } from '../news/clubMatch.js';
import { sendPushToFixtureFavoriters } from '../push/sendPush.js';
import { pushStringsFor, SUPPORTED_PUSH_LANGUAGES } from '../push/pushI18n.js';

// Title pattern confirmed live against the Serie A playlist: "<headline> |
// HOME-AWAY | HIGHLIGHTS | Serie A 2026/27" -- the "HOME-AWAY" segment is
// always the second pipe-separated field; split again on "-" for the two
// team names. Caps here ("CAGLIARI-INTER") don't matter -- resolveClub()
// normalizes case itself.
function parseSerieATeams(title) {
  const segments = title.split('|').map((s) => s.trim());
  if (segments.length < 2) return null;
  const dashIndex = segments[1].indexOf('-');
  if (dashIndex === -1) return null;
  const home = segments[1].slice(0, dashIndex).trim();
  const away = segments[1].slice(dashIndex + 1).trim();
  if (!home || !away) return null;
  return { home, away };
}

// Title pattern confirmed live against the ZDFsportstudio channel feed:
// "TEAM1 – TEAM2 | Bundesliga, X. Spieltag 2026/27 | ZDFsportstudio" -- an
// EN DASH (not a hyphen) between the team names. Only matches when "|
// Bundesliga," follows immediately (whitespace aside): confirmed live this
// excludes "| 2. Bundesliga," and "| Frauen-Bundesliga," (the "2. "/
// "Frauen-" prefix sits between the pipe and "Bundesliga," so the anchored
// match never fires for those), which the same channel also uploads to.
function parseBundesligaTeams(title) {
  if (!/\|\s*Bundesliga,/.test(title)) return null;
  const teamsPart = title.split('|')[0];
  const dashIndex = teamsPart.indexOf('–'); // en dash
  if (dashIndex === -1) return null;
  const home = teamsPart.slice(0, dashIndex).trim();
  const away = teamsPart.slice(dashIndex + 1).trim();
  if (!home || !away) return null;
  return { home, away };
}

const YOUTUBE_SOURCE_BY_LEAGUE_SLUG = {
  'serie-a': { feedUrl: 'https://www.youtube.com/feeds/videos.xml?playlist_id=PLcv0mBdEYNdk', parseTeams: parseSerieATeams },
  bundesliga: { feedUrl: 'https://www.youtube.com/feeds/videos.xml?channel_id=UClCIWcZNvq15p0Y-E4ToGOw', parseTeams: parseBundesligaTeams },
};

const LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
const RECHECK_INTERVAL_MS = 30 * 60 * 1000;

async function fetchFeedEntries(feedUrl) {
  const res = await fetch(feedUrl, {
    headers: {
      // Confirmed live (diagnoseYoutubeHighlights.js): the feed serves fine
      // without this, but a real UA is kept here as cheap insurance against
      // a default Node fetch UA getting treated differently down the line.
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

function buildHighlightPayloads(fixtureId, leagueSlug, homeTeam, awayTeam) {
  const byLanguage = {};
  for (const lang of SUPPORTED_PUSH_LANGUAGES) {
    const s = pushStringsFor(lang).highlights;
    // view=highlights -- App.jsx reads this alongside league/fixture so
    // tapping the notification opens straight on the highlights tab
    // instead of the overlay's default lineups tab.
    byLanguage[lang] = { title: s.title, body: `${homeTeam} - ${awayTeam}`, url: `/?league=${leagueSlug}&fixture=${fixtureId}&view=highlights` };
  }
  return byLanguage;
}

async function findCandidates(supabase, leagueId) {
  const cutoff = new Date(Date.now() - LOOKBACK_MS).toISOString();
  const recheckBefore = new Date(Date.now() - RECHECK_INTERVAL_MS).toISOString();
  const { data, error } = await supabase
    .from('fixtures')
    .select('id, home_club_id, away_club_id, kickoff_at')
    .eq('league_id', leagueId)
    .eq('status', 'finished')
    .is('highlight_video_url', null)
    .gte('kickoff_at', cutoff)
    .or(`highlight_checked_at.is.null,highlight_checked_at.lt.${recheckBefore}`)
    .order('kickoff_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function syncHighlights() {
  const supabase = getSupabaseClient();

  const { data: leagues, error: leaguesErr } = await supabase.from('leagues').select('id, slug');
  if (leaguesErr) throw leaguesErr;

  let checked = 0;
  let found = 0;
  let pushed = 0;

  for (const league of leagues ?? []) {
    const source = YOUTUBE_SOURCE_BY_LEAGUE_SLUG[league.slug];
    if (!source) continue;

    const candidates = await findCandidates(supabase, league.id);
    if (candidates.length === 0) continue;

    const { data: clubs, error: clubsErr } = await supabase
      .from('clubs')
      .select('id, name, short_name, aliases')
      .eq('league_id', league.id);
    if (clubsErr) throw clubsErr;
    const clubById = new Map((clubs ?? []).map((c) => [c.id, c]));

    let entries;
    try {
      entries = await fetchFeedEntries(source.feedUrl);
    } catch (err) {
      console.error(`YouTube feed fetch failed for ${league.slug}:`, err.message);
      continue;
    }

    // Resolve each RSS entry's team names to club ids once per sync run,
    // not once per candidate fixture below.
    const parsedEntries = entries
      .map((entry) => {
        const teams = source.parseTeams(entry.title);
        if (!teams) return null;
        const homeClub = resolveClub(teams.home, clubs ?? []);
        const awayClub = resolveClub(teams.away, clubs ?? []);
        if (!homeClub || !awayClub) return null;
        return { videoId: entry.videoId, homeClubId: homeClub.id, awayClubId: awayClub.id };
      })
      .filter(Boolean);

    for (const fixture of candidates) {
      checked += 1;
      const match = parsedEntries.find(
        (e) => e.homeClubId === fixture.home_club_id && e.awayClubId === fixture.away_club_id
      );
      const url = match ? `https://www.youtube.com/embed/${match.videoId}` : null;

      await supabase
        .from('fixtures')
        .update({ highlight_video_url: url, highlight_checked_at: new Date().toISOString() })
        .eq('id', fixture.id);

      if (url) {
        found += 1;
        const { count } = await supabase
          .from('favorite_fixtures')
          .select('id', { count: 'exact', head: true })
          .eq('fixture_id', fixture.id);
        if (count) {
          const homeTeam = clubById.get(fixture.home_club_id)?.short_name ?? clubById.get(fixture.home_club_id)?.name ?? '';
          const awayTeam = clubById.get(fixture.away_club_id)?.short_name ?? clubById.get(fixture.away_club_id)?.name ?? '';
          try {
            await sendPushToFixtureFavoriters(
              fixture.id,
              buildHighlightPayloads(fixture.id, league.slug, homeTeam, awayTeam)
            );
            pushed += 1;
          } catch (err) {
            console.error(`Failed to push highlight for fixture ${fixture.id}:`, err.message);
          }
          // syncLiveScores.js deliberately leaves a finished fixture's
          // favorites alone so there's still someone to notify once a
          // highlight shows up (see that file's own comment); clearing them
          // here, right after a successful push, is what actually retires
          // them -- favorite_fixtures_finished_cleanup (036 migration) is
          // only the 24h backstop for fixtures that never get a highlight.
          const { error: favErr } = await supabase.from('favorite_fixtures').delete().eq('fixture_id', fixture.id);
          if (favErr) console.error(`Failed to clear favorites for fixture ${fixture.id}:`, favErr.message);
        }
      }
    }
  }

  return { checked, found, pushed };
}

const isMain = process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href;
if (isMain) {
  syncHighlights()
    .then((result) => console.log('Highlights sync complete:', result))
    .catch((err) => {
      console.error('Highlights sync failed:', err);
      process.exitCode = 1;
    });
}
