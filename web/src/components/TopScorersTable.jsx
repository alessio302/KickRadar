import { useTopScorers } from '../hooks/useTopScorers.js';

// Same fixed width and single text style for header and data cells alike
// as StandingsTable.jsx's own NumCell -- that table abbreviates every
// header down to something short enough to share a column with its data
// ("Sp", "TD", "Pkt"), so this one does too (goals/assists headers below
// are now abbreviated the same way) rather than giving headers their own
// wider column or smaller font.
const NUM_COL_WIDTH = '26px';

function NumCell({ children, theme }) {
  return (
    <div
      style={{
        width: NUM_COL_WIDTH,
        flexShrink: 0,
        textAlign: 'center',
        fontSize: '12.5px',
        fontWeight: 500,
        fontVariantNumeric: 'tabular-nums',
        color: theme.textMuted,
      }}
    >
      {children}
    </div>
  );
}

export function TopScorersTable({ theme, t, league }) {
  const { scorers, loading } = useTopScorers(league);

  return (
    <div style={{ height: '100%', overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '4px 16px 14px' }}>
      {loading && (
        <p style={{ fontSize: '13px', color: theme.textMuted, textAlign: 'center', padding: '24px 0' }}>
          {t.common.loading}
        </p>
      )}

      {!loading && scorers.length === 0 && (
        <p style={{ fontSize: '13px', color: theme.textMuted, textAlign: 'center', padding: '24px 0' }}>
          {t.topscorers?.empty ?? 'Keine Daten verfügbar'}
        </p>
      )}

      {scorers.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: '300px' }}>
            <div style={{ display: 'flex', alignItems: 'center', padding: '0 0 8px', borderBottom: `1px solid ${theme.border}` }}>
              <div style={{ width: '20px', flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }} />
              <NumCell theme={theme}>{t.topscorers?.goals ?? 'Tore'}</NumCell>
              <NumCell theme={theme}>{t.topscorers?.assists ?? 'Vorl'}</NumCell>
              {/* Reuses standings' own "matches played" abbreviation
                  (e.g. German "Sp") rather than a second translation key --
                  same stat, same label, one source of truth. */}
              <NumCell theme={theme}>{t.standings.played}</NumCell>
            </div>

            {scorers.map((row) => (
              <div
                key={`${row.rank}-${row.player_name}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  width: '100%',
                  padding: '9px 0',
                  borderBottom: `1px solid ${theme.border}`,
                }}
              >
                <div
                  style={{
                    width: '20px',
                    flexShrink: 0,
                    fontSize: '12px',
                    color: theme.textMuted,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {row.rank}
                </div>
                <div
                  style={{
                    flex: 1,
                    minWidth: 0,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  {row.club_badge && (
                    <img
                      src={row.club_badge}
                      alt=""
                      style={{
                        width: '18px',
                        height: '18px',
                        flexShrink: 0,
                        borderRadius: '2px',
                      }}
                    />
                  )}
                  <div style={{ overflow: 'hidden' }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {row.player_name}
                    </div>
                    <div style={{ fontSize: '11px', color: theme.textMuted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {row.club_name}
                    </div>
                  </div>
                </div>
                <NumCell theme={theme}>{row.goals}</NumCell>
                <NumCell theme={theme}>{row.assists}</NumCell>
                <NumCell theme={theme}>{row.matches_played}</NumCell>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
