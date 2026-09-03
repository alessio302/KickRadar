import { useTopScorers } from '../hooks/useTopScorers.js';

// Wider than StandingsTable.jsx's own 26px -- that table's header labels
// are pre-abbreviated ("Sp", "TD", "Pkt"), short enough for a narrow
// numeric column. This one's headers are full words (German "Vorlagen",
// French "Passes décisives", ...) with no abbreviated translation key to
// fall back on, so the column itself needs to be wide enough for those,
// not just for the 1-2 digit numbers underneath -- confirmed live: at the
// old 30px width, "Vorlagen"/"Spiele" had nowhere to wrap and ran into
// each other instead.
const NUM_COL_WIDTH = '46px';

function NumCell({ children, theme, header }) {
  return (
    <div
      style={{
        width: NUM_COL_WIDTH,
        flexShrink: 0,
        textAlign: 'center',
        fontSize: header ? '11px' : '12.5px',
        fontWeight: header ? 600 : 500,
        lineHeight: header ? 1.15 : undefined,
        whiteSpace: header ? 'normal' : 'nowrap',
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
              <NumCell theme={theme} header>{t.topscorers?.goals ?? 'Tore'}</NumCell>
              <NumCell theme={theme} header>{t.topscorers?.assists ?? 'Assists'}</NumCell>
              <NumCell theme={theme} header>{t.topscorers?.matches ?? 'Spiele'}</NumCell>
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
