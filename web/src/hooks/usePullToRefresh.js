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
//
// `gestureRef` (optional): per explicit feedback, pulling down only worked
// with a finger already inside the scrolling list itself, not from
// anywhere else in the tab (e.g. starting on the league switcher/header
// above it). Every call site now owns a ref on its own outermost wrapper
// (header + list together) and passes it in here -- touch listeners attach
// to that instead of the list's own scrolling element, while `scrollRef`
// (still returned, still attached to the actual scrolling div by the
// caller) is used only to read `scrollTop`, which is what actually decides
// whether a pull should be allowed to start. Falls back to `scrollRef`
// itself when no `gestureRef` is given, so this stays backwards-compatible
// for any future call site that only wants the old, list-scoped behaviour.
//
// `refreshing` (returned): per explicit feedback the pulled-down content
// should stay pushed down, spinner spinning, for the whole time the
// refresh is actually in flight -- like the native browser pull-to-refresh
// on goal-api.com the request referenced, not just a brief release flash.
// Settles to exactly PULL_THRESHOLD (not wherever between that and
// PULL_MAX the finger happened to let go) so the "parked while loading"
// height is always the same regardless of how far past the threshold the
// pull went. `onRefresh` is awaited via Promise.resolve() so this works
// whether the caller's refetch is async (the normal case) or a plain sync
// function.
export function usePullToRefresh(onRefresh, gestureRef) {
  const scrollRef = useRef(null);
  const [pullDistance, setPullDistance] = useState(0);
  const [pulling, setPulling] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    const el = gestureRef?.current ?? scrollRef.current;
    if (!el) return;

    let startX = null;
    let startY = null;
    // null = undecided, false = horizontal/ignored this touch, true = vertical pull live.
    let vertical = null;
    let moveAttached = false;

    const handleTouchMove = (e) => {
      const contentEl = scrollRef.current;
      if (startY == null || vertical === false || !contentEl) return;
      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;

      if (vertical == null) {
        if (Math.abs(dx) < AXIS_LOCK && Math.abs(dy) < AXIS_LOCK) return;
        // Mirrors useLeagueCarousel.js's own fix: a horizontal swipe's first
        // sample past the lock distance can be slightly diagonal (a couple
        // px of vertical drift before the finger straightens out) -- only
        // commit to "vertical" once dy clearly dominates dx, not the instant
        // it edges ahead by a pixel, so a swipe attempt doesn't get read as
        // a pull just because of that early ambiguity.
        if (Math.abs(dx) <= Math.abs(dy) * 2 && Math.abs(dy) <= Math.abs(dx) * 2) return;
        vertical = Math.abs(dy) > Math.abs(dx);
        if (!vertical) return;
      }

      if (dy <= 0 || contentEl.scrollTop > 0) {
        startY = null;
        setPulling(false);
        setPullDistance(0);
        return;
      }
      e.preventDefault();
      setPulling(true);
      setPullDistance(dampen(dy));
    };

    const detachMove = () => {
      if (!moveAttached) return;
      el.removeEventListener('touchmove', handleTouchMove);
      moveAttached = false;
    };

    // User-reported: scrolling inside a genuinely long/scrollable list felt
    // like it was "competing" with the pull gesture. Root cause: touchmove
    // has to be non-passive (see this hook's own top comment for why --
    // preventDefault() has to be available once a pull is confirmed), and a
    // *permanently* registered non-passive listener forces the browser to
    // synchronously ask this handler before it can commit to its own fast,
    // compositor-thread scroll path -- true for every touchmove anywhere in
    // the gesture area, even ones this handler immediately no-ops on
    // (startY == null, i.e. the list wasn't at the top). That's what read as
    // sluggish/competing scrolling deeper in a long list. Attaching
    // touchmove only for the duration of a touch that actually STARTS at
    // scrollTop <= 0 (a genuine pull candidate) keeps the browser's fast
    // path fully available for every other touch, which is the vast
    // majority of scrolling in anything long enough to need it.
    //
    // scrollRef.current is read fresh here (and in handleTouchMove above),
    // not captured once when this effect ran -- confirmed live: switching
    // league re-keys FixturesList/EuropaTab's own list component (see
    // LeagueCarousel.jsx's own comment on why), which swaps in a whole new
    // scrolling DOM node under the same scrollRef. This effect's dependency
    // array is just `[gestureRef]` (gestureRef -- the outer tab wrapper --
    // never itself remounts on a league switch, so re-running the effect
    // isn't the fix); a `const contentEl = scrollRef.current` captured once
    // up here would keep pointing at the OLD league's now-detached list
    // forever, frozen at whatever scrollTop it happened to have -- usually
    // 0, which read as "always at the top" regardless of the new list's
    // real scroll position, letting a pull-down anywhere hijack what should
    // have been a normal scroll-back-up.
    const handleTouchStart = (e) => {
      const contentEl = scrollRef.current;
      if (contentEl && contentEl.scrollTop <= 0) {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        vertical = null;
        el.addEventListener('touchmove', handleTouchMove, { passive: false });
        moveAttached = true;
      } else {
        startX = null;
        startY = null;
      }
    };

    const handleTouchEnd = () => {
      if (startY != null && vertical) {
        setPulling(false);
        setPullDistance((current) => {
          if (current < PULL_THRESHOLD) return 0;
          setRefreshing(true);
          Promise.resolve(onRefreshRef.current()).finally(() => {
            setRefreshing(false);
            setPullDistance(0);
          });
          return PULL_THRESHOLD;
        });
      }
      startX = null;
      startY = null;
      vertical = null;
      detachMove();
    };

    el.addEventListener('touchstart', handleTouchStart, { passive: true });
    el.addEventListener('touchend', handleTouchEnd, { passive: true });
    el.addEventListener('touchcancel', handleTouchEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchend', handleTouchEnd);
      el.removeEventListener('touchcancel', handleTouchEnd);
      detachMove();
    };
  }, [gestureRef]);

  return { scrollRef, pullDistance, pulling, refreshing };
}
