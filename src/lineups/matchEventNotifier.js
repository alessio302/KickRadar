import { getEvents } from './highlightlyClient.js';
import { sendPushToFixtureFavoriters } from '../push/sendPush.js';

// Only event types with a real template get pushed -- Highlightly's feed
// also carries things like VAR review or offside notes we don't have a
// notification for, and silently dropping those (rather than pushing a
// generic "something happened") is the right default until there's a
// reason to add them.
const EVENT_LABEL = {
  Goal: { icon: '⚽', title: 'Tor!' },
  'Yellow Card': { icon: '🟨', title: 'Gelbe Karte' },
  'Red Card': { icon: '🟥', title: 'Rote Karte' },
  Substitution: { icon: '🔄', title: 'Wechsel' },
};

// type+team+player+minute is as unique as a real football event gets --
// used as the atomic "already pushed this" claim via
// notified_match_events' primary key (see buildAndClaim below).
function eventKey(event) {
  return `${event.type}|${event.team?.id ?? ''}|${event.player ?? ''}|${event.time ?? ''}`;
}

function buildPayload(fixtureId, leagueSlug, event) {
  const label = EVENT_LABEL[event.type];
  if (!label) return null;
  const teamName = event.team?.name ?? '';
  const minute = event.time ? ` (${event.time}')` : '';
  const body =
    event.type === 'Substitution'
      ? `${teamName}: ${event.substituted ?? '?'} → ${event.player}`
      : `${teamName}: ${event.player}${minute}`;
  return { title: `${label.icon} ${label.title}`, body, url: `/?league=${leagueSlug}&fixture=${fixtureId}` };
}

// Push notification text is German-only, matching every other category in
// this app (transfers, lineups) -- none of them are wired into the
// frontend's i18n system, that's a known, accepted scope limit, not
// something this feature needs to be the first to solve.
export async function notifyFavoritedFixtureEvents(supabase) {
  const { data: favorited, error: favErr } = await supabase.from('favorite_fixtures').select('fixture_id').limit(1000);
  if (favErr) throw favErr;
  const fixtureIds = [...new Set(favorited.map((r) => r.fixture_id))];
  if (fixtureIds.length === 0) return { checked: 0, pushed: 0 };

  // Only currently-live fixtures -- no point spending a Highlightly
  // request on a favorited fixture that hasn't kicked off yet (nothing to
  // fetch) or has already finished (its final events were already caught
  // on the last poll while it was still live).
  const { data: fixtures, error: fixErr } = await supabase
    .from('fixtures')
    .select('id, league_id, highlightly_match_id')
    .in('id', fixtureIds)
    .eq('status', 'live');
  if (fixErr) throw fixErr;
  if (fixtures.length === 0) return { checked: 0, pushed: 0 };

  const { data: leagues, error: leagueErr } = await supabase.from('leagues').select('id, slug');
  if (leagueErr) throw leagueErr;
  const leagueSlugById = new Map(leagues.map((l) => [l.id, l.slug]));

  let pushed = 0;
  for (const fixture of fixtures) {
    // Not resolved yet -- syncLineups.js sets this on a pre-kickoff run;
    // self-heals on its next 15-min pass rather than re-deriving it here.
    if (!fixture.highlightly_match_id) continue;

    let events;
    try {
      events = await getEvents(fixture.highlightly_match_id);
    } catch (err) {
      console.error(`Highlightly /events failed for match ${fixture.highlightly_match_id}:`, err.message);
      continue;
    }
    if (!Array.isArray(events)) continue;

    for (const event of events) {
      // Insert-first-as-claim: the (fixture_id, event_key) primary key
      // means only the poll that actually wins the race gets to push --
      // every later poll re-fetching the same already-seen event hits a
      // unique_violation here and moves on, no separate "have I seen this"
      // read needed first.
      const { error: insertErr } = await supabase
        .from('notified_match_events')
        .insert({ fixture_id: fixture.id, event_key: eventKey(event) });
      if (insertErr) {
        if (insertErr.code !== '23505') console.error(`Failed to record notified event for fixture ${fixture.id}:`, insertErr.message);
        continue;
      }

      const payload = buildPayload(fixture.id, leagueSlugById.get(fixture.league_id), event);
      if (!payload) continue;
      try {
        await sendPushToFixtureFavoriters(fixture.id, payload);
        pushed += 1;
      } catch (err) {
        console.error(`Failed to push match event for fixture ${fixture.id}:`, err.message);
      }
    }
  }

  return { checked: fixtures.length, pushed };
}
