import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient.js';
import { useLeagueId } from './useLeagueId.js';

const PAGE_SIZE = 50;

// Returns plain rows (from_club_id/to_club_id as ints) rather than using
// Supabase's embedded-relationship select -- transfers has two separate FKs
// into clubs (from_club_id, to_club_id), which needs the exact auto-generated
// constraint name to disambiguate in an embedded select. Resolving the club
// objects client-side against an already-fetched clubs list (see useClubs)
// avoids depending on that.
//
// Only rows with a resolved player_name are shown: confirmed live, without
// this filter the feed fills up with roundup/commentary articles the
// backend correctly left player_name null for (no single identifiable
// transfer) -- e.g. daily mercato roundups, transfer-ticker hub pages,
// team-analysis pieces mentioning several players. Those aren't "a
// transfer", so they don't belong in a transfer feed even though the
// relevance filter (deliberately broad, backend-side) let them through.
export function useTransfers(leagueSlug, { officialOnly } = {}) {
  const leagueId = useLeagueId(leagueSlug);
  const [transfers, setTransfers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (leagueId == null) return;
    let cancelled = false;
    setLoading(true);

    let query = supabase
      .from('transfers')
      .select(
        'id, player_name, from_club, to_club, from_club_id, to_club_id, is_official, source, source_url, summary, published_at, players(transfermarkt_url)'
      )
      .eq('league_id', leagueId)
      .not('player_name', 'is', null)
      .order('published_at', { ascending: false })
      .limit(PAGE_SIZE);

    if (officialOnly) {
      query = query.eq('is_official', true);
    }

    query.then(({ data, error }) => {
      if (cancelled) return;
      if (error) {
        console.error('Failed to load transfers for league', leagueSlug, error);
        setTransfers([]);
      } else {
        setTransfers(data);
      }
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [leagueId, leagueSlug, officialOnly]);

  return { transfers, loading };
}
