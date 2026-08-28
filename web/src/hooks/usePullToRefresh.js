import { useEffect, useRef, useState } from 'react';

// Distance the indicator has to be pulled past before releasing triggers a
// refresh, and the cap on how far it visually travels while dragging.
export const PULL_THRESHOLD = 60;
const PULL_MAX = 90;

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
export function usePullToRefresh(onRefresh) {
  const scrollRef = useRef(null);
  const [pullDistance, setPullDistance] = useState(0);
  const [pulling, setPulling] = useState(false);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    let startY = null;

    const handleTouchStart = (e) => {
      startY = el.scrollTop <= 0 ? e.touches[0].clientY : null;
    };

    const handleTouchMove = (e) => {
      if (startY == null) return;
      const rawDelta = e.touches[0].clientY - startY;
      if (rawDelta <= 0 || el.scrollTop > 0) {
        startY = null;
        setPulling(false);
        setPullDistance(0);
        return;
      }
      e.preventDefault();
      setPulling(true);
      setPullDistance(dampen(rawDelta));
    };

    const handleTouchEnd = () => {
      if (startY != null) {
        setPullDistance((current) => {
          if (current >= PULL_THRESHOLD) onRefreshRef.current();
          return 0;
        });
        setPulling(false);
      }
      startY = null;
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
