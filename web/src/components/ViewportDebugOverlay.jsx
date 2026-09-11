import { useEffect, useState } from 'react';

// Temporary re-add (2026-09-11, same pattern used earlier this session --
// see git history for the prior instance) to pin down WHY the bottom nav
// pill's corners looked "cut off" after dropping viewport-fit=cover
// (index.html): user-reported the top is now clean but the bottom two
// corners of the pill render flat/clipped instead of the intended rounded
// shape. Likely cause: the app shell's own computed height still doesn't
// exactly track the new (post-viewport-fit removal) safe-area-shrunk
// layout viewport, clipping a few px off the last flex child (BottomNav) --
// same root-cause SHAPE as the original 47px gap, just much smaller now.
// Shows the same numbers as before (innerHeight/visualViewport/shell rect/
// standalone/dpr/screenHeight) plus a bottom bar sized to the shell-vs-
// screen gap, so it's directly visible whether that gap is now ~0 (a pure
// rendering artifact, fixable with a tiny explicit margin) or still
// nonzero (still a sizing mismatch to chase).
//
// Remove this file and its one import/render in App.jsx once this repro
// has been captured -- this is a diagnostic, not a feature.
export default function ViewportDebugOverlay({ shellRef }) {
  const [info, setInfo] = useState(null);

  useEffect(() => {
    function measure() {
      const rect = shellRef.current?.getBoundingClientRect();
      const vv = window.visualViewport;
      setInfo({
        innerH: window.innerHeight,
        vvH: vv ? Math.round(vv.height) : null,
        vvTop: vv ? Math.round(vv.offsetTop) : null,
        docClientH: document.documentElement.clientHeight,
        shellTop: rect ? Math.round(rect.top) : null,
        shellH: rect ? Math.round(rect.height) : null,
        shellBottom: rect ? Math.round(rect.bottom) : null,
        standalone: window.matchMedia('(display-mode: standalone)').matches,
        dpr: window.devicePixelRatio,
        screenH: window.screen.height,
      });
    }
    measure();
    window.addEventListener('resize', measure);
    window.visualViewport?.addEventListener('resize', measure);
    window.visualViewport?.addEventListener('scroll', measure);
    const interval = setInterval(measure, 500); // catches layout settling after tab switches/scrolling
    return () => {
      window.removeEventListener('resize', measure);
      window.visualViewport?.removeEventListener('resize', measure);
      window.visualViewport?.removeEventListener('scroll', measure);
      clearInterval(interval);
    };
  }, [shellRef]);

  if (!info) return null;

  const gap = info.screenH != null && info.shellBottom != null ? Math.max(0, info.screenH - info.shellBottom) : 0;

  return (
    <>
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 99999,
          background: '#000',
          color: '#0f0',
          fontFamily: 'monospace',
          fontSize: '11px',
          lineHeight: 1.4,
          padding: '4px 6px',
          pointerEvents: 'none',
        }}
      >
        innerH:{info.innerH} vvH:{info.vvH} vvTop:{info.vvTop} docClientH:{info.docClientH}
        <br />
        shellTop:{info.shellTop} shellH:{info.shellH} shellBottom:{info.shellBottom}
        <br />
        standalone:{String(info.standalone)} dpr:{info.dpr} screenH:{info.screenH} gap:{gap}
      </div>
      <div
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          height: `${gap}px`,
          background: '#ff3b00',
          zIndex: 99998,
          pointerEvents: 'none',
        }}
      />
    </>
  );
}
