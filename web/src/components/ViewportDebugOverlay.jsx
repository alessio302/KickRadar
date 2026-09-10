import { useEffect, useState } from 'react';

// Temporary re-add of the diagnostic this project has used before (see
// App.jsx's own comment on the original investigation) to pin down the
// iOS-standalone bottom-safe-area gap -- removed once that investigation
// was done, brought back now for a SPECIFIC repro that was never captured
// with it: the Einstellungen tab, scrolled to the bottom, where the nav
// pill visibly overlaps content above it (not just the small known
// platform strip below it). Shows the same numbers as before (innerHeight/
// visualViewport/shell rect/standalone/dpr/screenHeight) plus a bottom bar
// sized to the shell-vs-screen gap, so it's directly visible whether the
// pill sits at that already-known boundary or noticeably higher than it.
//
// Remove this file and its one import/render in App.jsx once the
// Einstellungen-tab repro has been captured -- this is a diagnostic, not a
// feature.
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
