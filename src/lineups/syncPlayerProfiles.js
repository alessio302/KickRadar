import { getSupabaseClient } from '../db/supabaseClient.js';
import { getTeamSquad, searchPlayers, getPlayer } from './goalApiClient.js';
import { normalize } from '../util/normalize.js';
import { POSITION_SINGULAR, STAT_FIELDS, extractStats, pickBestMatch, buildProfileFields } from '../news/playerProfileResolver.js';

const FOOTBALL_DATA_BASE_URL = process.env.FOOTBALL_DATA_BASE_URL || 'https://api.football-data.org/v4';

// Confirmed live (this session's investigation): GOAL API's own club-scoped
// squad endpoint (/teams/{id}/players, used below via getTeamSquad) can be
// badly incomplete for specific players -- Arsenal returned only 11 of 25
// real squad members, missing Saka/Ødegaard/Rice/Saliba/... entirely.
// Root cause: those players' current-club association is unset in GOAL
// API's own database right now (their `team` field falls back to their
// national team instead -- likely a September international-break side
// effect), and the club-scoped endpoint can only return players it has
// linked to that club id. GOAL API's NAME-based global search (not
// club-scoped, see gapFillProfile() below) still finds these players
// fine, with a real photo and full stats.
//
// football-data.org's own /teams/{id} squad list has no such gap --
// confirmed live, Arsenal's list there was a correct, complete 25/25 --
// but carries no photo and no season stats at all, so it can't replace
// GOAL API outright (see this session's own comparison). Used here as the
// authoritative "who is really on this squad" source instead: for every
// name it lists, first try an in-memory match against the (possibly
// incomplete) GOAL API squad response already fetched for this club --
// free, no extra call. Only the names that GOAL API's squad listing
// dropped fall through to a live gapFillProfile() search, so the common
// case (GOAL API's listing already has the player) costs nothing extra
// over the old squad-only approach.
async function getFootballDataSquad(externalTeamId) {
  const apiKey = process.env.FOOTBALL_DATA_API_KEY;
  if (!apiKey) throw new Error('Missing FOOTBALL_DATA_API_KEY env var.');
  const res = await fetch(`${FOOTBALL_DATA_BASE_URL}/teams/${externalTeamId}`, { headers: { 'X-Auth-Token': apiKey } });
  if (!res.ok) throw new Error(`GET /teams/${externalTeamId} failed: ${res.status} ${res.statusText}`);
  const data = await res.json();
  return data.squad || [];
}

// A gap-fill resolution costs 2 GOAL API calls (search + fetch), vastly
// more expensive per player than the free in-memory match. Capped so one
// run with an unusually large gap (a provider-side hiccup wider than the
// Arsenal/Inter/Roma case this was built for) can't blow past GOAL API's
// shared 1000/day budget or run indefinitely -- gapFilled vs
// gapUnresolved in the return value shows whether the cap was ever hit.
//
// Confirmed live: 200 was still too high in practice. GOAL API's 1000/900s
// window is shared with lineups-sync.yml's own 15-min-cadence runs, which
// keep drawing from the same window while this job is also running -- so
// once the window is under real contention, every gap-fill call can hit
// goalApiClient.js's own reactive 429 backoff (8s, then 16s, then up to
// 60s if the server names a longer Retry-After), not just this file's own
// 1.5s proactive spacing between calls. That backoff cost, not the
// proactive pacing, is what dominates once the window is contended --
// confirmed live: with the cap at 200, a single early club with many gaps
// (Toulouse) alone ate 10+ minutes of a run entirely on gap-fill retries,
// never reaching the rest of the alphabet. Lowered so covering every club
// at least once wins over exhaustively filling gaps in whichever club
// happens to come first -- the remaining gaps close gradually across
// several 6h runs instead of one run trying to close them all at once.
const MAX_GAP_FILLS_PER_RUN = 30;

// Confirmed live: a first version of this reused playerProfileResolver.js's
// resolveGoalApiProfile(), which paces every GOAL API call 6.5s apart via
// its own throttleGoalApi(). That pacing was tuned for the news scraper's
// use (a handful of calls per run, sharing the budget with several other
// 15-min-cadence jobs) -- for this job's gap-filling, which can hit
// dozens of players in one club (Arsenal alone needed 14), it meant a
// single club could take minutes and the full ~96-club run projected to
// ~4.5h, far past any reasonable workflow timeout. GOAL API's own stated
// limit is 1000 requests per 900s sliding window (see goalApiClient.js's
// own comment on that header) -- an average 0.9s/call -- so 1.5s stays a
// safe, deliberately conservative margin under that while still being
// ~4x faster than the news-scraper pacing. A separate, local throttle
// here (not a shared module-level one) keeps this from affecting
// playerProfileResolver.js's own callers at all.
const GAP_FILL_INTERVAL_MS = 1500;
let lastGapFillCallAt = 0;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function throttledGapFillCall(fn) {
  const wait = lastGapFillCallAt + GAP_FILL_INTERVAL_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastGapFillCallAt = Date.now();
  return fn();
}

// Same two-step search-then-fetch resolveGoalApiProfile() does, reusing
// its own pickBestMatch()/buildProfileFields() so the actual matching and
// field-shaping logic has one source -- only the pacing differs.
async function gapFillProfile(playerName, candidateClubNames) {
  try {
    const results = await throttledGapFillCall(() => searchPlayers(playerName));
    const match = pickBestMatch(results, candidateClubNames);
    if (!match) return null;

    const profile = await throttledGapFillCall(() => getPlayer(match.id));
    if (!profile) return null;

    return buildProfileFields(profile);
  } catch (err) {
    console.error(`Gap-fill resolution failed for "${playerName}":`, err.message);
    return null;
  }
}

function lastToken(name) {
  const parts = normalize(name).trim().split(/\s+/);
  return parts[parts.length - 1];
}

// Bag-of-words key, insensitive to word order and hyphen-vs-space --
// confirmed live (2026-09-06, a user report of blank/duplicate squad
// entries across ~30 clubs): byNormalizedName's exact-string match misses
// a real player whenever football-data.org's own name spelling for them
// differs from however they were first resolved -- "Reis Vitor" (GOAL
// API's own order) vs. football-data.org's "Vitor Reis", or "Kiernan
// Dewsbury-Hall" vs. "Kiernan Dewsbury Hall" (hyphen vs. space). Every
// case sampled was one of exactly these two differences, never an
// actually-different name, so this never needs to fall back to gap-fill
// or an insert at all -- it just needed a name-equality check that isn't
// order/punctuation-sensitive. Scoped to the same club (not global) so
// two genuinely different players who happen to share every token stay
// distinct.
function canonicalTokenKey(name) {
  return normalize(name)
    .split(/[\s-]+/)
    .filter(Boolean)
    .sort()
    .join(' ');
}

// buildFieldsFromSquadEntry() can't just reuse playerProfileResolver.js's
// own buildProfileFields() -- confirmed live a squad-endpoint entry and a
// single-player-endpoint profile don't share a raw shape (this one has a
// flat `country` string and a `teamId`, not the other's nested `team`
// object with its national-team-fallback ambiguity) -- but the stat field
// list and position vocabulary genuinely are identical between the two,
// so those stay imported from that file rather than a second copy that
// could quietly drift from it. The club's own name/badge are used
// directly for current_club_name/badge here (we're iterating its squad,
// so there's no ambiguity to resolve the way buildProfileFields() needs
// its national-team fallback for).
function buildFieldsFromSquadEntry(p, club) {
  return {
    photo_url: p.image || null,
    birthdate: p.birthdate || null,
    position: POSITION_SINGULAR[p.type] || p.type || null,
    squad_number: p.number || null,
    injured: p.injured === 'Yes',
    goal_api_updated_at: p.updatedAt || null,
    current_club_name: club.name,
    current_club_badge: club.crest_url || null,
    nationality_name: p.country || null,
    nationality_badge: null,
    stats: extractStats(p),
  };
}

export async function syncPlayerProfiles() {
  const supabase = getSupabaseClient();

  const { data: clubs, error: clubsErr } = await supabase
    .from('clubs')
    .select('id, name, crest_url, goal_api_id, external_team_id')
    .not('goal_api_id', 'is', null)
    .not('external_team_id', 'is', null);
  if (clubsErr) throw clubsErr;

  // Loaded once up front rather than per player -- a player can already
  // have a row from playerProfileResolver.js's transfer-story resolution
  // (keyed by whatever name spelling that headline used, e.g. "Rowe" vs.
  // "Jonathan Rowe"), so this still needs the same by-goal_api_id-then-
  // by-normalized_name match that function's own resolvePlayerProfile()
  // does -- just resolved from an in-memory Map instead of two SELECTs
  // per player, since this walks the entire squad list (~2000 players)
  // every run rather than one name at a time.
  const { data: existingRows, error: existingErr } = await supabase
    .from('players')
    .select('id, goal_api_id, normalized_name, name, current_club_name');
  if (existingErr) throw existingErr;
  const byGoalApiId = new Map(existingRows.filter((r) => r.goal_api_id).map((r) => [r.goal_api_id, r.id]));
  const byNormalizedName = new Map(existingRows.map((r) => [r.normalized_name, r.id]));

  // Same collision-drop safety as goalByLastToken below -- two distinct
  // real players sharing every name token within one club would be
  // exceptionally rare, but ambiguous is still left unresolved rather
  // than guessed at, same principle as everywhere else in this file.
  const byClubCanonical = new Map();
  const clubCanonicalCollided = new Set();
  for (const r of existingRows) {
    if (!r.current_club_name) continue;
    const key = `${r.current_club_name}|${canonicalTokenKey(r.name)}`;
    if (clubCanonicalCollided.has(key)) continue;
    if (byClubCanonical.has(key)) {
      byClubCanonical.delete(key);
      clubCanonicalCollided.add(key);
      continue;
    }
    byClubCanonical.set(key, r.id);
  }

  let checked = 0;
  let updated = 0;
  let inserted = 0;
  let failed = 0;
  let gapFilled = 0;
  let gapUnresolved = 0;
  let gapFillBudgetLeft = MAX_GAP_FILLS_PER_RUN;
  // A run of failures this long means GOAL API's rate-limit window is
  // genuinely contended right now (see MAX_GAP_FILLS_PER_RUN's own
  // comment) -- confirmed live, once that's true, every further attempt
  // just eats another 8-60s of goalApiClient.js's own backoff for the
  // same result. Zeroing the budget here stops burning run time on gap
  // fills that won't succeed anyway; the remaining clubs still get their
  // free in-memory matches, just no more live searches this run.
  const MAX_CONSECUTIVE_GAP_FILL_FAILURES = 5;
  let consecutiveGapFillFailures = 0;

  for (const club of clubs) {
    let fdSquad;
    try {
      fdSquad = await getFootballDataSquad(club.external_team_id);
    } catch (err) {
      console.error(`football-data.org squad fetch failed for ${club.name}:`, err.message);
      failed += 1;
      await sleep(6500);
      continue;
    }

    let goalSquad;
    try {
      goalSquad = await getTeamSquad(club.goal_api_id);
    } catch (err) {
      console.error(`GOAL API squad fetch failed for ${club.name}:`, err.message);
      goalSquad = [];
    }
    // Confirmed live (this session's investigation, real Inter squad data):
    // a same-club surname collision -- Josep Martinez (GK) and Lautaro
    // Martinez (FW) both on Inter's real GOAL API squad list -- is NOT
    // rare or harmless. A previous version of this map kept "first entry
    // wins" and left the loser's own key pointing at the WINNER's entry
    // (not falling through to gap-fill as its own comment assumed, since
    // the key itself still resolves to *something*): whichever of the two
    // players' football-data.org squad rows got processed here picked up
    // the OTHER player's photo, squad number, and position outright. Live
    // confirmed: this is exactly how Josep Martinez's `players` row ended
    // up with Lautaro Martinez's photo, "10" shirt number, and "Forward"
    // position. Both players individually resolve correctly via GOAL
    // API's own name search (confirmed live -- searching either full name
    // returns exactly that player, no ambiguity), so a colliding surname
    // is dropped from the free in-memory map entirely rather than kept
    // under either player's key -- both collide-losers then fall through
    // to the (already-correct) gap-fill search below instead of silently
    // borrowing a teammate's identity.
    const goalByLastToken = new Map();
    const collidedLastTokens = new Set();
    for (const gp of goalSquad) {
      const key = lastToken(gp.name);
      if (collidedLastTokens.has(key)) continue;
      if (goalByLastToken.has(key)) {
        goalByLastToken.delete(key);
        collidedLastTokens.add(key);
        continue;
      }
      goalByLastToken.set(key, gp);
    }

    for (const fp of fdSquad) {
      checked += 1;
      try {
        const goalEntry = goalByLastToken.get(lastToken(fp.name)) ?? null;
        let resolvedFields = null;

        if (!goalEntry) {
          if (gapFillBudgetLeft > 0) {
            gapFillBudgetLeft -= 1;
            resolvedFields = await gapFillProfile(fp.name, [club.name]);
          }
          if (resolvedFields) {
            gapFilled += 1;
            consecutiveGapFillFailures = 0;
          } else {
            gapUnresolved += 1;
            consecutiveGapFillFailures += 1;
            if (consecutiveGapFillFailures >= MAX_CONSECUTIVE_GAP_FILL_FAILURES) gapFillBudgetLeft = 0;
          }
        }

        // football-data.org's own dateOfBirth/position (the authoritative
        // "who's really on this squad" source) win over whichever GOAL
        // API path filled in the rest, current_club_name/badge always
        // come from `club` itself -- a gapFillProfile() hit here can carry
        // a stale/wrong club (its own team fallback, e.g. "England"
        // instead of Arsenal, see this file's top comment), and even a
        // clean goalEntry match is redundant with the club we already know
        // we're iterating.
        const base = resolvedFields ?? (goalEntry ? buildFieldsFromSquadEntry(goalEntry, club) : {});
        const fields = {
          ...base,
          birthdate: fp.dateOfBirth || base.birthdate || null,
          position: POSITION_SINGULAR[fp.position] || base.position || fp.position || null,
          current_club_name: club.name,
          current_club_badge: club.crest_url || null,
        };
        const goalApiId = resolvedFields?.goal_api_id ?? goalEntry?.id ?? null;

        const normalizedName = normalize(fp.name);
        const canonicalKey = `${club.name}|${canonicalTokenKey(fp.name)}`;
        const targetId =
          (goalApiId && byGoalApiId.get(goalApiId)) ?? byNormalizedName.get(normalizedName) ?? byClubCanonical.get(canonicalKey) ?? null;
        // goal_api_id is only ever set here when this run actually resolved
        // one -- confirmed live this was previously unconditional
        // (`goal_api_id: goalApiId`), which meant a single failed
        // resolution (a transient GOAL API hiccup, or the international-
        // break national-team-fallback this file's own top comment
        // describes) permanently wiped an already-correct goal_api_id off
        // an existing row on the very next run, even though the row's
        // photo/number/etc. were left untouched and still looked fine --
        // silently breaking get-player-profile's own by-goal_api_id lookup
        // for that player from then on. Omitting the key when unresolved
        // leaves whatever the row already had alone instead.
        const row = { stats_refreshed_at: new Date().toISOString(), ...fields };
        if (goalApiId) row.goal_api_id = goalApiId;

        if (targetId) {
          const { error } = await supabase.from('players').update(row).eq('id', targetId);
          if (error) throw error;
          updated += 1;
        } else {
          const { data: insertedRow, error } = await supabase
            .from('players')
            .insert({ name: fp.name, normalized_name: normalizedName, resolved_at: new Date().toISOString(), ...row })
            .select('id')
            .single();
          if (error) {
            // 23505 = unique_violation on normalized_name -- confirmed live
            // this can happen when two overlapping runs (e.g. a still-
            // finishing previous run and a freshly-triggered one) both hit
            // the same new player: this run's in-memory byNormalizedName
            // map was built before the other run's insert landed, so it
            // looked like a genuinely new player here too. Falls back to
            // an update against whichever row actually won the race,
            // rather than losing this player's fresher data outright.
            if (error.code === '23505') {
              const { data: existing, error: lookupErr } = await supabase
                .from('players')
                .select('id')
                .eq('normalized_name', normalizedName)
                .single();
              if (lookupErr) throw lookupErr;
              const { error: updateErr } = await supabase.from('players').update(row).eq('id', existing.id);
              if (updateErr) throw updateErr;
              updated += 1;
              if (goalApiId) byGoalApiId.set(goalApiId, existing.id);
              byNormalizedName.set(normalizedName, existing.id);
              byClubCanonical.set(canonicalKey, existing.id);
            } else {
              throw error;
            }
          } else {
            inserted += 1;
            if (goalApiId) byGoalApiId.set(goalApiId, insertedRow.id);
            byNormalizedName.set(normalizedName, insertedRow.id);
            byClubCanonical.set(canonicalKey, insertedRow.id);
          }
        }
      } catch (err) {
        console.error(`Player sync failed for ${fp.name} (${club.name}):`, err.message);
        failed += 1;
      }
    }

    // Free tier: 10 requests/minute for football-data.org's own call
    // above. GOAL API's club-scoped squad call rides goalApiClient.js's
    // own retry/backoff (no proactive pacing needed there); any gap-fill
    // searches for this club already paced themselves via
    // throttledGapFillCall() above.
    await sleep(6500);
  }

  return { checked, updated, inserted, failed, gapFilled, gapUnresolved };
}

const isMain = process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href;
if (isMain) {
  syncPlayerProfiles()
    .then((result) => {
      console.log('Player profiles sync complete:', result);
    })
    .catch((err) => {
      console.error('Player profiles sync failed:', err);
      process.exitCode = 1;
    });
}
