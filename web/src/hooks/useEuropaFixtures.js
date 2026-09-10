import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient.js';

const SLUGS = ['champions-league', 'europa-league', 'conference-league'];
const PAST_WINDOW_DAYS = 7;

const FIXTURE_COLUMNS =
  'id, league_id, matchday, home_team_name, away_team_name, home_team_short_name, away_team_short_name, home_team_badge, away_team_badge, kickoff_at, kickoff_confirmed, status, home_score, away_score, live_minute, referee, venue, highlight_video_url';

async function fetchUefaLeagues() {
  const { data: leagues, error } = await supabase.from('leagues').select('id, slug').in('slug', SLUGS);
  if (error || !leagues) return [];
  return leagues;
}

// Runs the fixtures query for an already-known set of leagues -- shared by
// the initial load and refetch() below so pull-to-refresh re-runs the exact
// same query instead of a hand-duplicated copy. Takes leagues rather than
// re-querying them every time, since the realtime subscription effect
// already needs that same list for its own channel filters.
async function loadGrouped(leagues) {
  if (leagues.length === 0) return {};
  const slugById = new Map(leagues.map((l) => [l.id, l.slug]));
  const leagueIds = leagues.map((l) => l.id);
  const cutoff = new Date(Date.now() - PAST_WINDOW_DAYS * 86400000).toISOString();

  const { data: fixtures, error } = await supabase
    .from('fixtures')
    .select(FIXTURE_COLUMNS)
    .in('league_id', leagueIds)
    .gte('kickoff_at', cutoff)
    .order('kickoff_at', { ascending: true });
  if (error) throw error;

  const grouped = {};
  for (const f of fixtures ?? []) {
    const slug = slugById.get(f.league_id);
    if (!slug) continue;
    (grouped[slug] = grouped[slug] || []).push(f);
  }
  return grouped;
}

// Queries fixtures for all three UEFA competitions and returns them keyed by
// competition slug. Team names come from home_team_name / away_team_name
// (set by syncEuropeanFixtures.js) since these clubs aren't in our clubs table.
//
// Subscribes to Postgres changes on `fixtures` for each of the 3 UEFA
// league ids, same pattern useFixtures.js (domestic) already has -- before
// this, a live score/status change (from syncLiveEvents.js's WS or
// syncEuropeanLiveScores.js's REST backstop) only ever reached an
// already-open tab via a manual pull-to-refresh. Confirmed live
// 2026-09-10: an already-open EuropaFixtureDetailOverlay showed neither the
// live score nor its match_events timeline updating for exactly this
// reason -- EuropaTab.jsx's own selectedFixture is a snapshot of whatever
// this hook returned at click time, so it never saw a later change here
// either way, but a stale `data` array is the root of it: even a re-derived
// selectedFixture (see EuropaTab.jsx's own fix) has nothing fresher to read
// from without this.
export function useEuropaFixtures() {
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const leaguesRef = useRef([]);

  useEffect(() => {
    let cancelled = false;
    const channels = [];

    fetchUefaLeagues().then((leagues) => {
      if (cancelled) return;
      leaguesRef.current = leagues;
      if (leagues.length === 0) {
        setLoading(false);
        return;
      }
      const slugById = new Map(leagues.map((l) => [l.id, l.slug]));

      loadGrouped(leagues)
        .then((grouped) => { if (!cancelled) setData(grouped); })
        .catch((err) => console.error('Failed to load Europa fixtures:', err))
        .finally(() => { if (!cancelled) setLoading(false); });

      for (const league of leagues) {
        const channel = supabase
          .channel(`europa-fixtures-${league.id}`)
          .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'fixtures', filter: `league_id=eq.${league.id}` },
            (payload) => {
              if (cancelled) return;
              const slug = slugById.get(payload.new.league_id);
              if (!slug) return;
              setData((prev) => ({
                ...prev,
                [slug]: (prev[slug] ?? []).map((f) => (f.id === payload.new.id ? { ...f, ...payload.new } : f)),
              }));
            }
          )
          .subscribe();
        channels.push(channel);
      }
    });

    return () => {
      cancelled = true;
      for (const channel of channels) supabase.removeChannel(channel);
    };
  }, []);

  // Re-queries Supabase directly for pull-to-refresh -- same rationale as
  // useFixtures.js's own refetch(): this never touches football-data.org or
  // GOAL API, just re-reads whatever the last sync already stored.
  const refetch = useCallback(async () => {
    setRefreshing(true);
    try {
      const leagues = leaguesRef.current.length > 0 ? leaguesRef.current : await fetchUefaLeagues();
      leaguesRef.current = leagues;
      setData(await loadGrouped(leagues));
    } catch (err) {
      console.error('Failed to refresh Europa fixtures:', err);
    } finally {
      setRefreshing(false);
    }
  }, []);

  return { data, loading, refreshing, refetch };
}
