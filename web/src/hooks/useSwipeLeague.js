import { useEffect, useRef } from 'react';

// Horizontal distance a drag needs to cover before it commits to a league
// switch -- short enough to feel responsive, long enough that an
// off-axis vertical scroll or a tap-and-slightly-drag on a card doesn't
// accidentally fire it.
const SWIPE_THRESHOLD = 60;

// How far a touch has to move (in either axis) before we decide whether
// the gesture is horizontal (a league swipe) or vertical (a normal list
// scroll) at all. Below this it's ambiguous -- deciding too early on a
// couple of jittery pixels misreads plenty of vertical scrolls as
// horizontal swipes.
const DIRECTION_LOCK_THRESHOLD = 10;

// A gesture that starts inside something that itself scrolls horizontally
// (the standings table's own overflow-x wrapper on narrow screens) should
// scroll that element natively, not get hijacked into a league switch --
// walks up from the touch target to the swipe container looking for one.
function startsInsideHorizontalScroller(target, boundary) {
  let node = target;
  while (node && node !== boundary) {
    if (node.scrollWidth > node.clientWidth + 1) return true;
    node = node.parentElement;
  }
  return false;
}

// Attach the returned ref to a tab's main (vertically scrolling) content
// area to let the user swipe left/right across it to switch league instead
// of always reaching up to tap the league pill row -- confirmed requested
// as a faster alternative to LeagueSwitcher.jsx's tap targets, not a
// replacement for them. Coexists with usePullToRefresh's own touchmove
// listener on the same element (see its file): that one only ever acts on
// a downward drag at scrollTop 0, this one only ever acts once a drag has
// locked horizontal, so the two never fight over the same gesture.
export function useSwipeLeague(onSwipeLeft, onSwipeRight) {
  const ref = useRef(null);
  const onSwipeLeftRef = useRef(onSwipeLeft);
  const onSwipeRightRef = useRef(onSwipeRight);
  onSwipeLeftRef.current = onSwipeLeft;
  onSwipeRightRef.current = onSwipeRight;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let startX = null;
    let startY = null;
    // null = not yet decided, false = vertical/ignored, true = horizontal swipe in progress.
    let horizontal = null;

    const reset = () => {
      startX = null;
      startY = null;
      horizontal = null;
    };

    const handleTouchStart = (e) => {
      if (e.touches.length !== 1) {
        reset();
        return;
      }
      if (startsInsideHorizontalScroller(e.target, el)) {
        horizontal = false;
        return;
      }
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      horizontal = null;
    };

    const handleTouchMove = (e) => {
      if (startX == null || horizontal === false) return;
      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;

      if (horizontal == null) {
        if (Math.abs(dx) < DIRECTION_LOCK_THRESHOLD && Math.abs(dy) < DIRECTION_LOCK_THRESHOLD) return;
        horizontal = Math.abs(dx) > Math.abs(dy);
        if (!horizontal) return;
      }
      // Locked horizontal -- stop the page from also rubber-banding
      // sideways while we track the rest of the drag.
      e.preventDefault();
    };

    const handleTouchEnd = (e) => {
      if (horizontal && startX != null) {
        const dx = e.changedTouches[0].clientX - startX;
        if (dx <= -SWIPE_THRESHOLD) onSwipeLeftRef.current();
        else if (dx >= SWIPE_THRESHOLD) onSwipeRightRef.current();
      }
      reset();
    };

    el.addEventListener('touchstart', handleTouchStart, { passive: true });
    el.addEventListener('touchmove', handleTouchMove, { passive: false });
    el.addEventListener('touchend', handleTouchEnd, { passive: true });
    el.addEventListener('touchcancel', reset, { passive: true });
    return () => {
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchmove', handleTouchMove);
      el.removeEventListener('touchend', handleTouchEnd);
      el.removeEventListener('touchcancel', reset);
    };
  }, []);

  return ref;
}
