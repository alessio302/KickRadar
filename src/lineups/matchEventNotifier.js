// Pushes new goals/cards/subs to whichever push subscriptions favorited
// the fixture they belong to. Costs nothing extra to call -- it only
// filters and pushes rows the caller already fetched and stored for every
// match, favorited or not (unlike the earlier version of this feature, see
// git history "Revert favorite-fixtures / match-event push feature", which
// fetched Highlightly's /events endpoint itself per favorited fixture).
//
// Three callers as of 2026-09-12, all going through matchEventsReconciler.js
// (syncLineups.js/syncEuropeanLineups.js's own REST-based reconcileMatchEvents(),
// on their own ~15min cadence, live fixtures included -- see that module's
// own comment) except syncLiveEvents.js, which calls
// insertNewMatchEvents() directly right after upserting a batch of fast-
// path WebSocket rows. notified_match_events' own (fixture_id, event_key)
// insert-as-claim is what keeps any of the three from double-notifying the
// same real event -- and since matchEventsReconciler.js's own content-based
// matching (not event_key) is what stops the WS and REST paths from ever
// storing two rows for the same real event in the first place, there's
// only ever one row (and one event_key) to claim per event regardless of
// which of the three call sites got there first.
import { sendPushToFixtureFavoriters } from '../push/sendPush.js';
import { pushStringsFor, SUPPORTED_PUSH_LANGUAGES } from '../push/pushI18n.js';

const EVENT_LABEL_KEY = {
  Goal: 'goal',
  'Own Goal': 'goal',
  Penalty: 'goal',
  'Yellow Card': 'yellowCard',
  'Red Card': 'redCard',
  Substitution: 'substitution',
};

function buildPayloads(fixtureId, leagueSlug, row) {
  const labelKey = EVENT_LABEL_KEY[row.type];
  if (!labelKey) return null;
  const byLanguage = {};
  for (const lang of SUPPORTED_PUSH_LANGUAGES) {
    const label = pushStringsFor(lang).matchEvent[labelKey];
    const minute = row.minute ? ` (${row.minute}')` : '';
    const body = row.type === 'Substitution' ? `${row.substituted ?? '?'} → ${row.player}` : `${row.player}${minute}`;
    byLanguage[lang] = { title: `${label.icon} ${label.title}`, body, url: `/?league=${leagueSlug}&fixture=${fixtureId}` };
  }
  return byLanguage;
}

// rows: the same match_events row shape buildLiveEventRows produces
// (fixture_id, club_id, type, minute, player, assist, substituted,
// event_key) -- whatever was just upserted for this match_update.
export async function notifyFavoritedFixtureEvents(supabase, fixtureId, leagueSlug, rows) {
  const { count, error: favErr } = await supabase
    .from('favorite_fixtures')
    .select('id', { count: 'exact', head: true })
    .eq('fixture_id', fixtureId);
  if (favErr) throw favErr;
  if (!count) return { pushed: 0 }; // no work at all for a fixture nobody favorited

  let pushed = 0;
  for (const row of rows) {
    // Insert-first-as-claim: the (fixture_id, event_key) primary key means
    // only the first call to see a given event actually pushes it -- every
    // later match_update rebuilding the same still-current event from the
    // same full-state snapshot (see buildLiveEventRows) hits a unique
    // violation here and moves on, no separate "have I seen this" read
    // needed first.
    const { error: claimErr } = await supabase
      .from('notified_match_events')
      .insert({ fixture_id: fixtureId, event_key: row.event_key });
    if (claimErr) {
      if (claimErr.code !== '23505') console.error(`Failed to claim notified event for fixture ${fixtureId}:`, claimErr.message);
      continue;
    }

    const payloads = buildPayloads(fixtureId, leagueSlug, row);
    if (!payloads) continue;
    try {
      await sendPushToFixtureFavoriters(fixtureId, payloads);
      pushed += 1;
    } catch (err) {
      console.error(`Failed to push match event for fixture ${fixtureId}:`, err.message);
    }
  }
  return { pushed };
}
