import { useMemo, useState } from 'react';
import LeagueSwitcher from './LeagueSwitcher.jsx';
import ClubBadge from './ClubBadge.jsx';
import { useClubs } from '../hooks/useClubs.js';
import { useFixtures } from '../hooks/useFixtures.js';

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: 'short' });
}
function formatTime(iso) {
  return new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

export default function FixturesTab({ theme, league, onSelectLeague }) {
  const { clubs } = useClubs(league);
  const { matchdays, loading } = useFixtures(league);
  const [nextMatchdayOnly, setNextMatchdayOnly] = useState(true);

  const clubsById = useMemo(() => new Map(clubs.map((c) => [c.id, c])), [clubs]);
  const visible = nextMatchdayOnly ? matchdays.slice(0, 1) : matchdays;

  return (
    <div style={{ padding: '14px 16px 90px' }}>
      <LeagueSwitcher league={league} onSelectLeague={onSelectLeague} theme={theme} />

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 2px',
          borderTop: `1px solid ${theme.border}`,
          borderBottom: `1px solid ${theme.border}`,
          marginBottom: '12px',
        }}
      >
        <span style={{ fontSize: '13px', color: theme.textMuted }}>Nur nächster Spieltag</span>
        <button
          onClick={() => setNextMatchdayOnly((v) => !v)}
          aria-label="Nur nächsten Spieltag anzeigen umschalten"
          style={{
            width: '40px',
            height: '22px',
            borderRadius: '999px',
            border: 'none',
            cursor: 'pointer',
            background: nextMatchdayOnly ? theme.accent : theme.border,
            position: 'relative',
          }}
        >
          <div
            style={{
              width: '16px',
              height: '16px',
              borderRadius: '50%',
              background: theme.surface,
              position: 'absolute',
              top: '3px',
              left: nextMatchdayOnly ? '21px' : '3px',
              transition: 'left 0.15s',
            }}
          />
        </button>
      </div>

      {loading && <p style={{ fontSize: '13px', color: theme.textMuted, textAlign: 'center', padding: '24px 0' }}>Lädt…</p>}
      {!loading && visible.length === 0 && (
        <p style={{ fontSize: '13px', color: theme.textMuted, textAlign: 'center', padding: '24px 0' }}>
          Keine anstehenden Spiele im Kalender.
        </p>
      )}

      {visible.map(({ matchday, games }) => {
        const byDate = games.reduce((acc, g) => {
          const key = formatDate(g.kickoff_at);
          (acc[key] = acc[key] || []).push(g);
          return acc;
        }, {});

        return (
          <div key={matchday} style={{ marginBottom: '18px' }}>
            <p style={{ fontSize: '13px', fontWeight: 700, margin: '0 0 8px' }}>{matchday}. Spieltag</p>
            {Object.entries(byDate).map(([date, dateGames]) => (
              <div key={date} style={{ marginBottom: '10px' }}>
                <p
                  style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    color: theme.textMuted,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    margin: '0 0 6px',
                  }}
                >
                  {date}
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {dateGames.map((f) => (
                    <div
                      key={f.id}
                      style={{
                        background: theme.surfaceRaised,
                        borderRadius: '12px',
                        padding: '10px 14px',
                        border: `1px solid ${theme.border}`,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                      }}
                    >
                      <span style={{ fontSize: '13px', fontWeight: 700, color: theme.accent, width: '40px', flex: '0 0 auto' }}>
                        {formatTime(f.kickoff_at)}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1 }}>
                        <ClubBadge club={clubsById.get(f.home_club_id)} size={20} />
                        <span style={{ fontSize: '13px' }}>{clubsById.get(f.home_club_id)?.name}</span>
                      </div>
                      <span style={{ fontSize: '11px', color: theme.textMuted }}>
                        {f.status === 'finished' ? `${f.home_score} : ${f.away_score}` : 'vs'}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, justifyContent: 'flex-end' }}>
                        <span style={{ fontSize: '13px' }}>{clubsById.get(f.away_club_id)?.name}</span>
                        <ClubBadge club={clubsById.get(f.away_club_id)} size={20} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
