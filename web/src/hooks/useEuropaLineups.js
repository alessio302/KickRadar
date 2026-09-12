import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient.js';

const SELECT = 'fixture_id, team_name, confirmed, formation, players, published_at';
// Same rationale as useLineups.js's own POLL_MS/Realtime addition -- an
// already-open EuropaFixtureDetailOverlay had the identical gap (fetch
// once on mount, nothing afterwards).
const POLL_MS = 30000;

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

    const load = () =>
      supabase
        .from('lineups')
        .select(SELECT)
        .eq('fixture_id', fixtureId)
        .then(({ data, error }) => {
          if (cancelled) return;
          if (error) {
            console.error('Failed to load Europa lineups for fixture', fixtureId, error);
            setByTeamName(new Map());
            return;
          }
          setByTeamName(new Map(data.map((row) => [row.team_name, row])));
        });

    setLoading(true);
    load().finally(() => {
      if (!cancelled) setLoading(false);
    });

    const channel = supabase
      .channel(`europa-lineups-${fixtureId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'lineups', filter: `fixture_id=eq.${fixtureId}` },
        (payload) => {
          if (cancelled) return;
          setByTeamName((prev) => new Map(prev).set(payload.new.team_name, payload.new));
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'lineups', filter: `fixture_id=eq.${fixtureId}` },
        (payload) => {
          if (cancelled) return;
          setByTeamName((prev) => new Map(prev).set(payload.new.team_name, payload.new));
        }
      )
      .subscribe();

    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, POLL_MS);

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [fixtureId]);

  return { byTeamName, loading };
}
