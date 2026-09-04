import { useEffect, useRef } from 'react';
import { LEAGUES } from '../lib/leagues.js';

// Horizontal-scrolling row of circular logo badges with the league name
// underneath (per the redesign exports), not a shrink-to-fit flex row:
// five leagues with full names ("Premier League", "1. Bundesliga") already
// didn't fit evenly, and every additional league would only have made each
// one narrower still (see LEAGUE_SLUGS growing to 5, more planned).
// Scrolling instead of shrinking means new leagues just extend the row --
// the header never gets more cramped. Bleeds to the screen edges via
// negative margin matching the parent's 16px padding (see
// TransfersTab.jsx/FixturesTab.jsx) so the row scrolls edge-to-edge like a
// native tab bar, not just within the inset content column.
const BADGE_SIZE = 52;

export default function LeagueSwitcher({ league, onSelectLeague, theme }) {
  const activePillRef = useRef(null);

  // Switching league by swiping the content (see useLeagueCarousel.js) can
  // land on a league whose badge is scrolled out of view in this row --
  // confirmed live: swiping to Ligue 1/LaLiga left their badges off-screen
  // with nothing showing which league was now active. Tapping a badge
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
        gap: '14px',
        overflowX: 'auto',
        scrollbarWidth: 'none',
        WebkitOverflowScrolling: 'touch',
        margin: '0 -16px',
        padding: '2px 16px 12px',
      }}
    >
      {LEAGUES.map((l) => {
        const active = league === l.slug;
        return (
          <button
            key={l.slug}
            ref={active ? activePillRef : undefined}
            onClick={() => onSelectLeague(l.slug)}
            title={l.label}
            style={{
              flex: '0 0 auto',
              width: '66px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '6px',
              background: 'none',
              border: 'none',
              padding: 0,
              font: 'inherit',
              cursor: 'pointer',
            }}
          >
            <span
              style={{
                width: `${BADGE_SIZE}px`,
                height: `${BADGE_SIZE}px`,
                borderRadius: '50%',
                background: theme.surface,
                border: `2px solid ${active ? theme.accent : theme.border}`,
                boxSizing: 'border-box',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <img src={l.logo} alt="" width={28} height={28} style={{ objectFit: 'contain' }} />
            </span>
            <span
              style={{
                fontSize: '11.5px',
                fontWeight: active ? 700 : 600,
                color: active ? theme.accent : theme.textMuted,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: '66px',
                textAlign: 'center',
              }}
            >
              {l.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
