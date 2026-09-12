import { createPortal } from 'react-dom';
import { Loader2 } from 'lucide-react';
import { PULL_THRESHOLD } from '../hooks/usePullToRefresh.js';

// Per explicit feedback: no more "Pull to refresh"/"Release to
// refresh"/"Refreshing…" text next to the icon -- just the plain rotating
// circle every native pull-to-refresh already uses. Rendered via a portal
// into `containerRef` (the tab's own outermost wrapper, the same node
// usePullToRefresh's `gestureRef` attaches its touch listeners to -- see
// that hook's own comment) rather than inline where this component is
// called from: the list component that owns pullDistance/pulling/
// refreshing sits *inside* LeagueCarousel, which applies its own
// `transform: translateX(...)` to page wrappers while a swipe is in
// progress -- position:fixed/absolute inside a transformed ancestor
// resolves against that ancestor, not the true top of the tab, so without
// the portal the circle would drift sideways mid-swipe instead of staying
// pinned centred at the top. `containerRef`'s own element needs
// `position: relative` for this absolute positioning to anchor correctly
// (set on each tab's own outer wrapper).
export default function PullToRefreshIndicator({ theme, containerRef, pullDistance, pulling, refreshing }) {
  if (!containerRef?.current) return null;
  if (!refreshing && pullDistance <= 0) return null;

  const progress = Math.min(pullDistance / PULL_THRESHOLD, 1);

  return createPortal(
    <>
      <style>{'@keyframes kickradar-spin { to { transform: rotate(360deg); } }'}</style>
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: '14px',
          left: '50%',
          transform: `translateX(-50%) scale(${refreshing ? 1 : progress})`,
          opacity: refreshing ? 1 : progress,
          transition: pulling ? 'none' : 'opacity 0.2s ease, transform 0.2s ease',
          pointerEvents: 'none',
          zIndex: 5,
          filter: `drop-shadow(0 2px 6px ${theme.isDark ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.15)'})`,
        }}
      >
        <Loader2
          size={22}
          color={theme.accent}
          style={{
            display: 'block',
            animation: refreshing ? 'kickradar-spin 0.7s linear infinite' : 'none',
            transform: refreshing ? undefined : `rotate(${progress * 360}deg)`,
          }}
        />
      </div>
    </>,
    containerRef.current
  );
}
