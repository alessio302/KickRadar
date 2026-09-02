import * as cheerio from 'cheerio';
import { normalize } from '../util/normalize.js';
import { searchPlayers, getPlayer } from '../lineups/goalApiClient.js';

const TRANSFERMARKT_BASE = 'https://www.transfermarkt.de';

// Confirmed live: GOAL API's response headers only describe its 1000/day
// bucket (X-RateLimit-Type: DAILY), but real calls got rejected well under
// that daily number -- inconsistently as a 429 RATE_LIMIT_EXCEEDED (from
// the app itself) or a bare 502 with Retry-After: 60 (a gateway layer in
// front of it). Confirmed live this isn't purely a function of this
// module's own call spacing either: a fresh process's very first call (no
// prior spacing to blame) still 429'd -- syncLineups.js/syncLiveEvents.js
// already poll this same GOAL_API_KEY on their own 15-min schedules, so a
// short-term limit can already be partly spent by the time this runs,
// independent of anything this file does. Spacing every call here at 6.5s
// reduces self-inflicted collisions.
//
// Retrying on 429/502 itself now lives in goalApiClient.js's shared call()
// (added once that became a live-events problem too, not just this file's).
// This used to also retry with its own growing backoff on top of that --
// confirmed live that stacked the two layers: goalApiClient's own 3
// attempts (up to ~24s of internal backoff) got wrapped in another 3
// attempts here, multiplying out to minutes per player during a genuinely
// busy window and stalling a whole news-scraper run over just a couple of
// new players. Spacing calls is still this file's own job (goalApiClient
// has no idea multiple call sites share one budget); retrying a failure is
// not, now that there's one shared place doing it.
const MIN_GOAL_API_INTERVAL_MS = 6500;
let lastGoalApiCallAt = 0;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function throttleGoalApi(fn) {
  const wait = lastGoalApiCallAt + MIN_GOAL_API_INTERVAL_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastGoalApiCallAt = Date.now();
  return fn();
}

// GOAL API's own singular/plural mismatch with this app's existing
// position keys (web/src/i18n/translations.js's t.lineup.positions,
// inherited from Highlightly's enum) -- same normalization
// syncLineups.js's groupByPositionRows() already applies to lineup data,
// duplicated here rather than shared since it's 4 lines either way.
// Exported for syncPlayerProfiles.js's own field mapping -- see that
// file's own comment on why it can't just call buildProfileFields()
// below directly (a squad-endpoint entry and a single-player-endpoint
// profile don't share the same raw shape), but the actual stat field
// list and position vocabulary genuinely are identical between the two,
// so those two pieces stay a single source of truth rather than a second
// copy that could quietly drift from this one.
export const POSITION_SINGULAR = {
  Goalkeepers: 'Goalkeeper',
  Defenders: 'Defender',
  Midfielders: 'Midfielder',
  Forwards: 'Forward',
};

// Curated subset of GOAL API's player-profile stat fields -- confirmed
// live several others (passesAccuracy, duelsTotal, dribbleAttempts, ...)
// exist but are attempt/denominator counts this app doesn't try to turn
// into a percentage; these are the plain counts worth showing as-is.
// No season identifier exists anywhere in this response (confirmed live) --
// these are just whatever GOAL API currently has on file for the player,
// almost certainly the current season given how low matchPlayed reads
// early in one, but that's an inference from the number, not something
// the API states.
export const STAT_FIELDS = [
  'matchPlayed',
  'goals',
  'assists',
  'yellowCards',
  'redCards',
  'rating',
  'minutes',
  'shotsTotal',
  'passes',
  'keyPasses',
  'tackles',
  'interceptions',
  'duelsWon',
  'dribbleSucc',
  // Goalkeeper-specific -- null for every outfield player (confirmed live,
  // e.g. 27 sampled Cologne/Hoffenheim/etc. squad entries), so extractStats()'s
  // existing != null filter already keeps these off an outfield player's
  // card for free; no separate position check needed here.
  'saves',
  'insideBoxSaves',
  'goalsConceded',
];

export function extractStats(profile) {
  const stats = {};
  for (const key of STAT_FIELDS) {
    if (profile[key] != null) stats[key] = profile[key];
  }
  return stats;
}

// GOAL API's player profile has no separate "nationality" concept of its
// own beyond a top-level `country` field that's frequently null (confirmed
// live) -- but when a player currently has no club on file, `team` itself
// falls back to their senior national team instead of being empty
// (confirmed live for a free-agent transfer target: team.name and
// team.country were both "Argentina"). That fallback is the one case
// where team.country IS the player's real nationality, not just the
// country a real club happens to be based in -- detected here by
// name === country, since a genuine club's own country almost never
// equals its own name.
function extractClubAndNationality(profile) {
  const team = profile.team;
  const isNationalTeamFallback = !!team && team.name === team.country;

  return {
    current_club_name: team && !isNationalTeamFallback ? team.name || null : null,
    current_club_badge: team && !isNationalTeamFallback ? team.badge || null : null,
    nationality_name: profile.country || (isNationalTeamFallback ? team.country : null) || null,
    nationality_badge: isNationalTeamFallback ? team.badge || null : null,
  };
}

// GOAL API's player search is global (~1000 leagues, same collision risk
// as league name search -- see config/leagues.js) -- a bare name search
// for something like "Silva" can return several unrelated real players.
// Only trusts a result when it's the sole hit, or when exactly one hit's
// current club matches one of the clubs this transfer story already
// resolved (from_club/to_club) -- multiple ambiguous matches are left
// unresolved rather than guessed at, same principle
// runNewsScraper.js's lookupSquadMembership() already applies.
function pickBestMatch(results, candidateClubNames) {
  if (results.length === 0) return null;
  if (results.length === 1) return results[0];

  const candidates = candidateClubNames.filter(Boolean).map(normalize);
  const scored = results.filter((r) => {
    const teamName = normalize(r.team?.name || '');
    return teamName && candidates.some((c) => teamName.includes(c) || c.includes(teamName));
  });
  return scored.length === 1 ? scored[0] : null;
}

// Shared shape-builder between resolveGoalApiProfile() (a fresh player,
// found via name search) and refreshGoalApiProfileById() (an already-known
// goal_api_id, re-fetched later by refreshPlayerProfiles.js) -- both end up
// with the exact same raw GOAL API player object at this point, just
// reached via a different first step.
// goal_api_updated_at is GOAL API's own `updatedAt` on the raw profile --
// confirmed live this only moves when GOAL API actually recomputes the
// player's data (a long-term-injured player with no minutes since can sit
// on the same value for months), unlike our own stats_refreshed_at (030),
// which bumps to now() on every successful poll regardless of whether
// anything changed. Storing this separately is what lets the UI show a
// real freshness date instead of "when we last happened to ask".
function buildProfileFields(profile) {
  return {
    goal_api_id: profile.id,
    photo_url: profile.image || null,
    birthdate: profile.birthdate || null,
    position: POSITION_SINGULAR[profile.type] || profile.type || null,
    squad_number: profile.number || null,
    injured: profile.injured === 'Yes',
    goal_api_updated_at: profile.updatedAt || null,
    ...extractClubAndNationality(profile),
    stats: extractStats(profile),
  };
}

// Resolves a player against GOAL API's own player database instead of
// transfermarkt.de's fragile quick-search scrape -- confirmed live it
// returns a real photo, birthdate, current club (with badge), and a
// season stats snapshot, all from the same provider/quota already used
// for lineups and live events. Returns null (never throws for a genuine
// "no confident match") so the caller can fall back to the transfermarkt
// link, same as before this existed.
export async function resolveGoalApiProfile(playerName, candidateClubNames) {
  try {
    const results = await throttleGoalApi(() => searchPlayers(playerName));
    const match = pickBestMatch(results, candidateClubNames);
    if (!match) return null;

    const profile = await throttleGoalApi(() => getPlayer(match.id));
    if (!profile) return null;

    return buildProfileFields(profile);
  } catch (err) {
    console.error(`GOAL API player resolution failed for "${playerName}":`, err.message);
    return null;
  }
}

// Re-fetches an already-resolved player by their known goal_api_id --
// used by refreshPlayerProfiles.js to keep stats/club/injury status from
// going stale forever after the one-time resolution above. Costs exactly
// one GOAL API call (no search step needed, the id is already known),
// unlike resolveGoalApiProfile()'s two.
export async function refreshGoalApiProfileById(goalApiId) {
  try {
    const profile = await throttleGoalApi(() => getPlayer(goalApiId));
    if (!profile) return null;
    return buildProfileFields(profile);
  } catch (err) {
    console.error(`GOAL API profile refresh failed for goal_api_id "${goalApiId}":`, err.message);
    return null;
  }
}

function quickSearchUrl(playerName) {
  return `${TRANSFERMARKT_BASE}/schnellsuche/ergebnis/schnellsuche?query=${encodeURIComponent(playerName)}`;
}

// Scrapes transfermarkt's quick-search results for the first player profile
// link. Falls back to the search URL itself (per briefing: "Fallback auf
// Schnellsuche") when no direct profile can be resolved.
async function lookupTransfermarktUrl(playerName) {
  const searchUrl = quickSearchUrl(playerName);
  try {
    const res = await fetch(searchUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      },
    });
    if (!res.ok) return { url: searchUrl, resolved: false };

    const html = await res.text();
    const $ = cheerio.load(html);
    const firstProfileLink = $('a[href*="/profil/spieler/"]').first().attr('href');
    if (firstProfileLink) {
      return { url: new URL(firstProfileLink, TRANSFERMARKT_BASE).toString(), resolved: true };
    }
    return { url: searchUrl, resolved: false };
  } catch {
    return { url: searchUrl, resolved: false };
  }
}

// Resolves and caches a player's profile -- GOAL API's own player database
// first (real photo/birthdate/club/stats, see resolveGoalApiProfile()),
// falling back to transfermarkt.de's quick-search scrape only when GOAL API
// has no confident match. Resolution happens once per player name
// (normalized), like before; subsequent calls hit the cache as-is, so a
// player's photo/stats are a snapshot from whenever they were first
// resolved, not refreshed later -- same accepted tradeoff this cache
// already had for transfermarkt_url.
//
// candidateClubNames lets the caller pass the transfer's own already-
// resolved from_club/to_club, used only to disambiguate a common name
// against GOAL API's global player search (see pickBestMatch()) -- never
// required, but resolution silently stays less certain without it.
export async function resolvePlayerProfile(supabase, playerName, candidateClubNames = []) {
  const normalized = normalize(playerName);

  const { data: existing, error: lookupErr } = await supabase
    .from('players')
    .select('id, transfermarkt_url, goal_api_id, photo_url')
    .eq('normalized_name', normalized)
    .maybeSingle();
  if (lookupErr) throw lookupErr;
  // A cached row with no goal_api_id means the FIRST resolution attempt
  // never got a confident GOAL API match -- confirmed live this includes
  // plenty of cases where GOAL API was just transiently unavailable (a
  // 429/502 exhausted goalApiClient.js's own retries, or this file's
  // GOAL API interval collided with a busy window) for an otherwise
  // perfectly resolvable real player, not just genuine no-match cases.
  // Without this, that one bad-timing attempt permanently locks the
  // player onto the transfermarkt.de fallback forever, since every future
  // mention of the same name just returns this same cached row on line
  // 209 above without ever asking GOAL API again. Retrying here means a
  // player heals the next time any transfer story mentions them again,
  // at the cost of one extra GOAL API call for names that turn out to
  // still have no real match (rare enough not to matter next to the
  // stories permanently stuck otherwise).
  if (existing && existing.goal_api_id) return existing;

  const goalApiProfile = await resolveGoalApiProfile(playerName, candidateClubNames);

  if (existing) {
    if (!goalApiProfile) return existing;
    const { data: updated, error: updateErr } = await supabase
      .from('players')
      .update(goalApiProfile)
      .eq('id', existing.id)
      .select('id, transfermarkt_url, goal_api_id, photo_url')
      .single();
    if (updateErr) throw updateErr;
    return updated;
  }

  const transfermarktUrl = goalApiProfile ? null : (await lookupTransfermarktUrl(playerName)).url;

  const { data: inserted, error: insertErr } = await supabase
    .from('players')
    .insert({
      name: playerName,
      normalized_name: normalized,
      transfermarkt_url: transfermarktUrl,
      resolved_at: new Date().toISOString(),
      ...(goalApiProfile ?? {}),
    })
    .select('id, transfermarkt_url, goal_api_id, photo_url')
    .single();
  if (insertErr) throw insertErr;

  return inserted;
}
