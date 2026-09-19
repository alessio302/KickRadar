// Lets two independent match_events writers -- a fast one (syncLiveEvents.js's
// WebSocket, pushed near-instantly but occasionally silent/incomplete/
// duplicated for reasons outside this app's control) and a slow-but-
// authoritative one (a REST fetch, run periodically for domestic fixtures
// in syncLineups.js and for UEFA ones in syncEuropeanLineups.js) -- coexist
// without either duplicating or fighting the other, and without requiring
// them to agree on a key format.
//
// Confirmed live (2026-09-12): the WS keys its own rows by content (GOAL
// API's live match_update payload has no stable per-event id), while REST
// keys by GOAL API's own id for that event. Originally assumed that REST
// id was stable across separate calls -- confirmed WRONG live (2026-09-19,
// Roma vs Inter): two separate /fixtures/:id/events calls for the exact
// same already-finished match returned entirely different `id`s for every
// one of the same real goals/cards. So REST's own key is no more trustworthy
// across calls than the WS's isn't -- matching on CONTENT instead --
// type+minute+player(+substituted for a sub) -- sidesteps the whole
// problem: both writers already produce rows in that same normalized
// shape regardless of their own key, so two rows describing the same real
// event are recognized as the same thing without either needing to know
// the other's key scheme at all.
//
// Minute is matched with a small tolerance, not exact equality -- user-
// reported (2026-09-17, Juventus vs NEC): GOAL API's own WS pushed the
// exact same Woltemade goal twice, identical scorer and identical
// resulting score, but minute 34 on the first push and minute 35 on a
// later one (the provider's own clock/stoppage-time estimate updating
// between pushes for the SAME real event, not a second goal). An
// exact-minute contentKey treated the 2nd push as brand-new and
// duplicated it in the timeline -- a fuzzy match absorbs that kind of
// provider-side correction. Two GENUINELY different goals/cards/subs by
// the same player in one real match are, in practice, always several
// minutes apart, never a single minute apart the way a same-event
// correction typically is, so this tolerance doesn't risk merging two
// real events into one.
// Widened from 1 to 3 -- confirmed live (2026-09-19, Roma vs Inter): the
// WS path pushed M. Kone's goal as minute 39 (live-goal:39:...), but
// GOAL API's own later REST snapshot reported the SAME real goal as
// minute 37 -- a 2-minute drift, one more than the old tolerance
// allowed. reconcileMatchEvents() treated the REST row as NOT matching
// the already-stored (and already-pushed) WS row, deleted the WS row as
// "retracted", and re-inserted the REST row as "new" -- which
// re-triggered notifyFavoritedFixtureEvents() and sent a second push for
// a goal already pushed ~25 minutes earlier. Same class of bug as the
// 34-vs-35 case above, just a wider clock-estimate drift than 1 minute
// covers. insert_new_match_events() (sql/062, widened in migration 064)
// has its own identical ±N check and needed the same bump -- otherwise a
// row this file's own delete step lets survive would still look "new" to
// that function's separate content check and get re-inserted (and
// re-pushed) anyway.
const MINUTE_TOLERANCE = 3;

function parseMinuteValue(minute) {
  if (minute === null || minute === undefined || minute === '') return null;
  const [base, extra] = String(minute).split('+').map(Number);
  if (Number.isNaN(base)) return null;
  return base + (Number.isNaN(extra) ? 0 : extra);
}

// A goal, own goal, and penalty are all still the same real kind of event
// (one team's score going up) for matching purposes -- added once
// syncLiveEvents.js's fast WS path and eventRows.js's own REST path both
// started distinguishing "Penalty" from a plain "Goal" (see this file's
// own git history / eventRows.js's own comment): the WS often can't tell
// a penalty apart at push time (or its own payload just doesn't carry the
// field), but the slower authoritative REST snapshot always can. Without
// this, the two writers disagreeing on the exact type for the SAME real
// goal (WS says "Goal", REST later says "Penalty") would make isSameEvent
// return false and duplicate that goal in the timeline -- exactly the
// class of bug the minute-tolerance fix above exists to prevent, just
// triggered by type disagreement instead of a minute correction.
const GOAL_TYPES = new Set(['Goal', 'Own Goal', 'Penalty']);
function typeFamily(type) {
  return GOAL_TYPES.has(type) ? 'goal' : type;
}

// Normalized (case/diacritic/whitespace-insensitive), not a raw `!==` --
// confirmed live (2026-09-19, Roma vs Inter, right after this same match's
// full-time push finally landed): a routine lineups-sync run re-fetched
// this ALREADY-FINISHED fixture's events (events_synced_at gets set only
// once, at the moment a fixture is first seen 'finished' -- this was that
// moment) and reconcileMatchEvents() below deleted-then-reinserted ALL 4
// already-pushed REST-origin events (plus correctly added several
// genuinely new ones), re-triggering notifyFavoritedFixtureEvents() for
// every one of them -- 19 pushes landing in one burst is what that looks
// like from the subscriber's side. isSameEvent()'s player comparison was
// exact-string `!==`; GOAL API's own diacritic/whitespace normalization on
// player names isn't guaranteed identical between two separate REST calls
// for the same real event (confirmed this same app already had to solve
// the identical cross-call formatting-drift problem for player identity
// elsewhere -- see src/util/normalize.js, reused here rather than
// reinventing it), so a byte-level difference invisible in a raw JSON diff
// was enough to make every one of these look "retracted" and "new" at
// once. Reused GOAL API event ids being non-stable across calls (confirmed
// live: the exact same Kone/Barella/Martinez events got entirely different
// `id`s on this re-fetch than the ones stored from the 17:14 fetch) is WHY
// this matters so much here specifically -- event_key alone could never
// have caught this, content matching was always the only real defense,
// and it had a gap.
import { normalize } from '../util/normalize.js';

function normalizedPlayer(name) {
  return normalize(name ?? '');
}

function isSameEvent(a, b) {
  if (typeFamily(a.type) !== typeFamily(b.type)) return false;
  if (normalizedPlayer(a.player) !== normalizedPlayer(b.player)) return false;
  if ((a.substituted ?? '') !== (b.substituted ?? '')) return false;
  const minuteA = parseMinuteValue(a.minute);
  const minuteB = parseMinuteValue(b.minute);
  if (minuteA === null || minuteB === null) return minuteA === minuteB;
  return Math.abs(minuteA - minuteB) <= MINUTE_TOLERANCE;
}

import { notifyFavoritedFixtureEvents } from './matchEventNotifier.js';

// Confirmed live (2026-09-18, diagnoseMatchEventsDuplication.js): doing
// the "does this already exist?" check and the insert as two separate
// round-trips from application code -- even with isSameEvent() itself
// being perfectly correct -- can never be race-safe against the OTHER
// writer doing its own check-then-insert for the same fixture at nearly
// the same moment (syncLiveEvents.js's WS path and syncLineups.js's/
// syncEuropeanLineups.js's REST path are two independent processes with
// no shared lock). Confirmed live: duplicated rows' `player` values were
// byte-identical between the two writers (ruling out a string-formatting
// mismatch, the first hypothesis), and each duplicate pair's two
// created_at timestamps were only minutes apart -- exactly the shape of
// "both writers' reads happened before either one's write landed."
//
// insert_new_match_events() (sql/062) moves the whole check-and-insert
// into one Postgres function holding a pg_advisory_xact_lock scoped to
// fixture_id, so the two writers now genuinely serialize instead of
// racing. dedupeWithinBatch() is no longer needed here -- the RPC already
// checks each row in `p_rows` against both the table AND earlier rows in
// the same call, in order, inside that same lock.
async function insertGenuinelyNew(supabase, fixtureId, leagueSlug, freshRows) {
  if (freshRows.length === 0) return 0;

  const { data: inserted, error } = await supabase.rpc('insert_new_match_events', {
    p_fixture_id: fixtureId,
    p_rows: freshRows,
  });
  if (error) {
    console.error(`Failed to store new events for fixture ${fixtureId}:`, error.message);
    return 0;
  }
  if (!inserted || inserted.length === 0) return 0;

  try {
    await notifyFavoritedFixtureEvents(supabase, fixtureId, leagueSlug, inserted);
  } catch (err) {
    console.error(`Failed to notify favorited-fixture events for fixture ${fixtureId}:`, err.message);
  }
  return inserted.length;
}

// Fast-path writer's own call (syncLiveEvents.js, once per match_update):
// insert whatever in `freshRows` isn't already represented by content,
// never delete. Deliberately one-directional -- a live WS snapshot can be
// momentarily incomplete (confirmed live: an earlier version of this file
// that also deleted on a single missing observation wiped out real goals
// mid-match), so treating "missing from this one snapshot" as a retraction
// is never safe here the way it safely is for reconcileMatchEvents()'s own
// periodic, authoritative REST snapshot below.
export async function insertNewMatchEvents(supabase, fixtureId, leagueSlug, freshRows) {
  const inserted = await insertGenuinelyNew(supabase, fixtureId, leagueSlug, freshRows);
  return { inserted };
}

// Greedy 1:1 pairing between existing DB rows and this call's freshRows --
// same shape as insert_new_match_events()'s own claim loop (sql/065), kept
// as a separate, mirrored implementation here rather than shared code
// since one runs in Postgres and the other in Node. Existing rows are
// matched to the closest (smallest minute delta) still-unclaimed fresh row
// so two real, close-together events (see sql/065's own comment on why
// "any match" isn't enough) don't collide here either.
function pairExistingWithFresh(existing, freshRows) {
  const claimedFreshIdx = new Set();
  const pairs = []; // { existingRow, freshRow }
  const unmatchedExisting = [];

  for (const ex of existing) {
    let bestIdx = null;
    let bestDelta = null;
    freshRows.forEach((fresh, idx) => {
      if (claimedFreshIdx.has(idx)) return;
      if (!isSameEvent(fresh, ex)) return;
      const delta = Math.abs((parseMinuteValue(fresh.minute) ?? 0) - (parseMinuteValue(ex.minute) ?? 0));
      if (bestDelta === null || delta < bestDelta) {
        bestIdx = idx;
        bestDelta = delta;
      }
    });
    if (bestIdx === null) {
      unmatchedExisting.push(ex);
    } else {
      claimedFreshIdx.add(bestIdx);
      pairs.push({ existingRow: ex, freshRow: freshRows[bestIdx] });
    }
  }

  const unmatchedFresh = freshRows.filter((_, idx) => !claimedFreshIdx.has(idx));
  return { pairs, unmatchedExisting, unmatchedFresh };
}

// Authoritative REST reconciler's own call (syncLineups.js/
// syncEuropeanLineups.js, on their own ~15min cadence): reconciles whatever
// GOAL API's current REST response says against what's already stored --
// safe to trust as a complete snapshot, unlike the WS's own per-tick one,
// so a real retraction (a VAR-disallowed goal, a rescinded card) gets
// cleaned up here within this job's own cadence instead of needing the
// WS's own score.changed-driven detection this replaced.
//
// A row that's still represented (isSameEvent, via pairExistingWithFresh)
// gets UPDATED in place -- type/minute corrected if REST's now-current
// values differ -- rather than deleted and reinserted under a fresh id.
// This isn't just tidier: confirmed live (2026-09-19, Roma vs Inter) that
// GOAL API's own REST /events endpoint does NOT return a stable id for the
// same real event across two separate calls (this file's own top comment
// used to claim otherwise -- confirmed wrong), so the delete-then-reinsert
// this used to do assigned every still-current event a brand-new
// event_key on every single re-fetch. insertGenuinelyNew() always
// re-notifies for whatever it inserts, with no way to tell "actually new"
// apart from "same event, reinserted under a new key" -- so a routine
// re-fetch of an already-fully-pushed match (routine for a `finished`
// fixture whose events_synced_at hadn't been set yet) deleted and
// reinserted EVERY still-current event, re-pushing every single one of
// them at once. Keeping the original row/id/event_key for anything still
// matched by content means notified_match_events' claim (keyed to that
// same event_key) stays valid indefinitely, regardless of how many times
// GOAL API reassigns its own ids underneath -- so this can never happen
// again, independent of whatever made isSameEvent() itself disagree this
// time (see that function's own comment on the immediate cause).
export async function reconcileMatchEvents(supabase, fixtureId, leagueSlug, freshRows) {
  const { data: existing, error } = await supabase
    .from('match_events')
    .select('id, type, minute, player, substituted')
    .eq('fixture_id', fixtureId);
  if (error) {
    console.error(`Failed to read existing match_events for fixture ${fixtureId}:`, error.message);
    return { inserted: 0, deleted: 0, updated: 0 };
  }

  const { pairs, unmatchedExisting, unmatchedFresh } = pairExistingWithFresh(existing, freshRows);

  if (unmatchedExisting.length > 0) {
    const { error: deleteErr } = await supabase
      .from('match_events')
      .delete()
      .in('id', unmatchedExisting.map((r) => r.id));
    if (deleteErr) console.error(`Failed to delete retracted events for fixture ${fixtureId}:`, deleteErr.message);
  }

  // Corrects type (e.g. a plain "Goal" the WS wrote upgraded to REST's more
  // specific "Penalty"/"Own Goal" for the same real event) and minute (a
  // provider clock/stoppage-time estimate settling, see isSameEvent's own
  // MINUTE_TOLERANCE comment) on the SAME row -- never its id or
  // event_key, which is the whole point (see this function's own top
  // comment).
  let updated = 0;
  for (const { existingRow, freshRow } of pairs) {
    if (existingRow.type === freshRow.type && existingRow.minute === freshRow.minute) continue;
    const { error: updateErr } = await supabase
      .from('match_events')
      .update({ type: freshRow.type, minute: freshRow.minute })
      .eq('id', existingRow.id);
    if (updateErr) console.error(`Failed to update event for fixture ${fixtureId}:`, updateErr.message);
    else updated += 1;
  }

  const inserted = await insertGenuinelyNew(supabase, fixtureId, leagueSlug, unmatchedFresh);
  return { inserted, deleted: unmatchedExisting.length, updated };
}
