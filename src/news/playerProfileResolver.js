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
// reduces self-inflicted collisions; the retries with growing backoff
// (10s, then 20s) ride out the rest. Genuine exhaustion still degrades
// gracefully -- resolveGoalApiProfile() below returns null on total
// failure, same as any other "no confident match", so the caller falls
// back to the transfermarkt.de link rather than losing the transfer story.
const MIN_GOAL_API_INTERVAL_MS = 6500;
const RETRY_BACKOFFS_MS = [10000, 20000];
let lastGoalApiCallAt = 0;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function throttleGoalApi() {
  const wait = lastGoalApiCallAt + MIN_GOAL_API_INTERVAL_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastGoalApiCallAt = Date.now();
}

async function callGoalApiThrottled(fn) {
  await throttleGoalApi();
  for (const backoff of [0, ...RETRY_BACKOFFS_MS]) {
    if (backoff > 0) {
      console.warn(`GOAL API rate/gateway error, retrying after ${backoff}ms backoff`);
      await sleep(backoff);
      lastGoalApiCallAt = Date.now();
    }
    try {
      return await fn();
    } catch (err) {
      if (!/\b(429|502)\b/.test(err.message)) throw err;
      if (backoff === RETRY_BACKOFFS_MS[RETRY_BACKOFFS_MS.length - 1]) throw err;
    }
  }
}

// GOAL API's own singular/plural mismatch with this app's existing
// position keys (web/src/i18n/translations.js's t.lineup.positions,
// inherited from Highlightly's enum) -- same normalization
// syncLineups.js's groupByPositionRows() already applies to lineup data,
// duplicated here rather than shared since it's 4 lines either way.
const POSITION_SINGULAR = {
  Goalkeepers: 'Goalkeeper',
  Defenders: 'Defender',
  Midfielders: 'Midfielder',
  Forwards: 'Forward',
};

// Curated subset of GOAL API's player-profile stat fields -- confirmed
// live many others (shotsTotal, tackles, blocks, ...) come back null
// depending on coverage; these are the ones reliably populated.
const STAT_FIELDS = ['matchPlayed', 'goals', 'assists', 'yellowCards', 'redCards', 'rating', 'minutes'];

function extractStats(profile) {
  const stats = {};
  for (const key of STAT_FIELDS) {
    if (profile[key] != null) stats[key] = profile[key];
  }
  return stats;
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

// Resolves a player against GOAL API's own player database instead of
// transfermarkt.de's fragile quick-search scrape -- confirmed live it
// returns a real photo, birthdate, current club (with badge), and a
// season stats snapshot, all from the same provider/quota already used
// for lineups and live events. Returns null (never throws for a genuine
// "no confident match") so the caller can fall back to the transfermarkt
// link, same as before this existed.
async function resolveGoalApiProfile(playerName, candidateClubNames) {
  try {
    const results = await callGoalApiThrottled(() => searchPlayers(playerName));
    const match = pickBestMatch(results, candidateClubNames);
    if (!match) return null;

    const profile = await callGoalApiThrottled(() => getPlayer(match.id));
    if (!profile) return null;

    return {
      goal_api_id: profile.id,
      photo_url: profile.image || null,
      birthdate: profile.birthdate || null,
      position: POSITION_SINGULAR[profile.type] || profile.type || null,
      current_club_name: profile.team?.name || null,
      current_club_badge: profile.team?.badge || null,
      stats: extractStats(profile),
    };
  } catch (err) {
    console.error(`GOAL API player resolution failed for "${playerName}":`, err.message);
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
  if (existing) return existing;

  const goalApiProfile = await resolveGoalApiProfile(playerName, candidateClubNames);
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
