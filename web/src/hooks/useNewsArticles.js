import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient.js';
import { useLeagueId } from './useLeagueId.js';

const PAGE_SIZE = 50;

// Same warm-start cache pattern as useTransfers.js/useClubs.js, keyed by
// leagueId only -- unlike Transfers' officialOnly toggle, News has no
// per-query filter today.
const cache = new Map();

export function useNewsArticles(leagueSlug) {
  const leagueId = useLeagueId(leagueSlug);
  const cacheKey = leagueId != null ? String(leagueId) : null;
  const [articles, setArticles] = useState(() => (cacheKey ? cache.get(cacheKey) ?? [] : []));
  const [loading, setLoading] = useState(() => !cacheKey || !cache.has(cacheKey));
  const [refreshing, setRefreshing] = useState(false);

  const buildQuery = useCallback(() => {
    return supabase
      .from('news_articles')
      .select('id, source, title, teaser, image_url, source_url, published_at, ai_summary_de, ai_summary_en, ai_summary_it, ai_summary_fr, ai_summary_es')
      .eq('league_id', leagueId)
      .order('published_at', { ascending: false })
      .limit(PAGE_SIZE);
  }, [leagueId]);

  useEffect(() => {
    if (leagueId == null || cacheKey == null) return;
    let cancelled = false;
    const cached = cache.get(cacheKey);
    if (cached) {
      setArticles(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }

    buildQuery().then(({ data, error }) => {
      if (cancelled) return;
      if (error) {
        console.error('Failed to load news articles for league', leagueSlug, error);
        if (!cached) setArticles([]);
      } else {
        cache.set(cacheKey, data);
        setArticles(data);
      }
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [leagueId, cacheKey, leagueSlug, buildQuery]);

  // Same "just re-reads the last scrape" note as useTransfers.js's own
  // refetch -- pull-to-refresh never touches the RSS sources or the Gemini
  // API directly, only whatever runGeneralNewsScraper.js's last run (every
  // 15 min, see news-articles-scraper.yml) already stored.
  const refetch = useCallback(async () => {
    if (leagueId == null) return;
    setRefreshing(true);
    const { data, error } = await buildQuery();
    if (error) {
      console.error('Failed to refresh news articles for league', leagueSlug, error);
    } else {
      if (cacheKey != null) cache.set(cacheKey, data);
      setArticles(data);
    }
    setRefreshing(false);
  }, [leagueId, cacheKey, leagueSlug, buildQuery]);

  return { articles, loading, refreshing, refetch };
}
