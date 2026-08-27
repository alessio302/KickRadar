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
// to_club (the interested/destination club) is still required -- a card
// that doesn't say which other club wants the player has no content: the
// player's current club is background, not news. from_club is NOT
// required anymore: confirmed live (Ligue 1, 2026-08-27) that requiring
// both sides can hide essentially an entire league's worth of genuinely
// fresh news when its current cycle is dominated by "player X linked with
// club Y" stories that don't (yet) restate where X currently plays --
// the feed then looks stale even though the database has items from the
// last hour. The backend (runNewsScraper.js's lookupSquadMembership) already
// tries to backfill from_club from synced squad data whenever an article
// only named the destination, so most of these still arrive complete;
// this only affects the remainder it couldn't resolve (a player not in any
// synced squad, or an ambiguous name).
//
// dedupeSupersededSingleSided() below keeps the original filter's actual
// goal (don't show a bare "linked with Y" card once a fuller card naming
// both clubs covers the same player+destination) without hiding
// single-sided news that has no fuller counterpart yet. Keyed by player+
// destination, not just player, so a player genuinely linked with two
// different clubs still gets two cards.
function normalizePlayerName(name) {
  return (name ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

function storyKey(t) {
  const dest = t.to_club_id != null ? `id:${t.to_club_id}` : `text:${normalizePlayerName(t.to_club)}`;
  return `${normalizePlayerName(t.player_name)}|${dest}`;
}

function dedupeSupersededSingleSided(rows) {
  const hasCompleteForStory = new Set();
  for (const t of rows) {
    if (t.from_club) hasCompleteForStory.add(storyKey(t));
  }
  const seenIncompleteStory = new Set();
  return rows.filter((t) => {
    if (t.from_club) return true;
    const key = storyKey(t);
    // A fuller card already tells this exact player+destination story.
    if (hasCompleteForStory.has(key)) return false;
    // No fuller card exists yet: keep only the most recent single-sided
    // card per player+destination (rows already arrive published_at
    // desc), so a story that gets re-reported a few times doesn't produce
    // several near-duplicate incomplete cards.
    if (seenIncompleteStory.has(key)) return false;
    seenIncompleteStory.add(key);
    return true;
  });
}

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
        setTransfers(dedupeSupersededSingleSided(data));
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
      setTransfers(dedupeSupersededSingleSided(data));
    }
    setRefreshing(false);
  }, [leagueId, leagueSlug, buildQuery]);

  return { transfers, loading, refreshing, refetch };
}
