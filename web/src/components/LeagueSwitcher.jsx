import { LEAGUES } from '../lib/leagues.js';

// Fixed 5-column grid, not a scrolling row -- per explicit feedback, all
// five leagues need to sit fully in view with equal left/right margins
// instead of overflowing the screen edge (the previous horizontal-scroll
// version left the last badge/label cut off, which read as "everything is
// shifted right"). grid-template-columns is LEAGUES.length-driven rather
// than hardcoded to 5, but this is still a fixed layout tuned to fit
// exactly today's five leagues on one row -- a 6th league would need this
// reconsidered (narrower badges, or back to a scrolling row), not silently
// keep shrinking forever.
const BADGE_SIZE = 48;

// Contain, not cover: GOAL API's league logo assets are NOT all the same
// aspect ratio -- Bundesliga's and LaLiga's carry a wide wordmark alongside
// the crest, unlike Serie A/Premier League/Ligue 1's more square marks.
// object-fit: cover (tried first, per a FlashScore-style reference) forced
// every logo into a square crop and sliced text off those two -- confirmed
// live ("UNDESLIGA" missing its "B", LaLiga's "Santander" cut off).
// contain guarantees the whole logo is always visible, at the cost of a
// little letterboxing against the badge's own background on non-square
// logos -- a visible whole logo beats a cropped one.
export default function LeagueSwitcher({ league, onSelectLeague, theme }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${LEAGUES.length}, 1fr)`,
        gap: '6px',
        padding: '2px 0 12px',
      }}
    >
      {LEAGUES.map((l) => {
        const active = league === l.slug;
        return (
          <button
            key={l.slug}
            onClick={() => onSelectLeague(l.slug)}
            title={l.label}
            style={{
              minWidth: 0,
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
                borderRadius: '14px',
                background: theme.surface,
                border: `2px solid ${active ? theme.accent : theme.border}`,
                boxSizing: 'border-box',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <img src={l.logo} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            </span>
            <span
              style={{
                fontSize: '11px',
                fontWeight: active ? 700 : 600,
                color: active ? theme.accent : theme.textMuted,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: '100%',
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
