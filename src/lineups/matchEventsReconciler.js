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
const MINUTE_TOLERANCE = 1;

function parseMinuteValue(minute) {
  if (minute === null || minute === undefined || minute === '') return null;
  const [base, extra] = String(minute).split('+').map(Number);
  if (Number.isNaN(base)) return null;
  return base + (Number.isNaN(extra) ? 0 : extra);
}

function isSameEvent(a, b) {
  if (a.type !== b.type) return false;
  if (a.player !== b.player) return false;
  if ((a.substituted ?? '') !== (b.substituted ?? '')) return false;
  const minuteA = parseMinuteValue(a.minute);
  const minuteB = parseMinuteValue(b.minute);
  if (minuteA === null || minuteB === null) return minuteA === minuteB;
  return Math.abs(minuteA - minuteB) <= MINUTE_TOLERANCE;
}

import { notifyFavoritedFixtureEvents } from './matchEventNotifier.js';

function dedupeWithinBatch(rows) {
  const deduped = [];
  for (const row of rows) {
    if (!deduped.some((r) => isSameEvent(r, row))) deduped.push(row);
  }
  return deduped;
}

async function insertGenuinelyNew(supabase, fixtureId, leagueSlug, freshRows, existingRows) {
  const toInsert = dedupeWithinBatch(freshRows).filter((r) => !existingRows.some((e) => isSameEvent(e, r)));
  if (toInsert.length === 0) return 0;

  const { error } = await supabase.from('match_events').upsert(toInsert, { onConflict: 'fixture_id,event_key' });
  if (error) {
    console.error(`Failed to store new events for fixture ${fixtureId}:`, error.message);
    return 0;
  }
  try {
    await notifyFavoritedFixtureEvents(supabase, fixtureId, leagueSlug, toInsert);
  } catch (err) {
    console.error(`Failed to notify favorited-fixture events for fixture ${fixtureId}:`, err.message);
  }
  return toInsert.length;
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
  if (freshRows.length === 0) return { inserted: 0 };
  const { data: existing, error } = await supabase
    .from('match_events')
    .select('type, minute, player, substituted')
    .eq('fixture_id', fixtureId);
  if (error) {
    console.error(`Failed to read existing match_events for fixture ${fixtureId}:`, error.message);
    return { inserted: 0 };
  }
  const inserted = await insertGenuinelyNew(supabase, fixtureId, leagueSlug, freshRows, existing);
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

  const inserted = await insertGenuinelyNew(supabase, fixtureId, leagueSlug, freshRows, existing);
  return { inserted, deleted: toDelete.length };
}
