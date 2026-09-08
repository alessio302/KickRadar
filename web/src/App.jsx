import { useEffect, useState } from 'react';
import TransfersTab from './components/TransfersTab.jsx';
import FixturesTab from './components/FixturesTab.jsx';
import StandingsTab from './components/StandingsTab.jsx';
import SettingsTab from './components/SettingsTab.jsx';
import BottomNav from './components/BottomNav.jsx';
import Toast from './components/Toast.jsx';
import { usePersistedState } from './hooks/usePersistedState.js';
import { useLanguage } from './hooks/useLanguage.js';
import { adjacentLeague } from './lib/leagues.js';

function useDarkMode(mode) {
  const [systemDark, setSystemDark] = useState(
    typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)').matches : false
  );
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const listener = (e) => setSystemDark(e.matches);
    mq.addEventListener('change', listener);
    return () => mq.removeEventListener('change', listener);
  }, []);
  if (mode === 'system') return systemDark;
  return mode === 'dark';
}

const LEAGUE_SLUGS = ['serie-a', 'bundesliga', 'premier-league', 'ligue-1', 'la-liga'];

// User-selectable accent colour (Einstellungen > Akzentfarbe) -- terracotta
// is the original brand colour and stays the default for existing users;
// violet/green are opt-in. Per explicit feedback, the accent now tints the
// *whole* surface stack (page background, cards, borders), not just the
// header and small highlights -- bg/surface/surfaceRaised/border are all
// part of the palette below, each a muted, low-saturation version of the
// accent hue (dark and desaturated in dark mode, pale in light mode) so
// text stays readable without needing its own per-accent colour. danger
// stays fixed too: it's semantic (errors/relegation), not a brand colour.
const ACCENT_PALETTES = {
  terracotta: {
    dark: {
      accent: '#E2896B',
      accentText: '#3A140A',
      bg: '#150F0C',
      surface: '#1F1613',
      surfaceRaised: '#2A1D18',
      border: '#3D2A22',
    },
    light: {
      accent: '#954730',
      accentText: '#FFFFFF',
      bg: '#FBF3EE',
      surface: '#F7E9E0',
      surfaceRaised: '#F3E0D3',
      border: '#E8D2C2',
    },
  },
  violet: {
    dark: {
      accent: '#8D7BF9',
      accentText: '#1B1330',
      bg: '#100C1F',
      surface: '#1A1430',
      surfaceRaised: '#241C40',
      border: '#362A57',
    },
    light: {
      accent: '#6A52E0',
      accentText: '#FFFFFF',
      bg: '#F1EEFC',
      surface: '#E9E3FB',
      surfaceRaised: '#DED5F8',
      border: '#CFC3F2',
    },
  },
  green: {
    dark: {
      accent: '#4CC38A',
      accentText: '#0B2A1C',
      bg: '#0A140F',
      surface: '#12241A',
      surfaceRaised: '#1A3226',
      border: '#254738',
    },
    light: {
      accent: '#1E8E5A',
      accentText: '#FFFFFF',
      bg: '#EAF7EF',
      surface: '#DFF3E6',
      surfaceRaised: '#D2EDDC',
      border: '#BFE3CE',
    },
  },
};

export default function App() {
  const [tab, setTab] = useState('transfers');
  const [league, setLeague] = usePersistedState('kickradar.league', 'serie-a');
  const [initialFixtureId, setInitialFixtureId] = useState(null);
  const [initialView, setInitialView] = useState(null);

  // Tapping a push notification about a specific league's transfer should
  // land on that league, not whatever was last open -- the persisted
  // league selection would otherwise silently override it. Confirmed live:
  // a Serie A push opened the app on a different, previously-selected
  // league, with the new transfers nowhere visible without manually
  // switching. Read once on mount (the URL is what the notification's
  // navigate()/openWindow() sets it to); doesn't fight the persisted value
  // on normal, non-notification opens where there's no query param.
  //
  // A lineup-confirmed push additionally carries a `fixture` id (see
  // syncLineups.js) -- that one should land straight on the fixture's own
  // detail overlay in the Spiele tab, not just the league's transfer list.
  // Confirmed live: tapping that notification only switched leagues, the
  // user still had to find and open the actual fixture by hand.
  //
  // A highlights push (syncHighlights.js) carries the same `fixture` id
  // plus a `view=highlights` marker -- without it the overlay opened on its
  // default lineups tab, so tapping a highlights notification still meant
  // manually switching tabs to actually watch the clip.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedLeague = params.get('league');
    const requestedFixture = params.get('fixture');
    const requestedView = params.get('view');
    if (requestedLeague && LEAGUE_SLUGS.includes(requestedLeague)) {
      setLeague(requestedLeague);
      const fixtureId = requestedFixture ? Number(requestedFixture) : NaN;
      if (Number.isInteger(fixtureId)) {
        setInitialFixtureId(fixtureId);
        setInitialView(requestedView || null);
        setTab('spiele');
      } else {
        setTab('transfers');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [officialOnly, setOfficialOnly] = usePersistedState('kickradar.officialOnly', false);
  const [activeFilter, setActiveFilter] = useState(null);
  const [toast, setToast] = useState(null);

  const [favoriteClub, setFavoriteClub] = usePersistedState('kickradar.favoriteClub', null);
  const [quickFilters, setQuickFilters] = usePersistedState('kickradar.quickFilters', []);
  const [darkModeSetting, setDarkModeSetting] = usePersistedState('kickradar.theme', 'system');
  const [accentColor, setAccentColor] = usePersistedState('kickradar.accentColor', 'terracotta');
  const { language, setLanguage, t } = useLanguage();

  const isDark = useDarkMode(darkModeSetting);

  // Keeps the document's own language attribute (screen readers, browser
  // spell-check/translate prompts) in sync with the in-app choice -- it's
  // otherwise stuck on the static lang="de" set in index.html regardless
  // of what the user picks in Settings.
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const selectLeague = (slug) => {
    setLeague(slug);
    setActiveFilter(null);
  };

  // direction 1 = swipe left (next league), -1 = swipe right (previous) --
  // see useLeagueCarousel.js. Goes through the same selectLeague as tapping a
  // pill so activeFilter gets cleared identically either way.
  const swipeLeague = (direction) => {
    selectLeague(adjacentLeague(league, direction).slug);
  };

  // Selecting a favorite/quick-filter chip whose club is in a different
  // league than the one currently open jumps the league switcher along
  // with it -- league and club selection are tied together via the club's
  // own league_slug (attached when the club was added, see addQuickFilter).
  const selectFilter = (club) => {
    if (club.league_slug && club.league_slug !== league) {
      setLeague(club.league_slug);
    }
    setActiveFilter((prev) => (prev?.id === club.id ? null : club));
  };

  const addQuickFilter = (club) => {
    const withLeague = { ...club, league_slug: league };
    setQuickFilters((prev) => (prev.some((c) => c.id === club.id) ? prev : [...prev, withLeague]));
  };

  const removeQuickFilter = (clubId) => {
    setQuickFilters((prev) => prev.filter((c) => c.id !== clubId));
    if (activeFilter?.id === clubId) setActiveFilter(null);
  };

  // League dots and club badges keep their own colors for quick visual
  // recognition; selection/highlighting elsewhere runs through the accent
  // color via underline/border + bold, not fill. bg/surface/surfaceRaised/
  // border/accent/accentText all come from the user's chosen ACCENT_PALETTES
  // entry (Einstellungen > Akzentfarbe, terracotta by default) --
  // text/textMuted/danger are the only neutrals that stay fixed regardless
  // of which accent is picked, so copy/errors read the same everywhere
  // while every surface takes on the chosen hue. danger is a clean,
  // unambiguous red rather than an orange-red -- confirmed live: the
  // previous #FF6B5E/#B23A2E leaned close enough to terracotta's own orange
  // that next to the violet/green accents it read as a leftover terracotta
  // element by mistake (and would have next to terracotta's own accent too,
  // just less obviously). A red with no orange in it stays visually
  // distinct from all three accents at once.
  const accentPalette = (ACCENT_PALETTES[accentColor] ?? ACCENT_PALETTES.terracotta)[isDark ? 'dark' : 'light'];
  const theme = isDark
    ? {
        isDark: true,
        text: '#F2F3F5',
        textMuted: '#8A909B',
        danger: '#EF4444',
        ...accentPalette,
      }
    : {
        isDark: false,
        text: '#15181D',
        textMuted: '#6B7078',
        danger: '#C0342B',
        ...accentPalette,
      };

  // Confirmed live: iOS drew the status bar area as its own opaque white
  // bar regardless of the app's actual theme, since index.html's static
  // apple-mobile-web-app-status-bar-style default (black-translucent)
  // only covers dark mode -- black-translucent makes the bar transparent
  // with light system icons/text, which would be unreadable (white on
  // white) once the resolved theme is actually light. Flips it to
  // "default" (opaque, dark icons) there instead, and keeps theme-color
  // (Android's toolbar/task-switcher color) in sync with the same bg.
  useEffect(() => {
    document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')?.setAttribute('content', isDark ? 'black-translucent' : 'default');
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.bg);
    // Confirmed live: a second, separate gap showed up at the *bottom*
    // safe area (the home-indicator zone on notch-less-home-button
    // iPhones) -- unlike the status bar, there's no OS chrome or meta tag
    // for that; it's just html/body's own background showing through
    // wherever the app's own 100dvh div doesn't perfectly cover it (a
    // known dvh-vs-actual-visual-viewport rounding gap in iOS standalone
    // PWAs). html/body had no background set at all, so any such gap
    // fell back to the browser's default white. Belt-and-suspenders fix:
    // keep them in sync with the resolved theme too, so nothing white can
    // ever peek through regardless of the exact geometry.
    document.documentElement.style.background = theme.bg;
    document.body.style.background = theme.bg;
  }, [isDark, theme.bg]);

  // App-shell layout: the page itself never scrolls (html/body/#root are
  // pinned to 100% height, see index.html), only the content area above
  // the bottom nav does (flex: 1, overflowY: auto below). Confirmed live:
  // position: fixed with hand-tuned padding to compensate wasn't reliable
  // either -- a fixed bar still disappeared on scroll. This is the
  // standard "app shell" layout instead: the bottom nav is a normal flex
  // child with fixed (shrink-proof) height, so there's nothing for scroll
  // position to affect it at all, no padding math needed to keep content
  // from sliding under it, and no viewport-resize interaction to account
  // for. env(safe-area-inset-*): the outer container's paddingTop clears
  // the notch/Dynamic Island, and the nav clears the home indicator
  // otherwise (viewport-fit=cover in index.html opts into content
  // extending under both).
  return (
    <div
      style={{
        background: theme.bg,
        // User-reported (screenshot, iPhone, installed Home Screen PWA):
        // a large solid-black gap appeared below the bottom nav, not the
        // app's own background colour -- much bigger than the "known dvh-
        // vs-actual-visual-viewport rounding gap" this file's own pre-
        // existing effect above already anticipated (the one that syncs
        // html/body's background to theme.bg specifically to hide that
        // gap's *color*, on the assumption it'd stay pixel-small). Black,
        // not the app's own bg, means whatever's showing through isn't
        // html/body at all -- most likely WKWebView's own native layer
        // beneath the page, which CSS/JS can't reach or recolor.
        // 100dvh's real-world unreliability specifically in an iOS
        // *standalone* PWA is a known WebKit quirk (no dynamic browser
        // chrome to react to there, unlike a normal Safari tab, yet the
        // reported value can still land short of the true visible
        // viewport) -- aggravated further here by this file's own status-
        // bar-style effect below flipping the status bar opaque
        // ('default')/translucent ('black-translucent') at runtime based
        // on the resolved theme, changing how much of the screen WebKit
        // actually gives the page after 100dvh was first computed. 100svh
        // (small viewport height) is the standard fix for this class of
        // bug: it's defined to never exceed the true minimum visible
        // viewport, so the app shell undershoots the screen by at most a
        // few px instead of risking a native-layer gap of unpredictable
        // size showing through underneath.
        height: '100svh',
        display: 'flex',
        flexDirection: 'column',
        color: theme.text,
        // Inter, per the redesign exports' own @font-face rules -- loaded
        // in index.html. Fallback stack matches the exports' own too
        // (-apple-system/BlinkMacSystemFont/SF Pro Display/Helvetica/
        // Arial/sans-serif), not a generic 'sans-serif' guess. Everywhere
        // else in the app inherits this from the root.
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'SF Pro Display', Helvetica, Arial, sans-serif",
        maxWidth: '420px',
        margin: '0 auto',
      }}
    >
      {/* Doesn't scroll itself: each tab manages its own internal split
          between a pinned sub-header (league switcher, quick filters,
          toggles -- confirmed live these should stay visible too, not
          just the outer title bar) and its own scrolling list. minHeight: 0
          is required here for that nested flex:1 scroll area to size
          correctly instead of overflowing its flex parent.

          paddingTop clears the notch/Dynamic Island now that there's no
          app-level title bar to carry that safe-area reservation. Applied
          here rather than on the outer height:100dvh container above --
          confirmed live on an actual iPhone (2026-09-08) that adding it to
          an element with an *explicit* height (100dvh, content-box, no
          box-sizing reset anywhere in this app) makes the real rendered
          height 100dvh + the safe-area inset, overflowing the viewport by
          exactly the notch height and clipping the bottom nav off-screen.
          This div has no explicit height at all -- flex:1 only -- so the
          flex algorithm sizes its outer box to exactly fill the remaining
          space regardless of its own padding, the same safe pattern the
          old title-bar div (a plain flex sibling, not the flex container
          itself) used. A desktop headless-browser screenshot missed the
          original bug entirely: env(safe-area-inset-*) resolves to 0 with
          no notch to simulate, so the overflow only ever showed on real
          hardware. */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', paddingTop: 'env(safe-area-inset-top)' }}>
        {tab === 'transfers' && (
          <TransfersTab
            theme={theme}
            t={t}
            language={language}
            league={league}
            onSelectLeague={selectLeague}
            onSwipeLeague={swipeLeague}
            favoriteClub={favoriteClub}
            quickFilters={quickFilters}
            activeFilter={activeFilter}
            onSelectFilter={selectFilter}
            onAddQuickFilter={addQuickFilter}
            onRemoveQuickFilter={removeQuickFilter}
            officialOnly={officialOnly}
            onToggleOfficialOnly={() => setOfficialOnly((v) => !v)}
          />
        )}
        {tab === 'spiele' && (
          <FixturesTab
            theme={theme}
            t={t}
            language={language}
            league={league}
            onSelectLeague={selectLeague}
            onSwipeLeague={swipeLeague}
            initialFixtureId={initialFixtureId}
            initialView={initialView}
            onConsumedInitialFixture={() => {
              setInitialFixtureId(null);
              setInitialView(null);
            }}
            onFavoriteToast={setToast}
          />
        )}
        {tab === 'tabelle' && (
          <StandingsTab theme={theme} t={t} language={language} league={league} onSelectLeague={selectLeague} onSwipeLeague={swipeLeague} />
        )}
        {tab === 'einstellungen' && (
          <SettingsTab
            theme={theme}
            t={t}
            language={language}
            onSetLanguage={setLanguage}
            darkModeSetting={darkModeSetting}
            onSetDarkModeSetting={setDarkModeSetting}
            accentColor={accentColor}
            onSetAccentColor={setAccentColor}
            favoriteClub={favoriteClub}
            onSetFavoriteClub={setFavoriteClub}
            quickFilters={quickFilters}
            onRemoveQuickFilter={removeQuickFilter}
          />
        )}
      </div>

      <div style={{ flexShrink: 0, position: 'relative' }}>
        <Toast theme={theme} message={toast} onDismiss={() => setToast(null)} />
        <BottomNav tab={tab} onSelectTab={setTab} theme={theme} t={t} />
      </div>
    </div>
  );
}
