import { useCallback, useMemo } from 'react';
import { useLiveFixtures } from './useLiveFixtures.js';
import { useEuropaFixtures } from './useEuropaFixtures.js';
import { LEAGUES, UEFA_COMPETITIONS } from '../lib/leagues.js';

// Fixed display order -- the 5 domestic leagues in the same order
// LeagueSwitcher.jsx shows them, then the 3 UEFA competitions in the same
// order CompetitionSelector (EuropaTab.jsx) shows them. Whatever's
// currently live is filtered down to from this, not the other way round,
// so the order a group appears in never depends on which leagues happen to
// have a match live right now.
const GROUP_ORDER = [...LEAGUES.map((l) => l.slug), ...UEFA_COMPETITIONS.map((c) => c.slug)];
const GROUP_META = new Map([...LEAGUES, ...UEFA_COMPETITIONS].map((l) => [l.slug, l]));

// LiveTab.jsx's own data source -- everything currently live, across every
// domestic league AND every UEFA competition, grouped by competition in
// GROUP_ORDER. Deliberately composed from the two hooks that already exist
// for this (useLiveFixtures for the 5 domestic leagues, useEuropaFixtures
// for the 3 UEFA ones) rather than a third from-scratch cross-cutting
// query -- each already carries its own Realtime subscription + visibility/
// focus + poll fallback (see their own files for why all three exist), so
// reusing them here means LiveTab.jsx inherits that same freshness
// guarantee for free instead of a fourth copy of the same plumbing.
export function useAllLiveFixtures() {
  const { fixtures: domesticLive, loading: domesticLoading, refetch: refetchDomestic } = useLiveFixtures();
  const { data: europaData, loading: europaLoading, refetch: refetchEuropa } = useEuropaFixtures();

  const groups = useMemo(() => {
    const bySlug = new Map();
    for (const f of domesticLive) {
      if (!f.leagueSlug) continue;
      if (!bySlug.has(f.leagueSlug)) bySlug.set(f.leagueSlug, []);
      bySlug.get(f.leagueSlug).push(f);
    }
    for (const slug of Object.keys(europaData)) {
      const live = europaData[slug].filter((f) => f.status === 'live');
      if (live.length === 0) continue;
      if (!bySlug.has(slug)) bySlug.set(slug, []);
      bySlug.get(slug).push(...live);
    }
    return GROUP_ORDER.filter((slug) => bySlug.has(slug)).map((slug) => ({
      slug,
      meta: GROUP_META.get(slug),
      fixtures: bySlug.get(slug),
    }));
  }, [domesticLive, europaData]);

  const total = useMemo(() => groups.reduce((sum, g) => sum + g.fixtures.length, 0), [groups]);

  // Pull-to-refresh target for LiveTab.jsx -- re-runs both halves' own
  // refetch in parallel, same "re-read whatever the last sync already
  // stored" contract every other refetch in the app has.
  const refetch = useCallback(() => Promise.all([refetchDomestic(), refetchEuropa()]), [refetchDomestic, refetchEuropa]);

  return { groups, total, loading: domesticLoading || europaLoading, refetch };
}
