import { useMemo, useState } from 'react';
import LeagueSwitcher from './LeagueSwitcher.jsx';
import LeagueCarousel from './LeagueCarousel.jsx';
import ClubJersey from './ClubJersey.jsx';
import ClubDetailOverlay from './ClubDetailOverlay.jsx';
import { TopScorersTable } from './TopScorersTable.jsx';
import { useClubs } from '../hooks/useClubs.js';
import { useStandings } from '../hooks/useStandings.js';
import { leagueBySlug, zoneForPosition } from '../lib/leagues.js';

// Fixed, not theme-driven -- these identify a *competition* zone (Champions
// League/Europa league/relegation), the same way FixtureRow.jsx's favorite
// star stays a fixed gold regardless of theme or the user's chosen accent
// colour. Tying them to theme.accent would make "you're in the Champions
// League zone" mean something different depending on which accent colour
// the user happens to have picked, and could collide with the accent
// itself when a user's chosen accent is also blue-ish.
const ZONE_COLOR = {
  cl: '#3D8BFD',
  europe: '#F5A623',
  relegationPlayoff: '#FF8A3D',
  relegation: '#E5484D',
};

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

// Only lists the zones this particular league actually has -- e.g. the
// relegation play-off swatch only appears for Bundesliga/Ligue 1 (see
// LEAGUES' relegationZones in lib/leagues.js), not the three leagues that
// relegate 3 teams outright with no play-off.
function ZoneLegend({ theme, t, league }) {
  const cfg = leagueBySlug(league);
  if (!cfg) return null;
  const items = [
    ['cl', t.standings.zoneChampionsLeague],
    ['europe', t.standings.zoneEurope],
    ...(cfg.relegationZones.playoff ? [['relegationPlayoff', t.standings.zoneRelegationPlayoff]] : []),
    ['relegation', t.standings.zoneRelegation],
  ];
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', padding: '12px 2px 2px' }}>
      {items.map(([zone, label]) => (
        <div key={zone} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '2px', flexShrink: 0, background: ZONE_COLOR[zone] }} />
          <span style={{ fontSize: '10.5px', color: theme.textMuted }}>{label}</span>
        </div>
      ))}
    </div>
  );
}

// The table itself, for one league -- rendered twice by LeagueCarousel
// while a swipe is in progress (the active league and whichever neighbor
// is being dragged into view), each instance fetching its own data.
// Exported so FixtureDetailOverlay.jsx's own "Tabelle" tab can reuse the
// exact same component (per explicit request: 1:1 identical to this
// tab), rather than a second copy of the same markup.
export function StandingsTable({ theme, t, league, onSelectClub }) {
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
              <div style={{ width: '3px', flexShrink: 0, marginRight: '7px' }} />
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
              const zone = zoneForPosition(league, row.position);
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
                  <span
                    aria-hidden="true"
                    style={{ width: '3px', height: '18px', flexShrink: 0, borderRadius: '2px', marginRight: '7px', background: zone ? ZONE_COLOR[zone] : 'transparent' }}
                  />
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
      {table.length > 0 && <ZoneLegend theme={theme} t={t} league={league} />}
    </div>
  );
}

export default function StandingsTab({ theme, t, language, league, onSelectLeague, onSwipeLeague }) {
  const [selectedClub, setSelectedClub] = useState(null);
  const [subTab, setSubTab] = useState('table');

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flexShrink: 0, padding: '14px 16px 0' }}>
        <LeagueSwitcher league={league} onSelectLeague={onSelectLeague} theme={theme} />
      </div>

      <div style={{ flexShrink: 0, display: 'flex', gap: '12px', padding: '12px 16px', borderBottom: `1px solid ${theme.border}` }}>
        <button
          onClick={() => setSubTab('table')}
          style={{
            padding: '6px 12px',
            border: 'none',
            borderRadius: '6px',
            background: subTab === 'table' ? theme.accent : theme.surfaceRaised,
            color: subTab === 'table' ? theme.surface : theme.text,
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 200ms',
          }}
        >
          {t.standings?.title ?? 'Tabelle'}
        </button>
        <button
          onClick={() => setSubTab('scorers')}
          style={{
            padding: '6px 12px',
            border: 'none',
            borderRadius: '6px',
            background: subTab === 'scorers' ? theme.accent : theme.surfaceRaised,
            color: subTab === 'scorers' ? theme.surface : theme.text,
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 200ms',
          }}
        >
          {t.topscorers?.title ?? 'Torschützen'}
        </button>
      </div>

      <LeagueCarousel
        league={league}
        onSwitchLeague={onSwipeLeague}
        renderPage={(slug) =>
          subTab === 'table' ? (
            <StandingsTable key={`${slug}-table`} theme={theme} t={t} league={slug} onSelectClub={slug === league ? setSelectedClub : undefined} />
          ) : (
            <TopScorersTable key={`${slug}-scorers`} theme={theme} t={t} language={language} league={slug} />
          )
        }
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
