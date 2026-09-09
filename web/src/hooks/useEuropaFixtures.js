import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient.js';

const SLUGS = ['champions-league', 'europa-league', 'conference-league'];
const PAST_WINDOW_DAYS = 7;

// Runs the leagues + fixtures query pair and returns the fixtures grouped
// by competition slug, or null on error -- shared by the initial load and
// refetch() below so pull-to-refresh re-runs the exact same query instead
// of a hand-duplicated copy.
async function loadGrouped() {
  const { data: leagues, error: leagueErr } = await supabase
    .from('leagues')
    .select('id, slug')
    .in('slug', SLUGS);
  if (leagueErr || !leagues || leagues.length === 0) return {};

  const slugById = new Map(leagues.map((l) => [l.id, l.slug]));
  const leagueIds = leagues.map((l) => l.id);
  const cutoff = new Date(Date.now() - PAST_WINDOW_DAYS * 86400000).toISOString();

  const { data: fixtures, error: fixErr } = await supabase
    .from('fixtures')
    .select('id, league_id, matchday, home_team_name, away_team_name, home_team_badge, away_team_badge, kickoff_at, kickoff_confirmed, status, home_score, away_score, live_minute, referee, venue')
    .in('league_id', leagueIds)
    .gte('kickoff_at', cutoff)
    .order('kickoff_at', { ascending: true });
  if (fixErr) throw fixErr;

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
export function useEuropaFixtures() {
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadGrouped()
      .then((grouped) => { if (!cancelled) setData(grouped); })
      .catch((err) => console.error('Failed to load Europa fixtures:', err))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // Re-queries Supabase directly for pull-to-refresh -- same rationale as
  // useFixtures.js's own refetch(): this never touches football-data.org or
  // GOAL API, just re-reads whatever the last sync already stored.
  const refetch = useCallback(async () => {
    setRefreshing(true);
    try {
      setData(await loadGrouped());
    } catch (err) {
      console.error('Failed to refresh Europa fixtures:', err);
    } finally {
      setRefreshing(false);
    }
  }, []);

  return { data, loading, refreshing, refetch };
}
