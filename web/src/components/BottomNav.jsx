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

// theme.surface is a plain hex string -- needed as rgba() for the pill's
// translucency below, not just a flat opaque fill.
function hexToRgba(hex, alpha) {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Floating pill instead of a full-width bar flush with the screen edges --
// per explicit request, after the investigation into the strip of
// unreachable space at the very bottom of the screen (confirmed live: an
// iOS platform reservation outside what any web content can address,
// independent of this app's own CSS) concluded that strip isn't going
// away. Embracing it as outer margin instead of fighting it: the pill
// floats inset from the two side edges, with its own translucent,
// blurred background reading as "elevated" above whatever shows through
// beneath/around it, rather than looking like a bar that stops short of
// the edge by mistake.
//
// User-reported (side-by-side screenshot against an older build): the
// visible area below the nav grew noticeably once this shipped. Root
// cause was this file, not the platform reservation it was built to
// live with -- the old flush, edge-to-edge bar had no bottom margin of
// its own at all, so the (small, unavoidable) platform strip was all
// that ever showed beneath it. Adding a decorative bottom margin here
// on top of that stacked an avoidable gap onto an unavoidable one.
// Bottom inset is back to exactly env(safe-area-inset-bottom) -- no
// added padding -- so the pill again reaches as far down as the old bar
// did; only the sides and corners stay "floating". Since the 2026-09-11
// viewport-fit=cover experiment (see index.html's own comment),
// env(safe-area-inset-bottom) resolves to 0px here regardless -- left
// as-is rather than removed, since it costs nothing and reverting that
// experiment makes it load-bearing again immediately, no second change
// needed in this file either way.
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
        padding: '0 12px env(safe-area-inset-bottom)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-around',
          padding: '10px 4px',
          borderRadius: '22px',
          background: hexToRgba(theme.surface, 0.82),
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          border: `1px solid ${theme.border}`,
          boxShadow: theme.isDark ? '0 8px 24px rgba(0, 0, 0, 0.45)' : '0 8px 24px rgba(0, 0, 0, 0.12)',
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
    </div>
  );
}
