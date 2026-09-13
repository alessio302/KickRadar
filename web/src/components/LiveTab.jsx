import { useMemo, useRef, useState } from 'react';
import FixtureRow from './FixtureRow.jsx';
import FixtureDetailOverlay from './FixtureDetailOverlay.jsx';
import EuropaFixtureDetailOverlay from './EuropaFixtureDetailOverlay.jsx';
import PullToRefreshIndicator from './PullToRefreshIndicator.jsx';
import { useAllLiveFixtures } from '../hooks/useAllLiveFixtures.js';
import { usePullToRefresh } from '../hooks/usePullToRefresh.js';
import { useFavoriteFixtures } from '../hooks/useFavoriteFixtures.js';
import { NOTIFICATIONS_DENIED } from '../lib/ensurePushSubscription.js';

// Replaces LiveCarousel.jsx as the app's primary "what's live right now"
// surface -- that widget only ever showed a few horizontally-scrolling
// cards at the top of the (now-merged-into-Ligen) Spiele tab, easy to miss
// once more than 2-3 matches overlap. This is a dedicated, vertically
// scrolling list instead, grouped by competition across every domestic
// league AND every UEFA competition at once (see useAllLiveFixtures.js).
//
// Deliberately has NO LeagueCarousel/league-swipe of its own -- there's
// nothing to swipe BETWEEN here (every competition's live matches already
// show at once, in one list), which sidesteps the swipe-vs-pull-to-refresh
// conflict LigenTab.jsx/EuropaTab.jsx both have to actively guard against
// (see useLeagueCarousel.js/usePullToRefresh.js's own axis-lock comments)
// entirely: only a single vertical scroller exists here, so there's no
// horizontal gesture for a vertical pull to ever compete with.

// One team's badge/name (left) and score (right) for a EUROPEAN live
// fixture -- team_name-keyed fields (home_team_name/home_team_badge, no
// clubs table row exists for UEFA competitions, see
// syncEuropeanFixtures.js's own comment), so this can't reuse FixtureRow.jsx
// (domestic, clubsById-keyed) directly. Same compact visual language as
// that component's own TeamRow, just resolved off different fields --
// mirrors EuropaTab.jsx's own EuropaFixtureRow, condensed to this list's
// tighter row height.
function EuropaLiveRow({ theme, fixture, onSelectFixture }) {
  return (
    <div
      onClick={() => onSelectFixture(fixture)}
      style={{
        background: theme.surfaceRaised,
        border: `1px solid ${theme.border}`,
        borderRadius: '10px',
        display: 'flex',
        alignItems: 'stretch',
        gap: '8px',
        padding: '8px 12px',
        cursor: 'pointer',
      }}
    >
      <span aria-hidden="true" style={{ width: '3px', borderRadius: '2px', background: theme.danger, flexShrink: 0 }} />
      <div style={{ width: '32px', flex: '0 0 auto', display: 'flex', alignItems: 'center' }}>
        <span style={{ fontSize: '11px', fontWeight: 700, color: theme.danger, whiteSpace: 'nowrap' }}>
          {fixture.live_minute ? (fixture.live_minute === 'HT' ? fixture.live_minute : `${fixture.live_minute}'`) : '●'}
        </span>
      </div>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '6px', justifyContent: 'center' }}>
        {[
          ['home', fixture.home_team_short_name || fixture.home_team_name, fixture.home_team_badge, fixture.home_score],
          ['away', fixture.away_team_short_name || fixture.away_team_name, fixture.away_team_badge, fixture.away_score],
        ].map(([side, name, badge, score]) => (
          <div key={side} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '7px', minWidth: 0 }}>
              {badge ? (
                <img src={badge} alt={name} width={18} height={18} style={{ objectFit: 'contain', flex: '0 0 auto' }} />
              ) : (
                <span style={{ width: '18px', height: '18px', borderRadius: '999px', background: theme.surface, border: `1px solid ${theme.border}`, flexShrink: 0 }} />
              )}
              <span style={{ fontSize: '12.5px', fontWeight: 700, color: theme.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {name || '—'}
              </span>
            </div>
            {score != null && (
              <span style={{ fontSize: '12.5px', fontWeight: 700, color: theme.danger, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{score}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function LeagueGroupHeader({ theme, meta }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '0 0 8px' }}>
      <span
        style={{
          width: '22px',
          height: '22px',
          borderRadius: '6px',
          background: '#FFFFFF',
          border: `1px solid ${theme.border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          overflow: 'hidden',
          boxSizing: 'border-box',
          padding: '2px',
        }}
      >
        {meta?.logo ? <img src={meta.logo} alt={meta.label} style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : null}
      </span>
      <span style={{ fontSize: '13px', fontWeight: 700, color: theme.text }}>{meta?.label ?? '—'}</span>
    </div>
  );
}

export default function LiveTab({ theme, t, language, onFavoriteToast }) {
  const { groups, total, loading, refetch } = useAllLiveFixtures();
  const { favoriteIds, toggleFavorite } = useFavoriteFixtures(language);
  const [selectedDomestic, setSelectedDomestic] = useState(null);
  const [selectedEuropa, setSelectedEuropa] = useState(null);

  const pullContainerRef = useRef(null);
  const { scrollRef: pullScrollRef, pullDistance, pulling, refreshing: pullRefreshing } = usePullToRefresh(refetch, pullContainerRef);

  // Re-derived from the live-updating `groups` on every render (not a
  // frozen snapshot of the row at click time) -- same fix FixturesTab.jsx/
  // EuropaTab.jsx both needed for the identical "already-open overlay stops
  // updating" bug, see either file's own comment for the full writeup.
  const liveSelectedDomestic = useMemo(() => {
    if (!selectedDomestic) return null;
    for (const group of groups) {
      const found = group.fixtures.find((f) => f.id === selectedDomestic.id && f.homeClub);
      if (found) return found;
    }
    return selectedDomestic;
  }, [selectedDomestic, groups]);
  const liveSelectedEuropa = useMemo(() => {
    if (!selectedEuropa) return null;
    for (const group of groups) {
      const found = group.fixtures.find((f) => f.id === selectedEuropa.id && !f.homeClub);
      if (found) return found;
    }
    return selectedEuropa;
  }, [selectedEuropa, groups]);

  const handleToggleFavorite = async (fixture) => {
    try {
      const result = await toggleFavorite(fixture.id);
      onFavoriteToast(result === 'added' ? t.fixtures.favoritedToast : t.fixtures.unfavoritedToast);
    } catch (err) {
      onFavoriteToast(err.message === NOTIFICATIONS_DENIED ? t.errors.notificationsDenied : err.message);
    }
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <PullToRefreshIndicator theme={theme} containerRef={pullContainerRef} pullDistance={pullDistance} pulling={pulling} refreshing={pullRefreshing}>
        <div
          ref={pullScrollRef}
          style={{ height: '100%', overflowY: 'auto', WebkitOverflowScrolling: 'touch', overscrollBehaviorY: 'none', padding: '14px 16px' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            {total > 0 && <span aria-hidden="true" className="kr-live-dot" style={{ background: theme.danger }} />}
            <span style={{ fontSize: '15px', fontWeight: 700, color: theme.text }}>
              {loading && total === 0 ? t.common.loading : total > 0 ? t.live.summary(total) : t.live.empty}
            </span>
          </div>
          <style>{`
            .kr-live-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; animation: kr-live-pulse 1.8s infinite; }
            @keyframes kr-live-pulse {
              0% { box-shadow: 0 0 0 0 rgba(239,68,68,.5); }
              70% { box-shadow: 0 0 0 7px rgba(239,68,68,0); }
              100% { box-shadow: 0 0 0 0 rgba(239,68,68,0); }
            }
            @media (prefers-reduced-motion: reduce) { .kr-live-dot { animation: none; } }
          `}</style>

          {groups.map((group) => {
            const isDomestic = group.fixtures[0]?.homeClub !== undefined;
            return (
              <div key={group.slug} style={{ marginBottom: '18px' }}>
                <LeagueGroupHeader theme={theme} meta={group.meta} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {group.fixtures.map((f) =>
                    isDomestic ? (
                      <FixtureRow
                        key={f.id}
                        theme={theme}
                        t={t}
                        locale={undefined}
                        formatTime={() => ''}
                        clubsById={new Map([[f.home_club_id, f.homeClub], [f.away_club_id, f.awayClub]])}
                        fixture={f}
                        isFavorite={favoriteIds?.has(f.id) ?? false}
                        onSelectFixture={setSelectedDomestic}
                        onToggleFavorite={handleToggleFavorite}
                      />
                    ) : (
                      <EuropaLiveRow key={f.id} theme={theme} fixture={f} onSelectFixture={setSelectedEuropa} />
                    )
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </PullToRefreshIndicator>

      {liveSelectedDomestic && (
        <FixtureDetailOverlay
          theme={theme}
          t={t}
          language={language}
          league={liveSelectedDomestic.leagueSlug}
          fixture={liveSelectedDomestic}
          homeClub={liveSelectedDomestic.homeClub}
          awayClub={liveSelectedDomestic.awayClub}
          onClose={() => setSelectedDomestic(null)}
        />
      )}
      {liveSelectedEuropa && (
        <EuropaFixtureDetailOverlay
          theme={theme}
          t={t}
          language={language}
          fixture={liveSelectedEuropa}
          onClose={() => setSelectedEuropa(null)}
        />
      )}
    </div>
  );
}
