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
// keys by GOAL API's own real, stable id. Making both schemes match
// exactly turned out to work for goals (REST exposes the same time/scorer-
// id/score fields the WS's own key formula uses) but isn't guaranteed for
// cards/substitutions, and is exactly the kind of fragile cross-provider
// coupling not worth relying on. Matching on CONTENT instead --
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

function isSameEvent(a, b) {
  if (typeFamily(a.type) !== typeFamily(b.type)) return false;
  if (a.player !== b.player) return false;
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

// Authoritative REST reconciler's own call (syncLineups.js/
// syncEuropeanLineups.js, on their own ~15min cadence): insert whatever's
// newly missing AND delete whatever's no longer in GOAL API's own current
// REST response -- safe to trust as a complete snapshot, unlike the WS's
// own per-tick one, so a real retraction (a VAR-disallowed goal, a
// rescinded card) gets cleaned up here within this job's own cadence
// instead of needing the WS's own score.changed-driven detection this
// replaced.
export async function reconcileMatchEvents(supabase, fixtureId, leagueSlug, freshRows) {
  const { data: existing, error } = await supabase
    .from('match_events')
    .select('id, type, minute, player, substituted')
    .eq('fixture_id', fixtureId);
  if (error) {
    console.error(`Failed to read existing match_events for fixture ${fixtureId}:`, error.message);
    return { inserted: 0, deleted: 0 };
  }

  const toDelete = existing.filter((r) => !freshRows.some((f) => isSameEvent(f, r)));

  if (toDelete.length > 0) {
    const { error: deleteErr } = await supabase
      .from('match_events')
      .delete()
      .in('id', toDelete.map((r) => r.id));
    if (deleteErr) console.error(`Failed to delete retracted events for fixture ${fixtureId}:`, deleteErr.message);
  }

  // Upgrades an already-stored generic "Goal" row to the more specific
  // "Penalty"/"Own Goal" REST now reports for that same real event --
  // isSameEvent() above treats all three as the same goal-family event
  // (so this never duplicates), but a same-family match alone never
  // corrects the stored type, only skips re-inserting it. Without this, a
  // penalty the fast WS path first wrote as a plain "Goal" (its own
  // payload not confirmed to always carry GOAL API's penalty flag) would
  // stay mislabeled for the rest of the match even once REST's
  // authoritative snapshot knows better.
  for (const fresh of freshRows) {
    if (fresh.type === 'Goal') continue; // nothing more specific to upgrade TO
    const stale = existing.find((e) => isSameEvent(e, fresh) && e.type !== fresh.type);
    if (!stale) continue;
    const { error: upgradeErr } = await supabase.from('match_events').update({ type: fresh.type }).eq('id', stale.id);
    if (upgradeErr) console.error(`Failed to upgrade event type for fixture ${fixtureId}:`, upgradeErr.message);
  }

  const inserted = await insertGenuinelyNew(supabase, fixtureId, leagueSlug, freshRows);
  return { inserted, deleted: toDelete.length };
}
