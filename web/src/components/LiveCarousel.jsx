import ClubJersey from './ClubJersey.jsx';
import { useLiveFixtures } from '../hooks/useLiveFixtures.js';

// Cross-league -- shows whatever is live right now regardless of which
// league is currently selected in FixturesTab, so someone browsing Ligue 1
// still sees a Bundesliga match in progress. Renders nothing at all (not
// an empty state) when nothing is live, rather than reserving space for a
// block that has nothing to show.
//
// Deliberately flat: no per-card league label (confirmed via feedback --
// the app already treats crests alone as identifying enough, see
// LeagueSwitcher's own dropped text labels). Each club keeps its OWN score
// number, top row for home and bottom row for away (reverted here after
// feedback -- a first version merged both into one shared MatchScore
// badge instead, which read as harder to match a number back to its own
// team than the original two-number layout). Live status is its own third
// line -- can't reuse MatchScore.jsx here since that component always
// bundles the dot/LIVE label with a single combined score, not separable
// from a per-club score layout.
//
// Clicking a card calls onSelectFixture with this fixture's own embedded
// homeClub/awayClub/leagueSlug -- FixturesTab opens the exact same
// FixtureDetailOverlay a list row does, just resolved against this
// fixture's own league instead of whichever league is currently active.
const CARD_WIDTH = 220;

function ClubRow({ theme, club, score }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '7px', minWidth: 0 }}>
      <ClubJersey club={club} size={24} theme={theme} />
      <span style={{ flex: 1, minWidth: 0, fontSize: '14px', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {club?.short_name || club?.name}
      </span>
      <span style={{ fontSize: '14px', fontWeight: 800, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{score}</span>
    </div>
  );
}

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
            flexDirection: 'column',
            gap: '7px',
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
          <ClubRow theme={theme} club={f.homeClub} score={f.home_score} />
          <ClubRow theme={theme} club={f.awayClub} score={f.away_score} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span aria-hidden="true" style={{ width: '5px', height: '5px', borderRadius: '50%', background: theme.danger, flexShrink: 0 }} />
            <span style={{ fontSize: '10.5px', fontWeight: 800, letterSpacing: '0.03em', color: theme.danger }}>
              {f.live_minute === 'HT' ? f.live_minute : f.live_minute ? `${f.live_minute}'` : t.fixtures.live}
            </span>
          </div>
        </button>
      ))}
    </div>
  );
}
