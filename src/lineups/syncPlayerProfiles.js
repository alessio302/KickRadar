import { getSupabaseClient } from '../db/supabaseClient.js';
import { getTeamSquad } from './goalApiClient.js';
import { normalize } from '../util/normalize.js';
import { POSITION_SINGULAR, STAT_FIELDS, extractStats, resolveGoalApiProfile } from '../news/playerProfileResolver.js';

const FOOTBALL_DATA_BASE_URL = process.env.FOOTBALL_DATA_BASE_URL || 'https://api.football-data.org/v4';

// Confirmed live (this session's investigation): GOAL API's own club-scoped
// squad endpoint (/teams/{id}/players, used below via getTeamSquad) can be
// badly incomplete for specific players -- Arsenal returned only 11 of 25
// real squad members, missing Saka/Ødegaard/Rice/Saliba/... entirely.
// Root cause: those players' current-club association is unset in GOAL
// API's own database right now (their `team` field falls back to their
// national team instead -- likely a September international-break side
// effect), and the club-scoped endpoint can only return players it has
// linked to that club id. GOAL API's NAME-based global search
// (playerProfileResolver.js's resolveGoalApiProfile(), not club-scoped)
// still finds these players fine, with a real photo and full stats.
//
// football-data.org's own /teams/{id} squad list has no such gap --
// confirmed live, Arsenal's list there was a correct, complete 25/25 --
// but carries no photo and no season stats at all, so it can't replace
// GOAL API outright (see this session's own comparison). Used here as the
// authoritative "who is really on this squad" source instead: for every
// name it lists, first try an in-memory match against the (possibly
// incomplete) GOAL API squad response already fetched for this club --
// free, no extra call. Only the names that GOAL API's squad listing
// dropped fall through to a live resolveGoalApiProfile() search, so the
// common case (GOAL API's listing already has the player) costs nothing
// extra over the old squad-only approach.
async function getFootballDataSquad(externalTeamId) {
  const apiKey = process.env.FOOTBALL_DATA_API_KEY;
  if (!apiKey) throw new Error('Missing FOOTBALL_DATA_API_KEY env var.');
  const res = await fetch(`${FOOTBALL_DATA_BASE_URL}/teams/${externalTeamId}`, { headers: { 'X-Auth-Token': apiKey } });
  if (!res.ok) throw new Error(`GET /teams/${externalTeamId} failed: ${res.status} ${res.statusText}`);
  const data = await res.json();
  return data.squad || [];
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// A gap-fill resolution costs 2 throttled GOAL API calls (search + fetch,
// ~6.5s apart each -- see playerProfileResolver.js's throttleGoalApi),
// vastly more expensive per player than the free in-memory match. Capped
// so one run with an unusually large gap (a provider-side hiccup wider
// than the Arsenal/Inter/Roma case this was built for) can't blow past
// GOAL API's shared 1000/day budget or run indefinitely -- gapFilled vs
// gapUnresolved in the return value shows whether the cap was ever hit.
const MAX_GAP_FILLS_PER_RUN = 200;

function lastToken(name) {
  const parts = normalize(name).trim().split(/\s+/);
  return parts[parts.length - 1];
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
  const { data: existingRows, error: existingErr } = await supabase.from('players').select('id, goal_api_id, normalized_name');
  if (existingErr) throw existingErr;
  const byGoalApiId = new Map(existingRows.filter((r) => r.goal_api_id).map((r) => [r.goal_api_id, r.id]));
  const byNormalizedName = new Map(existingRows.map((r) => [r.normalized_name, r.id]));

  let checked = 0;
  let updated = 0;
  let inserted = 0;
  let failed = 0;
  let gapFilled = 0;
  let gapUnresolved = 0;
  let gapFillBudgetLeft = MAX_GAP_FILLS_PER_RUN;

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
    // First entry wins on a surname collision within one club (rare) --
    // acceptable, that player just falls through to the gap-fill search
    // below instead, same outcome as if GOAL API's own listing had missed
    // them outright.
    const goalByLastToken = new Map();
    for (const gp of goalSquad) {
      const key = lastToken(gp.name);
      if (!goalByLastToken.has(key)) goalByLastToken.set(key, gp);
    }

    for (const fp of fdSquad) {
      checked += 1;
      try {
        const goalEntry = goalByLastToken.get(lastToken(fp.name)) ?? null;
        let resolvedFields = null;

        if (!goalEntry) {
          if (gapFillBudgetLeft > 0) {
            gapFillBudgetLeft -= 1;
            resolvedFields = await resolveGoalApiProfile(fp.name, [club.name]);
          }
          if (resolvedFields) gapFilled += 1;
          else gapUnresolved += 1;
        }

        // football-data.org's own dateOfBirth/position (the authoritative
        // "who's really on this squad" source) win over whichever GOAL
        // API path filled in the rest, current_club_name/badge always
        // come from `club` itself -- a resolveGoalApiProfile() hit here
        // can carry a stale/wrong club (its own team fallback, e.g. "England"
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
        const targetId = (goalApiId && byGoalApiId.get(goalApiId)) ?? byNormalizedName.get(normalizedName) ?? null;
        const row = { goal_api_id: goalApiId, stats_refreshed_at: new Date().toISOString(), ...fields };

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
          if (error) throw error;
          inserted += 1;
          if (goalApiId) byGoalApiId.set(goalApiId, insertedRow.id);
          byNormalizedName.set(normalizedName, insertedRow.id);
        }
      } catch (err) {
        console.error(`Player sync failed for ${fp.name} (${club.name}):`, err.message);
        failed += 1;
      }
    }

    // Free tier: 10 requests/minute for football-data.org's own call
    // above. GOAL API's calls (club-scoped squad + any gap-fill searches)
    // ride their own shared throttle/retry logic in goalApiClient.js /
    // playerProfileResolver.js, no extra pacing needed for those here.
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
