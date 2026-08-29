import { useLeagueCarousel, LEAGUE_CAROUSEL_TRANSITION } from '../hooks/useLeagueCarousel.js';

// Shared swipe-pager shell for Transfers/Spiele/Tabelle's main content
// area -- see useLeagueCarousel.js for the drag physics. Renders exactly
// one extra panel at a time (the neighbor in whatever direction the user
// is actually dragging), not all four other leagues, so a swipe only ever
// costs one extra page's worth of data fetching, and only while a drag is
// actually in progress.
//
// `renderPage(leagueSlug)` must return that page's own scrolling content,
// keyed by that slug (each tab already has one, e.g. TransfersTab's
// `ref={scrollRef}` list) -- the key matters here specifically so the main
// panel remounts (and hydrates instantly from that hook's own cache, see
// e.g. useTransfers.js) the moment it hands off from the frozen drag
// league to the newly-active one, instead of reusing the old instance and
// waiting a render cycle for its effect to catch up. Interactive bits tied
// to app-level state (overlays, filters) stay in the calling tab and are
// deliberately not passed a league override, since the preview panel
// represents "what you're about to land on", not something meant to be
// interacted with mid-drag.
export default function LeagueCarousel({ league, onSwitchLeague, renderPage }) {
  const { containerRef, offsetX, direction, settling, fromLeague, toLeague } = useLeagueCarousel(league, (dir) =>
    onSwitchLeague(dir === 'next' ? 1 : -1)
  );
  const transition = settling ? LEAGUE_CAROUSEL_TRANSITION : 'none';

  return (
    <div ref={containerRef} style={{ position: 'relative', flex: 1, minHeight: 0, overflow: 'hidden' }}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          transform: `translateX(${offsetX}px)`,
          transition,
        }}
      >
        {renderPage(fromLeague)}
      </div>

      {toLeague && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            width: '100%',
            left: direction === 'next' ? '100%' : '-100%',
            transform: `translateX(${offsetX}px)`,
            transition,
          }}
        >
          {renderPage(toLeague)}
        </div>
      )}
    </div>
  );
}
