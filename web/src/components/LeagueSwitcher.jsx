import { useEffect, useRef } from 'react';
import { LEAGUES } from '../lib/leagues.js';

// Horizontal-scrolling pill row, not a shrink-to-fit flex row: five leagues
// with full names ("Premier League", "1. Bundesliga") already didn't fit
// evenly, and every additional league would only have made each one
// narrower still (see LEAGUE_SLUGS growing to 5, more planned). Scrolling
// instead of shrinking means new leagues just extend the row -- the header
// never gets more cramped, and full names read at a glance instead of
// needing "BL"/"PL"-style abbreviations decoded first. Bleeds to the
// screen edges via negative margin matching the parent's 16px padding
// (see TransfersTab.jsx/FixturesTab.jsx) so the row scrolls edge-to-edge
// like a native tab bar, not just within the inset content column.
export default function LeagueSwitcher({ league, onSelectLeague, theme }) {
  const activePillRef = useRef(null);

  // Switching league by swiping the content (see useLeagueCarousel.js) can
  // land on a league whose pill is scrolled out of view in this row --
  // confirmed live: swiping to Ligue 1/LaLiga left their pills off-screen
  // with nothing showing which league was now active. Tapping a pill
  // already keeps it in view (it's already visible, that's how it got
  // tapped), so this only ever needs to actually scroll after a swipe.
  useEffect(() => {
    activePillRef.current?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [league]);

  return (
    <div
      className="league-scroll-row"
      style={{
        display: 'flex',
        gap: '8px',
        overflowX: 'auto',
        scrollbarWidth: 'none',
        WebkitOverflowScrolling: 'touch',
        margin: '0 -16px',
        padding: '0 16px 12px',
      }}
    >
      {LEAGUES.map((l) => (
        <button
          key={l.slug}
          ref={league === l.slug ? activePillRef : undefined}
          onClick={() => onSelectLeague(l.slug)}
          style={{
            flex: '0 0 auto',
            display: 'flex',
            alignItems: 'center',
            gap: '7px',
            padding: '9px 14px',
            borderRadius: '999px',
            fontSize: '13.5px',
            fontWeight: league === l.slug ? 700 : 600,
            whiteSpace: 'nowrap',
            border: `1px solid ${league === l.slug ? theme.accent : theme.border}`,
            cursor: 'pointer',
            background: league === l.slug ? `${theme.accent}1a` : theme.surface,
            color: league === l.slug ? theme.accent : theme.textMuted,
          }}
        >
          <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: l.color, flex: '0 0 auto' }} />
          {l.label}
        </button>
      ))}
    </div>
  );
}
