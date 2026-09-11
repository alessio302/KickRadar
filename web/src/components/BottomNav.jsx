import { ArrowLeftRight, Calendar, Globe, ListOrdered, Settings } from 'lucide-react';

// No separate "Aufstellungen" tab -- lineups live in a per-fixture overlay
// opened from the Spiele tab instead (tap a match card), see
// FixtureDetailOverlay.jsx. Tab ids stay the fixed internal keys they
// always were (App.jsx branches on them, notifications deep-link via
// them) -- only the displayed label is translated.
const TABS = [
  ['transfers', (t) => t.nav.transfers, ArrowLeftRight],
  ['spiele', (t) => t.nav.fixtures, Calendar],
  ['tabelle', (t) => t.nav.standings, ListOrdered],
  ['europa', (t) => t.nav.europa, Globe],
  ['einstellungen', (t) => t.nav.settings, Settings],
];

// theme.surface is a plain hex string -- needed as rgba() for the bar's
// own translucency below, not just a flat opaque fill.
function hexToRgba(hex, alpha) {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Back to a flush, edge-to-edge bar (2026-09-11), reverting an earlier
// floating-pill redesign (see git history) that inset the bar from the
// two side edges with its own rounded corners and translucent "elevated"
// card look. That shape was built specifically to live with the
// unreachable strip at the very bottom of an iOS standalone PWA's screen
// (confirmed live: a platform reservation outside what any web content
// can address, independent of this app's own CSS -- see index.html's own
// comment on the viewport-fit=cover investigation this session ran
// through) -- but it's the same strip either way, this shape just
// doesn't rely on env(safe-area-inset-bottom) padding to keep its own
// rounded corners from rendering flush against it, since a plain
// rectangular bar has no corner curve to clip into in the first place.
// No env(safe-area-inset-bottom) call needed here anymore for that
// reason -- index.html doesn't set viewport-fit=cover as of this
// revision, so that value would resolve to 0px regardless.
//
// Deliberately NOT position: fixed -- this file's own git history already
// tried that for a floating bar and reverted it: it intermittently
// disappeared mid-scroll on iOS Safari (the address-bar show/hide resize
// dance fighting a fixed-positioned element). Staying a normal flex child
// (App.jsx's flex column, last item) sidesteps that failure mode entirely
// -- it's already proven stable there through everything else this
// session tested.
export default function BottomNav({ tab, onSelectTab, theme, t }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-around',
        // Taller than the pill version's own 10px/10px -- user-reported
        // (live, post flush-bar switch) the bar read as "squeezed" against
        // the bottom edge now that there's no safe-area padding or margin
        // giving it room to breathe. More padding top AND bottom, not just
        // bottom -- a taller bar overall reads as an intentional design,
        // not just extra dead space stacked under the icons.
        padding: '16px 4px 20px',
        background: hexToRgba(theme.surface, 0.92),
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderTop: `1px solid ${theme.border}`,
      }}
    >
      {TABS.map(([id, getLabel, Icon]) => (
        <button
          key={id}
          onClick={() => onSelectTab(id)}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '3px',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: tab === id ? theme.accent : theme.textMuted,
          }}
        >
          <Icon size={20} />
          <span style={{ fontSize: '10px', fontWeight: 600 }}>{getLabel(t)}</span>
        </button>
      ))}
    </div>
  );
}
