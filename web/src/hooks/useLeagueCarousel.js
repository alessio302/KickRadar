import { useEffect, useRef, useState } from 'react';

// Fraction of the container's width a drag has to cover before release
// commits to the league switch instead of springing back -- roughly a
// third of the way across, which is the point a drag starts reading as
// "I meant to go there" rather than "just browsing/overscrolling".
const COMMIT_RATIO = 0.32;

// How long the settle (either the rest of the way to the neighbor, or
// back to 0) animates for. Matches native page-transition speed --
// noticeably quicker than this app's other transitions (e.g. the 0.15s
// toggle switches) since it's covering a much larger distance.
const SETTLE_MS = 280;
const SETTLE_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';

// A gesture that starts inside something that itself scrolls horizontally
// (the standings table's own overflow-x wrapper on narrow screens) should
// scroll that element natively, not get hijacked into a league switch --
// walks up from the touch target to the carousel container looking for one.
function startsInsideHorizontalScroller(target, boundary) {
  let node = target;
  while (node && node !== boundary) {
    if (node.scrollWidth > node.clientWidth + 1) return true;
    node = node.parentElement;
  }
  return false;
}

// Drives a native-feeling swipe pager: as the finger drags, the current
// page and a single neighbor page (whichever direction the drag leans)
// both translate 1:1 with the finger, so the neighbor's real content
// visibly slides into view instead of the switch just happening on
// release. Only decides "this is a horizontal drag" once the movement
// clearly favors that axis (see DIRECTION_LOCK below), so ordinary
// vertical list scrolling is never intercepted.
//
// Callers render two absolutely-positioned panels inside the ref'd
// container (see TransfersTab.jsx et al. for the exact markup): the
// current page transformed by `offsetX`, and -- only while `direction` is
// non-null -- a neighbor page pre-positioned just off-screen in that
// direction and transformed by the same `offsetX`, so the two move in
// perfect lockstep. `settling` is true only during the post-release
// snap/spring-back animation, letting the caller add a CSS transition
// then and only then (a transition applied during the live drag would
// make it visibly lag the finger).
export function useLeagueCarousel(onCommit) {
  const containerRef = useRef(null);
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;

  const [offsetX, setOffsetX] = useState(0);
  const [direction, setDirection] = useState(null); // 'next' | 'prev' | null
  const [settling, setSettling] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const DIRECTION_LOCK = 10;
    let startX = null;
    let startY = null;
    let width = 0;
    // null = undecided, false = vertical/ignored this touch, true = horizontal drag live.
    let horizontal = null;
    let settlingNow = false;

    const handleTouchStart = (e) => {
      if (settlingNow || e.touches.length !== 1) return;
      if (startsInsideHorizontalScroller(e.target, el)) {
        horizontal = false;
        return;
      }
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      width = el.clientWidth;
      horizontal = null;
    };

    const handleTouchMove = (e) => {
      if (startX == null || horizontal === false) return;
      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;

      if (horizontal == null) {
        if (Math.abs(dx) < DIRECTION_LOCK && Math.abs(dy) < DIRECTION_LOCK) return;
        horizontal = Math.abs(dx) > Math.abs(dy);
        if (!horizontal) return;
        setDirection(dx < 0 ? 'next' : 'prev');
      }
      e.preventDefault();
      setOffsetX(dx);
    };

    const settle = (dx) => {
      const committed = width > 0 && Math.abs(dx) > width * COMMIT_RATIO;
      const dir = dx < 0 ? 'next' : 'prev';
      settlingNow = true;
      setSettling(true);
      setOffsetX(committed ? (dir === 'next' ? -width : width) : 0);

      window.setTimeout(() => {
        settlingNow = false;
        setSettling(false);
        setOffsetX(0);
        setDirection(null);
        if (committed) onCommitRef.current(dir);
      }, SETTLE_MS);
    };

    const handleTouchEnd = (e) => {
      if (horizontal && startX != null) {
        settle(e.changedTouches[0].clientX - startX);
      }
      startX = null;
      horizontal = null;
    };

    const handleTouchCancel = () => {
      if (horizontal) settle(0);
      startX = null;
      horizontal = null;
    };

    el.addEventListener('touchstart', handleTouchStart, { passive: true });
    el.addEventListener('touchmove', handleTouchMove, { passive: false });
    el.addEventListener('touchend', handleTouchEnd, { passive: true });
    el.addEventListener('touchcancel', handleTouchCancel, { passive: true });
    return () => {
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchmove', handleTouchMove);
      el.removeEventListener('touchend', handleTouchEnd);
      el.removeEventListener('touchcancel', handleTouchCancel);
    };
  }, []);

  return { containerRef, offsetX, direction, settling };
}

export const LEAGUE_CAROUSEL_TRANSITION = `transform ${SETTLE_MS}ms ${SETTLE_EASING}`;
