import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient.js';

const SLUGS = ['champions-league', 'europa-league', 'conference-league'];
const PAST_WINDOW_DAYS = 7;

// Queries fixtures for all three UEFA competitions and returns them keyed by
// competition slug. Team names come from home_team_name / away_team_name
// (set by syncEuropeanFixtures.js) since these clubs aren't in our clubs table.
export function useEuropaFixtures() {
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const { data: leagues, error: leagueErr } = await supabase
        .from('leagues')
        .select('id, slug')
        .in('slug', SLUGS);
      if (leagueErr || !leagues || leagues.length === 0) {
        if (!cancelled) { setData({}); setLoading(false); }
        return;
      }

      const slugById = new Map(leagues.map((l) => [l.id, l.slug]));
      const leagueIds = leagues.map((l) => l.id);
      const cutoff = new Date(Date.now() - PAST_WINDOW_DAYS * 86400000).toISOString();

      const { data: fixtures, error: fixErr } = await supabase
        .from('fixtures')
        .select('id, league_id, matchday, home_team_name, away_team_name, kickoff_at, kickoff_confirmed, status, home_score, away_score, live_minute')
        .in('league_id', leagueIds)
        .gte('kickoff_at', cutoff)
        .order('kickoff_at', { ascending: true });

      if (fixErr || cancelled) { if (!cancelled) setLoading(false); return; }

      const grouped = {};
      for (const f of fixtures ?? []) {
        const slug = slugById.get(f.league_id);
        if (!slug) continue;
        (grouped[slug] = grouped[slug] || []).push(f);
      }

      if (!cancelled) { setData(grouped); setLoading(false); }
    }

    load().catch((err) => {
      console.error('Failed to load Europa fixtures:', err);
      if (!cancelled) setLoading(false);
    });

    return () => { cancelled = true; };
  }, []);

  return { data, loading };
}
