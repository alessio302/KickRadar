import { useEffect, useMemo, useState } from 'react';
import LeagueSwitcher from './LeagueSwitcher.jsx';
import ClubJersey from './ClubJersey.jsx';
import MatchScore from './MatchScore.jsx';
import FixtureDetailOverlay from './FixtureDetailOverlay.jsx';
import { useClubs } from '../hooks/useClubs.js';
import { useFixtures } from '../hooks/useFixtures.js';
import { DATE_LOCALES } from '../i18n/languages.js';

function formatDate(iso, locale) {
  return new Date(iso).toLocaleDateString(locale, { weekday: 'short', day: '2-digit', month: 'short' });
}
function formatTime(iso, locale) {
  return new Date(iso).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
}

// The "current" matchday is the round containing the next upcoming/live
// game -- not just "the lowest matchday number in the data" (that gets
// stuck on an already-finished round once no future game of it remains)
// and not just "the next fixture's round" alone (that would exclude
// already-played games earlier in the same round, which should still show
// with their result). Falls back to the most recent round if every synced
// fixture is already in the past (e.g. right after a round finished and
// the next one hasn't synced in yet).
function pickCurrentMatchday(matchdays) {
  if (matchdays.length === 0) return null;
  const now = Date.now();
  for (const group of matchdays) {
    // A game already live counts as "current" even though its own
    // kickoff_at is now in the past -- otherwise a round where every game
    // has kicked off, but the last one is still being played, would get
    // skipped in favor of a future round while a match is visibly live.
    if (group.games.some((g) => g.status === 'live' || new Date(g.kickoff_at).getTime() >= now)) {
      return group;
    }
  }
  return matchdays[matchdays.length - 1];
}

export default function FixturesTab({ theme, t, language, league, onSelectLeague, initialFixtureId, onConsumedInitialFixture }) {
  const { clubs } = useClubs(league);
  const { matchdays, loading } = useFixtures(league);
  const [currentMatchdayOnly, setCurrentMatchdayOnly] = useState(true);
  const [selectedFixture, setSelectedFixture] = useState(null);
  const locale = DATE_LOCALES[language];

  const clubsById = useMemo(() => new Map(clubs.map((c) => [c.id, c])), [clubs]);
  const currentMatchday = useMemo(() => pickCurrentMatchday(matchdays), [matchdays]);
  const visible = currentMatchdayOnly ? (currentMatchday ? [currentMatchday] : []) : matchdays;

  // Opens the fixture a lineup push notification pointed at, once its
  // matchday has actually loaded -- initialFixtureId arrives from App.jsx
  // synchronously on mount, well before this league's fixtures have
  // finished fetching. Searches all loaded matchdays, not just the
  // "current matchday only" filtered view above, since a confirmed lineup
  // can land on a fixture that toggle would otherwise hide. Reported once
  // via onConsumedInitialFixture so a later matchdays refetch (e.g. after
  // the user closes the overlay) doesn't reopen it.
  useEffect(() => {
    if (initialFixtureId == null) return;
    const found = matchdays.flatMap((m) => m.games).find((f) => f.id === initialFixtureId);
    if (found) {
      setSelectedFixture(found);
      onConsumedInitialFixture();
    }
  }, [initialFixtureId, matchdays, onConsumedInitialFixture]);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flexShrink: 0, padding: '14px 16px 0' }}>
        <LeagueSwitcher league={league} onSelectLeague={onSelectLeague} theme={theme} />

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 2px',
            borderTop: `1px solid ${theme.border}`,
            borderBottom: `1px solid ${theme.border}`,
          }}
        >
          <span style={{ fontSize: '13px', color: theme.textMuted }}>{t.fixtures.currentMatchdayOnly}</span>
          <button
            onClick={() => setCurrentMatchdayOnly((v) => !v)}
            aria-label={t.fixtures.currentMatchdayOnlyToggle}
            style={{
              width: '40px',
              height: '22px',
              borderRadius: '999px',
              border: 'none',
              cursor: 'pointer',
              background: currentMatchdayOnly ? theme.accent : theme.border,
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
                left: currentMatchdayOnly ? '21px' : '3px',
                transition: 'left 0.15s',
              }}
            />
          </button>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '12px 16px 14px' }}>
      {loading && <p style={{ fontSize: '13px', color: theme.textMuted, textAlign: 'center', padding: '24px 0' }}>{t.common.loading}</p>}
      {!loading && visible.length === 0 && (
        <p style={{ fontSize: '13px', color: theme.textMuted, textAlign: 'center', padding: '24px 0' }}>
          {t.fixtures.empty}
        </p>
      )}

      {visible.map(({ matchday, games }) => {
        const byDate = games.reduce((acc, g) => {
          const key = formatDate(g.kickoff_at, locale);
          (acc[key] = acc[key] || []).push(g);
          return acc;
        }, {});

        return (
          <div key={matchday} style={{ marginBottom: '18px' }}>
            <p style={{ fontSize: '13px', fontWeight: 700, margin: '0 0 8px' }}>{t.fixtures.matchday(matchday)}</p>
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
                      onClick={() => setSelectedFixture(f)}
                      style={{
                        background: theme.surfaceRaised,
                        borderRadius: '12px',
                        padding: '10px 14px',
                        border: `1px solid ${theme.border}`,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        cursor: 'pointer',
                      }}
                    >
                      <span style={{ fontSize: '13px', fontWeight: 700, color: theme.accent, width: '40px', flex: '0 0 auto' }}>
                        {formatTime(f.kickoff_at, locale)}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1 }}>
                        <ClubJersey club={clubsById.get(f.home_club_id)} size={20} theme={theme} />
                        <span style={{ fontSize: '13px' }}>{clubsById.get(f.home_club_id)?.name}</span>
                      </div>
                      <MatchScore fixture={f} t={t} theme={theme} style={{ fontSize: '11px', color: theme.textMuted }} />
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, justifyContent: 'flex-end' }}>
                        <span style={{ fontSize: '13px' }}>{clubsById.get(f.away_club_id)?.name}</span>
                        <ClubJersey club={clubsById.get(f.away_club_id)} size={20} theme={theme} />
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

      {selectedFixture && (
        <FixtureDetailOverlay
          theme={theme}
          t={t}
          language={language}
          fixture={selectedFixture}
          homeClub={clubsById.get(selectedFixture.home_club_id)}
          awayClub={clubsById.get(selectedFixture.away_club_id)}
          onClose={() => setSelectedFixture(null)}
        />
      )}
    </div>
  );
}
