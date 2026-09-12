// Pushes new goals/cards/subs to whichever push subscriptions favorited
// the fixture they belong to. Costs nothing extra to call -- it only
// filters and pushes rows the caller already fetched and stored for every
// match, favorited or not (unlike the earlier version of this feature, see
// git history "Revert favorite-fixtures / match-event push feature", which
// fetched Highlightly's /events endpoint itself per favorited fixture).
//
// Two callers as of 2026-09-12, split by league type:
// - syncLineups.js, right after it upserts a domestic fixture's own REST-
//   fetched events (both for a still-'live' fixture, refreshed on every
//   run, and once more when it finishes) -- domestic match_events has
//   exactly one writer now, so this is the only place that needs to call
//   it for those leagues.
// - syncLiveEvents.js, right after it upserts a batch of live event rows
//   for a EUROPEAN fixture -- still that WS connection's sole source (see
//   its own top comment), so still notified from there.
// notified_match_events' own (fixture_id, event_key) insert-as-claim is
// what keeps either caller from double-notifying the same real event
// across repeated calls, not any coordination between the two files --
// each event's own event_key only ever comes from ONE of them for a given
// fixture (whichever league it belongs to), so there's no cross-file key
// collision to worry about either.
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
