import { useMemo, useState } from 'react';
import LeagueSwitcher from './LeagueSwitcher.jsx';
import LeagueCarousel from './LeagueCarousel.jsx';
import ClubJersey from './ClubJersey.jsx';
import ClubDetailOverlay from './ClubDetailOverlay.jsx';
import { useClubs } from '../hooks/useClubs.js';
import { useStandings } from '../hooks/useStandings.js';

// Fixed pixel widths (not flex) for every numeric column -- keeps every
// row's numbers lined up in a column regardless of how many digits a
// given team's count happens to have, and font-variant-numeric below
// keeps digit widths themselves consistent within a column too.
const NUM_COL_WIDTH = '26px';

function NumCell({ children, bold, theme }) {
  return (
    <div
      style={{
        width: NUM_COL_WIDTH,
        flexShrink: 0,
        textAlign: 'center',
        fontSize: '12.5px',
        fontWeight: bold ? 700 : 500,
        fontVariantNumeric: 'tabular-nums',
        color: bold ? theme.text : theme.textMuted,
      }}
    >
      {children}
    </div>
  );
}

// The table itself, for one league -- rendered twice by LeagueCarousel
// while a swipe is in progress (the active league and whichever neighbor
// is being dragged into view), each instance fetching its own data.
function StandingsTable({ theme, t, league, onSelectClub }) {
  const { clubs } = useClubs(league);
  const { table, loading } = useStandings(league);
  const clubsById = useMemo(() => new Map(clubs.map((c) => [c.id, c])), [clubs]);

  return (
    <div style={{ height: '100%', overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '4px 16px 14px' }}>
      {loading && <p style={{ fontSize: '13px', color: theme.textMuted, textAlign: 'center', padding: '24px 0' }}>{t.common.loading}</p>}
      {!loading && table.length === 0 && (
        <p style={{ fontSize: '13px', color: theme.textMuted, textAlign: 'center', padding: '24px 0' }}>{t.standings.empty}</p>
      )}

      {table.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: '360px' }}>
            <div style={{ display: 'flex', alignItems: 'center', padding: '0 0 8px', borderBottom: `1px solid ${theme.border}` }}>
              <div style={{ width: '20px', flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }} />
              <NumCell theme={theme}>{t.standings.played}</NumCell>
              <NumCell theme={theme}>{t.standings.won}</NumCell>
              <NumCell theme={theme}>{t.standings.draw}</NumCell>
              <NumCell theme={theme}>{t.standings.lost}</NumCell>
              <NumCell theme={theme}>{t.standings.goalDiff}</NumCell>
              <NumCell theme={theme}>{t.standings.points}</NumCell>
            </div>

            {table.map((row) => {
              const club = clubsById.get(row.club_id);
              return (
                <button
                  key={row.club_id}
                  onClick={() => club && onSelectClub?.(club)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    width: '100%',
                    padding: '9px 0',
                    border: 'none',
                    borderBottom: `1px solid ${theme.border}`,
                    background: 'none',
                    font: 'inherit',
                    color: 'inherit',
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ width: '20px', flexShrink: 0, fontSize: '12px', color: theme.textMuted, fontVariantNumeric: 'tabular-nums' }}>
                    {row.position}
                  </div>
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <ClubJersey club={club} size={18} theme={theme} />
                    <span style={{ fontSize: '13px', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {club?.short_name || club?.name || '–'}
                    </span>
                  </div>
                  <NumCell theme={theme}>{row.played}</NumCell>
                  <NumCell theme={theme}>{row.won}</NumCell>
                  <NumCell theme={theme}>{row.draw}</NumCell>
                  <NumCell theme={theme}>{row.lost}</NumCell>
                  <NumCell theme={theme}>{row.goal_difference > 0 ? `+${row.goal_difference}` : row.goal_difference}</NumCell>
                  <NumCell theme={theme} bold>{row.points}</NumCell>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function StandingsTab({ theme, t, language, league, onSelectLeague, onSwipeLeague }) {
  const [selectedClub, setSelectedClub] = useState(null);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flexShrink: 0, padding: '14px 16px 0' }}>
        <LeagueSwitcher league={league} onSelectLeague={onSelectLeague} theme={theme} />
      </div>

      <LeagueCarousel
        league={league}
        onSwitchLeague={onSwipeLeague}
        renderPage={(slug) => (
          <StandingsTable key={slug} theme={theme} t={t} league={slug} onSelectClub={slug === league ? setSelectedClub : undefined} />
        )}
      />

      {selectedClub && (
        <ClubDetailOverlay
          theme={theme}
          t={t}
          language={language}
          league={league}
          club={selectedClub}
          onClose={() => setSelectedClub(null)}
        />
      )}
    </div>
  );
}
