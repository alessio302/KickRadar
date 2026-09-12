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
function contentKey(row) {
  return `${row.type}|${row.minute}|${row.player}|${row.substituted ?? ''}`;
}

import { notifyFavoritedFixtureEvents } from './matchEventNotifier.js';

async function insertGenuinelyNew(supabase, fixtureId, leagueSlug, freshRows, existingContentKeys) {
  const toInsert = freshRows.filter((r) => !existingContentKeys.has(contentKey(r)));
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
  const existingKeys = new Set(existing.map(contentKey));
  const inserted = await insertGenuinelyNew(supabase, fixtureId, leagueSlug, freshRows, existingKeys);
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

  const existingKeys = new Set(existing.map(contentKey));
  const freshKeys = new Set(freshRows.map(contentKey));
  const toDelete = existing.filter((r) => !freshKeys.has(contentKey(r)));

  if (toDelete.length > 0) {
    const { error: deleteErr } = await supabase
      .from('match_events')
      .delete()
      .in('id', toDelete.map((r) => r.id));
    if (deleteErr) console.error(`Failed to delete retracted events for fixture ${fixtureId}:`, deleteErr.message);
  }

  const inserted = await insertGenuinelyNew(supabase, fixtureId, leagueSlug, freshRows, existingKeys);
  return { inserted, deleted: toDelete.length };
}
