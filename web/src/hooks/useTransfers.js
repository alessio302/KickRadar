import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient.js';
import { useLeagueId } from './useLeagueId.js';

const PAGE_SIZE = 50;

// Same module-level warm-start cache as useClubs.js/useStandings.js, keyed
// by leagueId+officialOnly since that flag changes the query itself. See
// useClubs.js's own comment for why this matters for the league swipe
// carousel (useLeagueCarousel.js) -- without it, every league switch
// re-fetched from scratch and showed a "Lädt..." flash even for a league
// whose data had just finished loading moments earlier as the drag preview.
const cache = new Map();

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
// Also requires both from_club and to_club: a card with only one --
// confirmed live via a screenshot (Ligue 1, footmercato's official-signing
// headlines that only name the new club, e.g. "Mathieu Patouillet, Stade
// Brestois 29") -- renders as a bare club name with no arrow, and there's
// no reliable way to tell a reader whether that's the destination or the
// club he's leaving. An explicitly-requiring-only-to_club version of this
// filter was tried (see git history) on the theory that the destination is
// the newsworthy half and the origin is background info we can look up
// ourselves -- reverted because the *display* never actually communicated
// that distinction, so a single-club card was ambiguous either way, not
// just less complete. Keeping only complete rows removes the ambiguity
// instead of just softening how the incomplete ones are displayed.
export function useTransfers(leagueSlug, { officialOnly } = {}) {
  const leagueId = useLeagueId(leagueSlug);
  const cacheKey = leagueId != null ? `${leagueId}:${officialOnly ? 1 : 0}` : null;
  const [transfers, setTransfers] = useState(() => (cacheKey ? cache.get(cacheKey) ?? [] : []));
  const [loading, setLoading] = useState(() => !cacheKey || !cache.has(cacheKey));
  const [refreshing, setRefreshing] = useState(false);

  const buildQuery = useCallback(() => {
    let query = supabase
      .from('transfers')
      .select(
        'id, player_name, from_club, to_club, from_club_id, to_club_id, is_official, source, source_url, summary, ai_summary_de, ai_summary_en, ai_summary_it, ai_summary_fr, ai_summary_es, published_at, players(transfermarkt_url, photo_url, birthdate, position, current_club_name, current_club_badge, nationality_name, nationality_badge, squad_number, injured, stats, stats_refreshed_at, resolved_at)'
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
    if (leagueId == null || cacheKey == null) return;
    let cancelled = false;
    const cached = cache.get(cacheKey);
    if (cached) {
      setTransfers(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }

    buildQuery().then(({ data, error }) => {
      if (cancelled) return;
      if (error) {
        console.error('Failed to load transfers for league', leagueSlug, error);
        if (!cached) setTransfers([]);
      } else {
        cache.set(cacheKey, data);
        setTransfers(data);
      }
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [leagueId, cacheKey, leagueSlug, buildQuery]);

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
      if (cacheKey != null) cache.set(cacheKey, data);
      setTransfers(data);
    }
    setRefreshing(false);
  }, [leagueId, cacheKey, leagueSlug, buildQuery]);

  return { transfers, loading, refreshing, refetch };
}
