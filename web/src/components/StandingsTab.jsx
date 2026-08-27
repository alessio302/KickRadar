import { useMemo } from 'react';
import LeagueSwitcher from './LeagueSwitcher.jsx';
import ClubJersey from './ClubJersey.jsx';
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

export default function StandingsTab({ theme, t, league, onSelectLeague }) {
  const { clubs } = useClubs(league);
  const { table, loading } = useStandings(league);
  const clubsById = useMemo(() => new Map(clubs.map((c) => [c.id, c])), [clubs]);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flexShrink: 0, padding: '14px 16px 0' }}>
        <LeagueSwitcher league={league} onSelectLeague={onSelectLeague} theme={theme} />
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '4px 16px 14px' }}>
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
                  <div
                    key={row.club_id}
                    style={{ display: 'flex', alignItems: 'center', padding: '9px 0', borderBottom: `1px solid ${theme.border}` }}
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
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
