import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient.js';

// Cross-league: the live carousel (FixturesTab) shows whatever is live
// right now regardless of which league is currently selected, so this
// queries `fixtures` with no league_id filter -- unlike useFixtures.js's
// own per-league query. Clubs and leagues are joined client-side, same
// established pattern as useFixtures.js (see that file's own comment on
// why: resolved against a separately-fetched list rather than a Postgrest
// embed), just fetched here for every league at once instead of one.
export function useLiveFixtures() {
  const [fixtures, setFixtures] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const [{ data: liveRows, error: fixturesErr }, { data: clubs, error: clubsErr }, { data: leagues, error: leaguesErr }] =
        await Promise.all([
          // Same column list as useFixtures.js's own select -- confirmed
          // live: leaving out kickoff_at/kickoff_confirmed here (an earlier
          // version only selected the columns the carousel card itself
          // renders) meant a fixture opened from this carousel reached
          // FixtureDetailOverlay with both undefined, and its own
          // formatKickoff() then rendered "Invalid Date" instead of the
          // real kickoff time. Matching the full column list once here
          // avoids the same class of bug for whatever field some other tab
          // of that overlay reads next.
          supabase
            .from('fixtures')
            .select(
              'id, league_id, matchday, home_club_id, away_club_id, kickoff_at, kickoff_confirmed, status, home_score, away_score, referee, live_minute, highlight_video_url'
            )
            .eq('status', 'live'),
          supabase.from('clubs').select('id, name, short_name, crest_url'),
          supabase.from('leagues').select('id, slug'),
        ]);
      if (cancelled) return;
      const err = fixturesErr || clubsErr || leaguesErr;
      if (err) {
        console.error('Failed to load live fixtures', err);
        setFixtures([]);
        setLoading(false);
        return;
      }
      const clubsById = new Map(clubs.map((c) => [c.id, c]));
      const leagueSlugById = new Map(leagues.map((l) => [l.id, l.slug]));
      setFixtures(
        liveRows.map((f) => ({
          ...f,
          leagueSlug: leagueSlugById.get(f.league_id),
          homeClub: clubsById.get(f.home_club_id),
          awayClub: clubsById.get(f.away_club_id),
        }))
      );
      setLoading(false);
    };

    load();

    // A fixture entering or leaving the live set changes this carousel's
    // whole membership, not just a field on an already-known row (unlike
    // useFixtures.js's own per-league subscription, which can get away
    // with patching one row in place since a fixture never changes which
    // league's list it belongs in). Simplest correct fix is a full reload
    // on any fixtures UPDATE, same query as the initial load.
    const channel = supabase
      .channel('live-fixtures-carousel')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'fixtures' }, () => {
        if (!cancelled) load();
      })
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, []);

  return { fixtures, loading };
}
