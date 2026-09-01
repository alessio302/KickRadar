// Attaches a highlight-clip URL to a finished fixture by matching entries
// from each league's own official YouTube highlights playlist (public
// RSS/Atom feed -- no API key, no quota: https://www.youtube.com/feeds/
// videos.xml?playlist_id=<id>) against our fixtures, then pushes whoever
// favorited it once one shows up.
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
// Serie A only for now (confirmed live via diagnoseYoutubeHighlights.js
// against the "English Highlights | Serie A 2026/27" playlist -- real,
// current-season entries, e.g. "Calhanoglu The Nerazzurri Hero |
// CAGLIARI-INTER | HIGHLIGHTS | Serie A 2026/27"), per the user's explicit
// request to verify the approach on one league first. Add the other 4
// leagues' playlist ids to PLAYLIST_ID_BY_LEAGUE_SLUG once confirmed --
// a league with no entry here is silently skipped, not an error.
import { getSupabaseClient } from '../db/supabaseClient.js';
import { resolveClub } from '../news/clubMatch.js';
import { sendPushToFixtureFavoriters } from '../push/sendPush.js';
import { pushStringsFor, SUPPORTED_PUSH_LANGUAGES } from '../push/pushI18n.js';

const PLAYLIST_ID_BY_LEAGUE_SLUG = {
  'serie-a': 'PLcv0mBdEYNdk',
};

const LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
const RECHECK_INTERVAL_MS = 30 * 60 * 1000;

function feedUrl(playlistId) {
  return `https://www.youtube.com/feeds/videos.xml?playlist_id=${playlistId}`;
}

async function fetchPlaylistEntries(playlistId) {
  const res = await fetch(feedUrl(playlistId), {
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

// Title pattern confirmed live against the Serie A playlist: "<headline> |
// HOME-AWAY | HIGHLIGHTS | Serie A 2026/27" -- the "HOME-AWAY" segment is
// always the second pipe-separated field; split again on "-" for the two
// team names. Caps here ("CAGLIARI-INTER") don't matter -- resolveClub()
// normalizes case itself.
function parseTeams(title) {
  const segments = title.split('|').map((s) => s.trim());
  if (segments.length < 2) return null;
  const dashIndex = segments[1].indexOf('-');
  if (dashIndex === -1) return null;
  const home = segments[1].slice(0, dashIndex).trim();
  const away = segments[1].slice(dashIndex + 1).trim();
  if (!home || !away) return null;
  return { home, away };
}

function buildHighlightPayloads(fixtureId, leagueSlug, homeTeam, awayTeam) {
  const byLanguage = {};
  for (const lang of SUPPORTED_PUSH_LANGUAGES) {
    const s = pushStringsFor(lang).highlights;
    byLanguage[lang] = { title: s.title, body: `${homeTeam} - ${awayTeam}`, url: `/?league=${leagueSlug}&fixture=${fixtureId}` };
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
    const playlistId = PLAYLIST_ID_BY_LEAGUE_SLUG[league.slug];
    if (!playlistId) continue;

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
      entries = await fetchPlaylistEntries(playlistId);
    } catch (err) {
      console.error(`YouTube playlist fetch failed for ${league.slug}:`, err.message);
      continue;
    }

    // Resolve each RSS entry's team names to club ids once per sync run,
    // not once per candidate fixture below.
    const parsedEntries = entries
      .map((entry) => {
        const teams = parseTeams(entry.title);
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
