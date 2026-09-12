import { useMemo, useRef, useState } from 'react';
import LeagueSwitcher from './LeagueSwitcher.jsx';
import LeagueCarousel from './LeagueCarousel.jsx';
import QuickFilters from './QuickFilters.jsx';
import TransferCard from './TransferCard.jsx';
import TransferSummaryOverlay from './TransferSummaryOverlay.jsx';
import PlayerProfileOverlay from './PlayerProfileOverlay.jsx';
import PullToRefreshIndicator from './PullToRefreshIndicator.jsx';
import { useClubs } from '../hooks/useClubs.js';
import { useTransfers } from '../hooks/useTransfers.js';
import { usePullToRefresh } from '../hooks/usePullToRefresh.js';
import { fetchPlayerProfile } from '../lib/playerProfile.js';
import { DATE_LOCALES } from '../i18n/languages.js';

// The transfer feed for one league -- rendered twice by LeagueCarousel
// while a swipe is in progress (the active league and whichever neighbor
// is being dragged into view). Only the active instance is interactive
// (onOpenProfile/onOpenSummary are undefined on the preview one, and its
// club filter is ignored -- see LeagueCarousel.jsx's own comment for why a
// mid-drag preview represents "what you're about to land on" rather than
// something meant to be tapped).
function TransfersList({ theme, t, language, league, officialOnly, activeFilter, onOpenProfile, onOpenSummary, scrollRef, refetchRef }) {
  const { transfers, loading, refetch } = useTransfers(league, { officialOnly });
  // Plain assignment during render, same idiom as usePullToRefresh.js's own
  // onRefreshRef -- the tab-level hook call (see TransfersTab.jsx) reads
  // this later, from an event handler, well after this render has
  // committed, so there's no staleness risk despite not going through an
  // effect. Only set for the active instance (see call site) -- the
  // preview one gets no ref to write into.
  if (refetchRef) refetchRef.current = refetch;

  const filtered = useMemo(() => {
    if (!activeFilter) return transfers;
    return transfers.filter((transfer) => transfer.from_club_id === activeFilter.id || transfer.to_club_id === activeFilter.id);
  }, [transfers, activeFilter]);

  return (
    <div
      ref={scrollRef}
      style={{
        height: '100%',
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
        overscrollBehaviorY: 'none',
        padding: '12px 16px 14px',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {loading && (
          <p style={{ fontSize: '13px', color: theme.textMuted, textAlign: 'center', padding: '24px 0' }}>{t.common.loading}</p>
        )}
        {!loading && filtered.length === 0 && (
          <p style={{ fontSize: '13px', color: theme.textMuted, textAlign: 'center', padding: '24px 0' }}>
            {t.transfers.empty}
          </p>
        )}
        {filtered.map((transfer) => (
          <TransferCard
            key={transfer.id}
            theme={theme}
            t={t}
            language={language}
            transfer={transfer}
            onOpenProfile={onOpenProfile}
            onOpenSummary={onOpenSummary}
          />
        ))}
      </div>
    </div>
  );
}

export default function TransfersTab({
  theme,
  t,
  language,
  league,
  onSelectLeague,
  onSwipeLeague,
  favoriteClub,
  quickFilters,
  activeFilter,
  onSelectFilter,
  onAddQuickFilter,
  onRemoveQuickFilter,
  officialOnly,
  onToggleOfficialOnly,
}) {
  const { clubs } = useClubs(league);
  const locale = DATE_LOCALES[language];
  const [summaryTransfer, setSummaryTransfer] = useState(null);
  const [profilePlayer, setProfilePlayer] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  // Whole-tab pull-to-refresh target (header + list together) -- see
  // usePullToRefresh.js's own `gestureRef` comment for why this needs to
  // be the tab's own outer wrapper rather than just the scrolling list.
  // The hook itself lives here (not in TransfersList) so
  // PullToRefreshIndicator can wrap -- and visually push down -- the
  // header along with the list, per explicit feedback (goal-api.com's own
  // native pull-to-refresh, referenced as the target look). refetchRef is
  // how the active TransfersList instance's own refetch (only known
  // inside it, since it's a per-league data hook) reaches back up here.
  const pullContainerRef = useRef(null);
  const refetchRef = useRef(() => {});
  const { scrollRef: pullScrollRef, pullDistance, pulling, refreshing: pullRefreshing } = usePullToRefresh(
    () => refetchRef.current(),
    pullContainerRef
  );

  // Immediate placeholder from the already-fetched, possibly-stale
  // `players` join (so the overlay isn't blank while the live call is in
  // flight), then upgraded to the same live profile a lineup/squad tap
  // would show for this exact player -- see lib/playerProfile.js.
  const handleOpenProfile = async (transfer) => {
    setProfilePlayer({ name: transfer.player_name, ...transfer.players });
    setProfileLoading(true);
    const live = await fetchPlayerProfile(transfer.players?.goal_api_id);
    if (live) setProfilePlayer(live);
    setProfileLoading(false);
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <PullToRefreshIndicator theme={theme} containerRef={pullContainerRef} pullDistance={pullDistance} pulling={pulling} refreshing={pullRefreshing}>
        <div style={{ flexShrink: 0, padding: '14px 16px 0' }}>
          <LeagueSwitcher league={league} onSelectLeague={onSelectLeague} theme={theme} />

          <QuickFilters
            theme={theme}
            t={t}
            clubs={clubs}
            favoriteClub={favoriteClub}
            quickFilters={quickFilters}
            activeFilterId={activeFilter?.id ?? null}
            onSelectFilter={onSelectFilter}
            onAddQuickFilter={onAddQuickFilter}
            onRemoveQuickFilter={onRemoveQuickFilter}
          />

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 2px',
              borderTop: `1px solid ${theme.border}`,
              borderBottom: `1px solid ${theme.border}`,
            }}
          >
            <span style={{ fontSize: '13px', color: theme.textMuted }}>{t.transfers.officialOnly}</span>
            <button
              onClick={onToggleOfficialOnly}
              aria-label={t.transfers.officialOnlyToggle}
              style={{
                width: '40px',
                height: '22px',
                borderRadius: '999px',
                border: 'none',
                cursor: 'pointer',
                background: officialOnly ? theme.accent : theme.border,
                position: 'relative',
              }}
            >
              <div
                style={{
                  width: '16px',
                  height: '16px',
                  borderRadius: '50%',
                  background: theme.surface,
                  position: 'absolute',
                  top: '3px',
                  left: officialOnly ? '21px' : '3px',
                  transition: 'left 0.15s',
                }}
              />
            </button>
          </div>
        </div>

        <LeagueCarousel
          league={league}
          onSwitchLeague={onSwipeLeague}
          renderPage={(slug) => (
            <TransfersList
              key={slug}
              theme={theme}
              t={t}
              language={language}
              league={slug}
              officialOnly={officialOnly}
              activeFilter={slug === league ? activeFilter : null}
              onOpenProfile={slug === league ? handleOpenProfile : undefined}
              onOpenSummary={slug === league ? setSummaryTransfer : undefined}
              scrollRef={slug === league ? pullScrollRef : undefined}
              refetchRef={slug === league ? refetchRef : undefined}
            />
          )}
        />
      </PullToRefreshIndicator>

      {summaryTransfer && (
        <TransferSummaryOverlay theme={theme} t={t} language={language} transfer={summaryTransfer} onClose={() => setSummaryTransfer(null)} />
      )}
      {profilePlayer && (
        <PlayerProfileOverlay theme={theme} t={t} player={profilePlayer} locale={locale} loading={profileLoading} onClose={() => setProfilePlayer(null)} />
      )}
    </div>
  );
}
