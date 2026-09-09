import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient.js';

// Same shape as useLineups.js, keyed by team_name instead of club_id --
// European fixtures have no clubs table row (see syncEuropeanFixtures.js's
// own comment), so src/lineups/syncEuropeanLineups.js writes these rows
// keyed by team name instead (sql/051_lineups_team_name.sql).
export function useEuropaLineups(fixtureId) {
  const [byTeamName, setByTeamName] = useState(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (fixtureId == null) return;
    let cancelled = false;
    setLoading(true);

    supabase
      .from('lineups')
      .select('team_name, confirmed, formation, players, published_at')
      .eq('fixture_id', fixtureId)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error('Failed to load Europa lineups for fixture', fixtureId, error);
          setByTeamName(new Map());
          setLoading(false);
          return;
        }
        setByTeamName(new Map(data.map((row) => [row.team_name, row])));
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [fixtureId]);

  return { byTeamName, loading };
}
