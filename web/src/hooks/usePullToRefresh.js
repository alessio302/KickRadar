import { useEffect, useRef, useState } from 'react';

// Distance the indicator has to be pulled past before releasing triggers a
// refresh, and the cap on how far it visually travels while dragging.
export const PULL_THRESHOLD = 60;
const PULL_MAX = 90;

// Same axis-lock distance as useLeagueCarousel.js's own DIRECTION_LOCK --
// keeping both at the same value means whichever axis actually dominates a
// diagonal drag wins outright, instead of one gesture reacting to a couple
// of early, still-ambiguous pixels before the other has had a chance to
// even look at the same movement.
const AXIS_LOCK = 10;

// Rubber-band curve (grows fast at first, increasingly resists further
// pulling) instead of 1:1 finger tracking -- matches native overscroll
// physics; confirmed live that a linear mapping read as "not elastic
// enough, can barely pull it."
function dampen(rawDelta) {
  return Math.min(PULL_MAX, Math.sqrt(rawDelta) * 6);
}

// Extracted from TransfersTab.jsx (its original home) so FixturesTab.jsx
// can reuse the identical gesture without duplicating the touch-handling
// logic. Only starts tracking when the list is already scrolled to the top
// (a pull gesture mid-list would just be a normal scroll), and lets go
// cleanly the moment either condition stops holding mid-drag (scrolled
// away, or dragging back up).
//
// A real, non-passive touchmove listener (attached via useEffect), not
// React's synthetic onTouchMove/onPointerMove props -- confirmed live that
// those can't reliably preventDefault() the browser's own decision to hand
// an ambiguous vertical drag off to native scrolling mid-gesture, which
// showed up as the custom indicator flashing briefly and then the pull
// just stopping tracking. Calling preventDefault() ourselves, once we've
// decided this is a pull (not a scroll), keeps the whole gesture.
//
// This element also has useLeagueCarousel's own touch listeners on an
// ancestor of it (the same touchmove bubbles to both) -- a genuinely
// diagonal drag used to trigger both at once (confirmed live via
// screenshot: the pull indicator and a half-slid-in neighbor league
// showing together), since this hook used to react to any downward
// movement at all regardless of how much horizontal movement came with
// it. Waiting for AXIS_LOCK pixels of movement before deciding whether
// the drag is dominantly vertical mirrors the same lock useLeagueCarousel
// applies for "dominantly horizontal" -- a diagonal drag now commits to
// whichever axis actually wins, never both.
export function usePullToRefresh(onRefresh) {
  const scrollRef = useRef(null);
  const [pullDistance, setPullDistance] = useState(0);
  const [pulling, setPulling] = useState(false);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    let startX = null;
    let startY = null;
    // null = undecided, false = horizontal/ignored this touch, true = vertical pull live.
    let vertical = null;

    const handleTouchStart = (e) => {
      if (el.scrollTop <= 0) {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        vertical = null;
      } else {
        startX = null;
        startY = null;
      }
    };

    const handleTouchMove = (e) => {
      if (startY == null || vertical === false) return;
      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;

      if (vertical == null) {
        if (Math.abs(dx) < AXIS_LOCK && Math.abs(dy) < AXIS_LOCK) return;
        vertical = Math.abs(dy) > Math.abs(dx);
        if (!vertical) return;
      }

      if (dy <= 0 || el.scrollTop > 0) {
        startY = null;
        setPulling(false);
        setPullDistance(0);
        return;
      }
      e.preventDefault();
      setPulling(true);
      setPullDistance(dampen(dy));
    };

    const handleTouchEnd = () => {
      if (startY != null && vertical) {
        setPullDistance((current) => {
          if (current >= PULL_THRESHOLD) onRefreshRef.current();
          return 0;
        });
        setPulling(false);
      }
      startX = null;
      startY = null;
      vertical = null;
    };

    el.addEventListener('touchstart', handleTouchStart, { passive: true });
    el.addEventListener('touchmove', handleTouchMove, { passive: false });
    el.addEventListener('touchend', handleTouchEnd, { passive: true });
    el.addEventListener('touchcancel', handleTouchEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchmove', handleTouchMove);
      el.removeEventListener('touchend', handleTouchEnd);
      el.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, []);

  return { scrollRef, pullDistance, pulling };
}
