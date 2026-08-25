import { useCallback, useEffect, useState } from 'react';
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
//
// Also requires both from_club and to_club: a single-sided entry is
// usually an earlier, less complete article about the same saga as a
// later one that names both clubs (confirmed live: the "Alvarez"
// single-club card was redundant with a fuller "Julian Alvarez,
// Atletico Madrid -> Arsenal" card already in the feed) -- keeping only
// complete rows removes that duplication instead of just softening how
// the incomplete ones are displayed.
export function useTransfers(leagueSlug, { officialOnly } = {}) {
  const leagueId = useLeagueId(leagueSlug);
  const [transfers, setTransfers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const buildQuery = useCallback(() => {
    let query = supabase
      .from('transfers')
      .select(
        'id, player_name, from_club, to_club, from_club_id, to_club_id, is_official, source, source_url, summary, published_at, players(transfermarkt_url)'
      )
      .eq('league_id', leagueId)
      .not('player_name', 'is', null)
      .not('from_club', 'is', null)
      .not('to_club', 'is', null)
      .order('published_at', { ascending: false })
      .limit(PAGE_SIZE);

    if (officialOnly) {
      query = query.eq('is_official', true);
    }
    return query;
  }, [leagueId, officialOnly]);

  useEffect(() => {
    if (leagueId == null) return;
    let cancelled = false;
    setLoading(true);

    buildQuery().then(({ data, error }) => {
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
  }, [leagueId, leagueSlug, buildQuery]);

  // Re-queries Supabase directly for pull-to-refresh -- this never touches
  // the actual news sources, the LLM extraction, or any other rate-limited
  // free-tier API. Those only run on the hourly GitHub Actions scrape,
  // independent of how often (or how many people) pull-to-refresh; a
  // refetch just re-reads whatever that last scrape already stored.
  const refetch = useCallback(async () => {
    if (leagueId == null) return;
    setRefreshing(true);
    const { data, error } = await buildQuery();
    if (error) {
      console.error('Failed to refresh transfers for league', leagueSlug, error);
    } else {
      setTransfers(data);
    }
    setRefreshing(false);
  }, [leagueId, leagueSlug, buildQuery]);

  return { transfers, loading, refreshing, refetch };
}
