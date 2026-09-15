import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient.js';
import { computeStandings } from '../lib/europaStandings.js';

const FIXTURE_COLUMNS = 'status, home_team_name, away_team_name, home_team_short_name, away_team_short_name, home_team_badge, away_team_badge, home_score, away_score';

// Full-season group-phase table for one UEFA competition, for
// EuropaFixtureDetailOverlay.jsx's Tabellenplatz section -- deliberately
// NOT scoped to EuropaTab.jsx's own PAST_WINDOW_DAYS (7 days) the way its
// EuropaStandingsPanel's fixtures come in: a league-phase table needs every
// finished match since the phase started, not just a rolling week, or a
// rank shown here would silently undercount most of the season everywhere
// but right after it starts.
export function useEuropaLeagueStandings(leagueId) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (leagueId == null) return;
    let cancelled = false;
    setLoading(true);
    supabase
      .from('fixtures')
      .select(FIXTURE_COLUMNS)
      .eq('league_id', leagueId)
      .eq('status', 'finished')
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error('Failed to load Europa standings for league', leagueId, error);
          setRows([]);
          setLoading(false);
          return;
        }
        setRows(computeStandings(data ?? []));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [leagueId]);

  return { rows, loading };
}
