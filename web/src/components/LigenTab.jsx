import { useEffect, useMemo, useRef, useState } from 'react';
import LeagueSwitcher from './LeagueSwitcher.jsx';
import LeagueCarousel from './LeagueCarousel.jsx';
import FixtureRow from './FixtureRow.jsx';
import FixtureDetailOverlay from './FixtureDetailOverlay.jsx';
import PullToRefreshIndicator from './PullToRefreshIndicator.jsx';
import ClubDetailOverlay from './ClubDetailOverlay.jsx';
import { StandingsTable } from './StandingsTab.jsx';
import { TopScorersTable } from './TopScorersTable.jsx';
import { useClubs } from '../hooks/useClubs.js';
import { useFixtures } from '../hooks/useFixtures.js';
import { usePullToRefresh } from '../hooks/usePullToRefresh.js';
import { useFavoriteFixtures } from '../hooks/useFavoriteFixtures.js';
import { NOTIFICATIONS_DENIED } from '../lib/ensurePushSubscription.js';
import { DATE_LOCALES } from '../i18n/languages.js';

// Merges the former standalone "Spiele" (FixturesTab.jsx) and "Tabelle"
// (StandingsTab.jsx) nav items into one "Ligen" item with two internal
// sub-tabs -- the exact pattern EuropaTab.jsx already established for the
// 3 UEFA competitions (competition selector -> Spiele/Tabelle sub-tab bar
// -> swipeable LeagueCarousel), applied to the 5 domestic leagues so the
// same shape exists at both levels of the app instead of only one. The
// former standalone Tabelle tab's own Tabelle/Torschützen pill toggle is
// kept nested inside this file's own "tabelle" sub-tab, unchanged.
//
// LiveCarousel.jsx (formerly rendered at the top of the Spiele sub-tab) is
// deliberately NOT reused here -- LiveTab.jsx now owns showing what's live
// right now, across every league and competition at once, so this file
// only ever needs to show ONE league's own fixtures/table, never a
// cross-league summary.
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
//
// Live takes priority over the `matchdays` array's own sort order, checked
// in its own pass first -- confirmed live (La Liga, 2026-09-13, see this
// project's own history for the full writeup): a single fixture rescheduled
// to a date earlier than its own round's peers can make a LATER round sort
// ahead of the one that's actually live, hiding it behind a "current" round
// with nothing live at all. Same two-priority order EuropaTab.jsx's own
// pickActiveMatchday already uses for the same reason.
function pickCurrentMatchday(matchdays) {
  if (matchdays.length === 0) return null;

  const liveGroup = matchdays.find((group) => group.games.some((g) => g.status === 'live'));
  if (liveGroup) return liveGroup;

  const now = Date.now();
  let soonestGroup = null;
  let soonestKickoff = Infinity;
  for (const group of matchdays) {
    for (const g of group.games) {
      const kickoff = new Date(g.kickoff_at).getTime();
      if (kickoff >= now && kickoff < soonestKickoff) {
        soonestKickoff = kickoff;
        soonestGroup = group;
      }
    }
  }
  return soonestGroup ?? matchdays[matchdays.length - 1];
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
  scrollRef,
  refetchRef,
}) {
  // Own clubs fetch, scoped to this page's own league -- not the
  // LigenTab-level one below (that one only ever matches the actually
  // active league, which would leave a neighbor preview's fixtures unable
  // to resolve their own clubs' names/crests while it's mid-slide-in).
  const { clubs } = useClubs(league);
  const clubsById = useMemo(() => new Map(clubs.map((c) => [c.id, c])), [clubs]);
  const { matchdays, loading, refetch } = useFixtures(league);
  // Plain assignment during render, same idiom as usePullToRefresh.js's own
  // onRefreshRef -- LigenTab's own tab-level pull-to-refresh hook reads
  // this later, from an event handler, well after this render has
  // committed. Only set for the active instance (see call site).
  if (refetchRef) refetchRef.current = refetch;
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
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
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

export default function LigenTab({
  theme,
  t,
  language,
  league,
  onSelectLeague,
  onSwipeLeague,
  initialFixtureId,
  initialView,
  onConsumedInitialFixture,
  onFavoriteToast,
}) {
  const { clubs } = useClubs(league);
  const { favoriteIds, toggleFavorite } = useFavoriteFixtures(language);
  const [activeSubTab, setActiveSubTab] = useState('spiele');
  const [currentMatchdayOnly, setCurrentMatchdayOnly] = useState(true);
  const [liveOnly, setLiveOnly] = useState(false);
  const [tableSubTab, setTableSubTab] = useState('table');
  const [selectedClub, setSelectedClub] = useState(null);
  // Single object rather than separate fixture/view/league/club states --
  // mirrors FixturesTab.jsx's own reasoning (kept even though LiveCarousel
  // is gone: a favorited-fixture push notification can still deep-link
  // here from a different league than the one currently open).
  const [selected, setSelected] = useState(null);
  const locale = DATE_LOCALES[language];

  // Whole-tab pull-to-refresh target -- see TransfersTab.jsx's own comment
  // and usePullToRefresh.js's `gestureRef` for why. The hook itself lives
  // here (not in FixturesList) so PullToRefreshIndicator can wrap -- and
  // visually push down -- the header along with the list; refetchRef is
  // how the active FixturesList instance's own refetch reaches back up.
  // Only meaningful for the "spiele" sub-tab (StandingsTable/TopScorersTable
  // are their own self-contained fetches with no refetchRef of their own,
  // same simplification EuropaTab.jsx's own Tabelle sub-tab already makes,
  // and for the same reason -- a harmless no-op pull rather than a
  // reachable bug, not worth a bigger restructure just for this).
  const pullContainerRef = useRef(null);
  const refetchRef = useRef(() => {});
  const { scrollRef: pullScrollRef, pullDistance, pulling, refreshing: pullRefreshing } = usePullToRefresh(
    () => refetchRef.current(),
    pullContainerRef
  );

  // Confirmed live 2026-09-10 (same root cause first found in EuropaTab.jsx):
  // `selected.fixture` above is a snapshot of the row from the moment it
  // was tapped, never re-synced afterwards -- an already-open
  // FixtureDetailOverlay kept showing that same stale status/score/
  // live_minute even though useFixtures.js's own realtime subscription was
  // already updating the list underneath it the whole time. Re-deriving
  // from a second useFixtures() call for selected's own league (rather than
  // trying to read the active FixturesList's state) keeps this correct
  // regardless of which league's fixture was tapped.
  const { matchdays: selectedLeagueMatchdays } = useFixtures(selected?.league);
  const liveSelectedFixture = useMemo(() => {
    if (!selected) return null;
    const found = selectedLeagueMatchdays.flatMap((m) => m.games).find((f) => f.id === selected.fixture.id);
    return found ?? selected.fixture;
  }, [selected, selectedLeagueMatchdays]);

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

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <PullToRefreshIndicator theme={theme} containerRef={pullContainerRef} pullDistance={pullDistance} pulling={pulling} refreshing={pullRefreshing}>
        <div style={{ flexShrink: 0, padding: '14px 16px 0' }}>
          <LeagueSwitcher league={league} onSelectLeague={onSelectLeague} theme={theme} />

          {/* Sub-navigation: Spiele | Tabelle -- identical pattern to EuropaTab.jsx */}
          <div style={{ display: 'flex', borderTop: `1px solid ${theme.border}`, borderBottom: `1px solid ${theme.border}` }}>
            {[['spiele', t.nav.fixtures], ['tabelle', t.nav.standings]].map(([id, label]) => (
              <button
                key={id}
                onClick={() => setActiveSubTab(id)}
                style={{
                  flex: 1,
                  height: '38px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  font: 'inherit',
                  fontSize: '13px',
                  fontWeight: 600,
                  background: 'none',
                  border: 'none',
                  borderBottom: `2px solid ${activeSubTab === id ? theme.accent : 'transparent'}`,
                  color: activeSubTab === id ? theme.accent : theme.textMuted,
                  cursor: 'pointer',
                  transition: 'color 0.15s, border-color 0.15s',
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {activeSubTab === 'spiele' && (
            <>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 2px',
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
            </>
          )}

          {activeSubTab === 'tabelle' && (
            <div style={{ display: 'flex', gap: '10px', padding: '12px 2px' }}>
              <button
                onClick={() => setTableSubTab('table')}
                style={{
                  padding: '6px 12px',
                  border: 'none',
                  borderRadius: '6px',
                  background: tableSubTab === 'table' ? theme.accent : theme.surfaceRaised,
                  color: tableSubTab === 'table' ? theme.surface : theme.text,
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 200ms',
                }}
              >
                {t.standings?.title ?? 'Tabelle'}
              </button>
              <button
                onClick={() => setTableSubTab('scorers')}
                style={{
                  padding: '6px 12px',
                  border: 'none',
                  borderRadius: '6px',
                  background: tableSubTab === 'scorers' ? theme.accent : theme.surfaceRaised,
                  color: tableSubTab === 'scorers' ? theme.surface : theme.text,
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 200ms',
                }}
              >
                {t.topscorers?.title ?? 'Torschützen'}
              </button>
            </div>
          )}
        </div>

        {activeSubTab === 'spiele' ? (
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
                scrollRef={slug === league ? pullScrollRef : undefined}
                refetchRef={slug === league ? refetchRef : undefined}
              />
            )}
          />
        ) : (
          // Same swipe-to-switch shell as the Spiele sub-tab above -- keeps
          // the Tabelle/Torschützen sub-tab swipeable between leagues too,
          // same as StandingsTab.jsx always had. StandingsTable/
          // TopScorersTable both take the same scrollRef/refetchRef pair
          // FixturesList does above -- switching sub-tabs just re-points the
          // single shared refetchRef at whichever one is currently active,
          // same idiom the old standalone StandingsTab.jsx used for its own
          // Tabelle/Torschützen pill toggle.
          <LeagueCarousel
            league={league}
            onSwitchLeague={onSwipeLeague}
            renderPage={(slug) =>
              tableSubTab === 'table' ? (
                <StandingsTable
                  key={`${slug}-table`}
                  theme={theme}
                  t={t}
                  league={slug}
                  onSelectClub={slug === league ? setSelectedClub : undefined}
                  scrollRef={slug === league ? pullScrollRef : undefined}
                  refetchRef={slug === league ? refetchRef : undefined}
                />
              ) : (
                <TopScorersTable
                  key={`${slug}-scorers`}
                  theme={theme}
                  t={t}
                  language={language}
                  league={slug}
                  scrollRef={slug === league ? pullScrollRef : undefined}
                  refetchRef={slug === league ? refetchRef : undefined}
                />
              )
            }
          />
        )}
      </PullToRefreshIndicator>

      {liveSelectedFixture && (
        <FixtureDetailOverlay
          theme={theme}
          t={t}
          language={language}
          league={selected.league}
          fixture={liveSelectedFixture}
          homeClub={selected.homeClub}
          awayClub={selected.awayClub}
          initialView={selected.view}
          onClose={() => setSelected(null)}
        />
      )}

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
