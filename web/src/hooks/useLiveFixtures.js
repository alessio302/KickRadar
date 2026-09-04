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
          supabase
            .from('fixtures')
            .select('id, league_id, home_club_id, away_club_id, status, home_score, away_score, live_minute')
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
