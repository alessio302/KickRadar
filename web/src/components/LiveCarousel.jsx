import ClubJersey from './ClubJersey.jsx';
import MatchScore from './MatchScore.jsx';
import { useLiveFixtures } from '../hooks/useLiveFixtures.js';

// Cross-league -- shows whatever is live right now regardless of which
// league is currently selected in FixturesTab, so someone browsing Ligue 1
// still sees a Bundesliga match in progress. Renders nothing at all (not
// an empty state) when nothing is live, rather than reserving space for a
// block that has nothing to show.
//
// Deliberately flat: no per-card league label (confirmed via feedback --
// the app already treats crests alone as identifying enough, see
// LeagueSwitcher's own dropped text labels) and no separate score-per-club
// row. Reuses ClubJersey/MatchScore, the exact same building blocks
// FixtureRow uses for the list below, rather than a carousel-only visual
// language -- home/away stacked in one column (a fixed-width card has no
// room for FixtureRow's single-line layout without truncating names down
// to a few characters) with one shared MatchScore badge alongside, which
// already carries the live minute + red dot.
//
// Clicking a card calls onSelectFixture with this fixture's own embedded
// homeClub/awayClub/leagueSlug -- FixturesTab opens the exact same
// FixtureDetailOverlay a list row does, just resolved against this
// fixture's own league instead of whichever league is currently active.
const CARD_WIDTH = 232;

export default function LiveCarousel({ theme, t, onSelectFixture }) {
  const { fixtures } = useLiveFixtures();
  if (fixtures.length === 0) return null;

  return (
    <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', padding: '2px 0 14px', WebkitOverflowScrolling: 'touch' }}>
      {fixtures.map((f) => (
        <button
          key={f.id}
          onClick={() => onSelectFixture(f)}
          style={{
            flex: '0 0 auto',
            width: `${CARD_WIDTH}px`,
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            background: theme.surfaceRaised,
            border: `1px solid ${theme.border}`,
            borderRadius: '14px',
            padding: '12px 14px',
            font: 'inherit',
            color: theme.text,
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '7px', flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '7px', minWidth: 0 }}>
              <ClubJersey club={f.homeClub} size={24} theme={theme} />
              <span style={{ fontSize: '14px', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {f.homeClub?.short_name || f.homeClub?.name}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '7px', minWidth: 0 }}>
              <ClubJersey club={f.awayClub} size={24} theme={theme} />
              <span style={{ fontSize: '14px', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {f.awayClub?.short_name || f.awayClub?.name}
              </span>
            </div>
          </div>
          <MatchScore fixture={f} t={t} theme={theme} style={{ fontSize: '13px', flex: '0 0 auto' }} />
        </button>
      ))}
    </div>
  );
}
