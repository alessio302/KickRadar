import { Loader2 } from 'lucide-react';
import { PULL_THRESHOLD } from '../hooks/usePullToRefresh.js';

// Per explicit feedback (reference: goal-api.com's own native pull-to-
// refresh): the whole screen -- header included -- should visibly slide
// down while pulling, revealing a big spinning circle in the gap above it,
// not a small icon floating on top of unmoving content. This is now a
// genuine wrapper, not an inline-rendered indicator: it owns the outer
// `containerRef` node (the same one usePullToRefresh's `gestureRef` reads
// touch events from) and translates its `children` down by the live pull
// distance -- everything a tab passes in (header + LeagueCarousel) moves
// together as one unit, same as the reference.
//
// `overflow: hidden` on the outer node clips the revealed-circle area to
// exactly its own height (0 at rest) and clips the sliding content's own
// bottom edge by the same amount while pulled -- both intentional, same
// as native pull-to-refresh.
//
// No more "Pull to refresh"/"Release to refresh"/"Refreshing…" text, per
// earlier feedback -- still just the plain rotating circle, now bigger and
// living in the revealed gap instead of overlaid on the list.
export default function PullToRefreshIndicator({ theme, containerRef, pullDistance, pulling, refreshing, children }) {
  // Parked at exactly PULL_THRESHOLD while a refresh is actually in
  // flight, regardless of how far past it the finger let go -- the
  // "revealed" height stays consistent from pull to pull, and stays open
  // for the full request instead of the release snapping straight back.
  const displayDistance = refreshing ? PULL_THRESHOLD : pullDistance;
  const progress = Math.min(pullDistance / PULL_THRESHOLD, 1);
  const settleTransition = 'transform 0.25s cubic-bezier(0.22, 1, 0.36, 1), height 0.25s cubic-bezier(0.22, 1, 0.36, 1)';

  return (
    <div ref={containerRef} style={{ position: 'relative', height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <style>{'@keyframes kickradar-spin { to { transform: rotate(360deg); } }'}</style>
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: `${displayDistance}px`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          transition: pulling ? 'none' : settleTransition,
        }}
      >
        <Loader2
          size={34}
          color={theme.accent}
          style={{
            display: 'block',
            opacity: refreshing ? 1 : progress,
            animation: refreshing ? 'kickradar-spin 0.7s linear infinite' : 'none',
            transform: refreshing ? undefined : `rotate(${progress * 360}deg)`,
            transition: pulling ? 'none' : 'opacity 0.25s ease',
          }}
        />
      </div>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          transform: `translateY(${displayDistance}px)`,
          transition: pulling ? 'none' : settleTransition,
        }}
      >
        {children}
      </div>
    </div>
  );
}
