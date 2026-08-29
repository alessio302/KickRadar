// Pushes new goals/cards/subs to whichever push subscriptions favorited
// the fixture they belong to. Called directly from syncLiveEvents.js right
// after it upserts a batch of live event rows, so a favorited match's
// events go out within the same WS push that wrote them -- no separate
// polling job needed, unlike the earlier version of this feature (see git
// history, "Revert favorite-fixtures / match-event push feature"): that
// one had to fetch Highlightly's /events endpoint itself per favorited
// fixture, which didn't fit alongside the existing lineups sync's share of
// a 100 req/day budget. This version costs nothing extra -- it only
// filters and pushes rows syncLiveEvents.js already fetched and stored for
// every match, favorited or not.
//
// Deliberately never called from syncLineups.js's post-finish REST
// reconciliation: that pass deletes and re-inserts a fixture's entire
// event set to correct the stored data (see its own comment on why), and
// would otherwise re-notify every event a second time right as the match
// ends, since its event_key scheme differs from the live path's.
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
