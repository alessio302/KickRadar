import { useEffect, useMemo, useState } from 'react';
import LeagueSwitcher from './LeagueSwitcher.jsx';
import LeagueCarousel from './LeagueCarousel.jsx';
import FixtureRow from './FixtureRow.jsx';
import FixtureDetailOverlay from './FixtureDetailOverlay.jsx';
import PullToRefreshIndicator from './PullToRefreshIndicator.jsx';
import { useClubs } from '../hooks/useClubs.js';
import { useFixtures } from '../hooks/useFixtures.js';
import { usePullToRefresh } from '../hooks/usePullToRefresh.js';
import { useFavoriteFixtures } from '../hooks/useFavoriteFixtures.js';
import { NOTIFICATIONS_DENIED } from '../lib/ensurePushSubscription.js';
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

// The fixture list for one league -- rendered twice by LeagueCarousel
// while a swipe is in progress (the active league and whichever neighbor
// is being dragged into view). Favoriting, opening a fixture's detail
// overlay, and the push-notification deep link are only wired on the
// active instance (see LeagueCarousel.jsx's own comment for why the
// preview one stays non-interactive).
function FixturesList({
  theme,
  t,
  locale,
  league,
  currentMatchdayOnly,
  favoriteIds,
  onToggleFavorite,
  openFixtureId,
  onOpenRow,
  onCloseRow,
  onSelectFixture,
  initialFixtureId,
  onConsumedInitialFixture,
}) {
  // Own clubs fetch, scoped to this page's own league -- not the
  // FixturesTab-level one below (that one only ever matches the actually
  // active league, which would leave a neighbor preview's fixtures unable
  // to resolve their own clubs' names/crests while it's mid-slide-in).
  const { clubs } = useClubs(league);
  const clubsById = useMemo(() => new Map(clubs.map((c) => [c.id, c])), [clubs]);
  const { matchdays, loading, refreshing, refetch } = useFixtures(league);
  const { scrollRef, pullDistance, pulling } = usePullToRefresh(refetch);
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
    if (initialFixtureId == null || !onSelectFixture) return;
    const found = matchdays.flatMap((m) => m.games).find((f) => f.id === initialFixtureId);
    if (found) {
      onSelectFixture(found);
      onConsumedInitialFixture();
    }
  }, [initialFixtureId, matchdays, onSelectFixture, onConsumedInitialFixture]);

  return (
    <div
      ref={scrollRef}
      style={{
        height: '100%',
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
        overscrollBehaviorY: 'none',
        padding: '12px 16px 14px',
      }}
    >
      <PullToRefreshIndicator theme={theme} t={t} pullDistance={pullDistance} pulling={pulling} refreshing={refreshing} />
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
                    <FixtureRow
                      key={f.id}
                      theme={theme}
                      t={t}
                      locale={locale}
                      formatTime={formatTime}
                      clubsById={clubsById}
                      fixture={f}
                      isFavorite={favoriteIds?.has(f.id) ?? false}
                      isOpen={openFixtureId === f.id}
                      onOpenRow={() => onOpenRow?.(f.id)}
                      onCloseRow={() => onCloseRow?.()}
                      onSelectFixture={(fixture) => onSelectFixture?.(fixture)}
                      onToggleFavorite={(fixture) => onToggleFavorite?.(fixture)}
                    />
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

export default function FixturesTab({ theme, t, language, league, onSelectLeague, onSwipeLeague, initialFixtureId, onConsumedInitialFixture, onFavoriteToast }) {
  const { clubs } = useClubs(league);
  const { favoriteIds, toggleFavorite } = useFavoriteFixtures(language);
  const [currentMatchdayOnly, setCurrentMatchdayOnly] = useState(true);
  const [selectedFixture, setSelectedFixture] = useState(null);
  const [openFixtureId, setOpenFixtureId] = useState(null);
  const locale = DATE_LOCALES[language];

  const handleToggleFavorite = async (fixture) => {
    try {
      const result = await toggleFavorite(fixture.id);
      onFavoriteToast(result === 'added' ? t.fixtures.favoritedToast : t.fixtures.unfavoritedToast);
    } catch (err) {
      onFavoriteToast(err.message === NOTIFICATIONS_DENIED ? t.errors.notificationsDenied : err.message);
    }
  };

  const clubsById = useMemo(() => new Map(clubs.map((c) => [c.id, c])), [clubs]);

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

      <LeagueCarousel
        league={league}
        onSwitchLeague={onSwipeLeague}
        renderPage={(slug) => (
          <FixturesList
            theme={theme}
            t={t}
            locale={locale}
            league={slug}
            currentMatchdayOnly={currentMatchdayOnly}
            favoriteIds={slug === league ? favoriteIds : undefined}
            onToggleFavorite={slug === league ? handleToggleFavorite : undefined}
            openFixtureId={slug === league ? openFixtureId : null}
            onOpenRow={slug === league ? setOpenFixtureId : undefined}
            onCloseRow={slug === league ? () => setOpenFixtureId(null) : undefined}
            onSelectFixture={slug === league ? setSelectedFixture : undefined}
            initialFixtureId={slug === league ? initialFixtureId : null}
            onConsumedInitialFixture={slug === league ? onConsumedInitialFixture : undefined}
          />
        )}
      />

      {selectedFixture && (
        <FixtureDetailOverlay
          theme={theme}
          t={t}
          language={language}
          league={league}
          fixture={selectedFixture}
          homeClub={clubsById.get(selectedFixture.home_club_id)}
          awayClub={clubsById.get(selectedFixture.away_club_id)}
          onClose={() => setSelectedFixture(null)}
        />
      )}
    </div>
  );
}
