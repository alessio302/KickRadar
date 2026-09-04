import { useEffect, useMemo, useState } from 'react';
import LeagueSwitcher from './LeagueSwitcher.jsx';
import LeagueCarousel from './LeagueCarousel.jsx';
import LiveCarousel from './LiveCarousel.jsx';
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
  liveOnly,
  favoriteIds,
  onToggleFavorite,
  onSelectFixture,
  initialFixtureId,
  initialView,
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
  const matchdayFiltered = currentMatchdayOnly ? (currentMatchday ? [currentMatchday] : []) : matchdays;
  // Additive to the matchday filter above, not a replacement -- the "Live"
  // button narrows whatever matchdayFiltered already decided down to just
  // the games currently in progress, same additive relationship as two
  // independent filters anywhere else in the app.
  const visible = liveOnly
    ? matchdayFiltered.map((g) => ({ ...g, games: g.games.filter((f) => f.status === 'live') })).filter((g) => g.games.length > 0)
    : matchdayFiltered;

  // Opens the fixture a lineup or highlights push notification pointed at,
  // once its matchday has actually loaded -- initialFixtureId arrives from
  // App.jsx synchronously on mount, well before this league's fixtures have
  // finished fetching. Searches all loaded matchdays, not just the
  // "current matchday only" filtered view above, since a confirmed lineup
  // can land on a fixture that toggle would otherwise hide. Reported once
  // via onConsumedInitialFixture so a later matchdays refetch (e.g. after
  // the user closes the overlay) doesn't reopen it.
  //
  // initialView is forwarded through onSelectFixture's second argument
  // rather than read again later from a prop -- onConsumedInitialFixture
  // clears both initialFixtureId and initialView in App.jsx in the same
  // batch as this effect's own onSelectFixture call, so by the time
  // FixtureDetailOverlay actually mounts the initialView prop passed into
  // this component would already be back to null. Capturing it here, in the
  // same closure that still sees the pre-clear value, avoids that race.
  useEffect(() => {
    if (initialFixtureId == null || !onSelectFixture) return;
    const found = matchdays.flatMap((m) => m.games).find((f) => f.id === initialFixtureId);
    if (found) {
      onSelectFixture(found, initialView);
      onConsumedInitialFixture();
    }
  }, [initialFixtureId, initialView, matchdays, onSelectFixture, onConsumedInitialFixture]);

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

export default function FixturesTab({ theme, t, language, league, onSelectLeague, onSwipeLeague, initialFixtureId, initialView, onConsumedInitialFixture, onFavoriteToast }) {
  const { clubs } = useClubs(league);
  const { favoriteIds, toggleFavorite } = useFavoriteFixtures(language);
  const [currentMatchdayOnly, setCurrentMatchdayOnly] = useState(true);
  const [liveOnly, setLiveOnly] = useState(false);
  // Single object rather than separate fixture/view/league/club states --
  // a fixture opened from the live carousel (see LiveCarousel.jsx) can
  // belong to a DIFFERENT league than the one currently selected here, so
  // the overlay's own league/homeClub/awayClub props have to travel
  // together with the fixture that was actually tapped, not fall back to
  // whichever league this tab happens to be showing. A plain list-row tap
  // resolves them against this league's own clubsById below; a carousel
  // tap uses that fixture's own already-embedded homeClub/awayClub/
  // leagueSlug instead -- same overlay component either way, just
  // resolved against the right league so its own Tabelle/Statistik tabs
  // show that fixture's real league, not this tab's currently active one.
  const [selected, setSelected] = useState(null);
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

  const openFromList = (fixture, view) => {
    setSelected({
      fixture,
      view: view ?? null,
      league,
      homeClub: clubsById.get(fixture.home_club_id),
      awayClub: clubsById.get(fixture.away_club_id),
    });
  };

  const openFromCarousel = (fixture) => {
    setSelected({
      fixture,
      view: null,
      league: fixture.leagueSlug,
      homeClub: fixture.homeClub,
      awayClub: fixture.awayClub,
    });
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flexShrink: 0, padding: '14px 16px 0' }}>
        <LiveCarousel theme={theme} t={t} onSelectFixture={openFromCarousel} />

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

        <div style={{ padding: '10px 2px 4px' }}>
          <button
            onClick={() => setLiveOnly((v) => !v)}
            aria-label={t.fixtures.liveOnlyToggle}
            aria-pressed={liveOnly}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px 6px 10px',
              borderRadius: '999px',
              border: `1.5px solid ${liveOnly ? theme.accent : theme.border}`,
              background: liveOnly ? `${theme.accent}1a` : 'transparent',
              color: liveOnly ? theme.accent : theme.textMuted,
              font: 'inherit',
              fontSize: '12.5px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            <span aria-hidden="true" style={{ width: '6px', height: '6px', borderRadius: '50%', background: theme.danger, flexShrink: 0 }} />
            {t.fixtures.live}
          </button>
        </div>
      </div>

      <LeagueCarousel
        league={league}
        onSwitchLeague={onSwipeLeague}
        renderPage={(slug) => (
          <FixturesList
            key={slug}
            theme={theme}
            t={t}
            locale={locale}
            league={slug}
            currentMatchdayOnly={currentMatchdayOnly}
            liveOnly={liveOnly}
            favoriteIds={slug === league ? favoriteIds : undefined}
            onToggleFavorite={slug === league ? handleToggleFavorite : undefined}
            onSelectFixture={slug === league ? openFromList : undefined}
            initialFixtureId={slug === league ? initialFixtureId : null}
            initialView={slug === league ? initialView : null}
            onConsumedInitialFixture={slug === league ? onConsumedInitialFixture : undefined}
          />
        )}
      />

      {selected && (
        <FixtureDetailOverlay
          theme={theme}
          t={t}
          language={language}
          league={selected.league}
          fixture={selected.fixture}
          homeClub={selected.homeClub}
          awayClub={selected.awayClub}
          initialView={selected.view}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
