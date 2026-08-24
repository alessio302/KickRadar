import { useEffect, useState } from 'react';
import TransfersTab from './components/TransfersTab.jsx';
import FixturesTab from './components/FixturesTab.jsx';
import LineupsTab from './components/LineupsTab.jsx';
import SettingsTab from './components/SettingsTab.jsx';
import BottomNav from './components/BottomNav.jsx';
import { usePersistedState } from './hooks/usePersistedState.js';

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

export default function App() {
  const [tab, setTab] = useState('transfers');
  const [league, setLeague] = usePersistedState('kickradar.league', 'serie-a');
  const [officialOnly, setOfficialOnly] = usePersistedState('kickradar.officialOnly', false);
  const [activeFilter, setActiveFilter] = useState(null);

  const [favoriteClub, setFavoriteClub] = usePersistedState('kickradar.favoriteClub', null);
  const [quickFilters, setQuickFilters] = usePersistedState('kickradar.quickFilters', []);
  const [darkModeSetting, setDarkModeSetting] = usePersistedState('kickradar.theme', 'system');

  const isDark = useDarkMode(darkModeSetting);

  const selectLeague = (slug) => {
    setLeague(slug);
    setActiveFilter(null);
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

  // Terracotta as the single brand accent color (per the briefing).
  // League dots and club badges keep their own colors for quick visual
  // recognition; selection/highlighting elsewhere runs through the accent
  // color via underline/border + bold, not fill.
  const theme = isDark
    ? {
        bg: '#0B0D10',
        surface: '#15181D',
        surfaceRaised: '#1C2027',
        border: '#282D35',
        text: '#F2F3F5',
        textMuted: '#8A909B',
        accent: '#E2896B',
        accentText: '#3A140A',
        danger: '#FF6B5E',
      }
    : {
        bg: '#F5F5F2',
        surface: '#FFFFFF',
        surfaceRaised: '#FFFFFF',
        border: '#E4E3DD',
        text: '#15181D',
        textMuted: '#6B7078',
        accent: '#954730',
        accentText: '#FFFFFF',
        danger: '#B23A2E',
      };

  return (
    <div style={{ background: theme.bg, minHeight: '100vh', color: theme.text, fontFamily: 'sans-serif', maxWidth: '420px', margin: '0 auto' }}>
      <div style={{ borderBottom: `1px solid ${theme.border}`, padding: '18px 16px 14px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0, textTransform: 'uppercase' }}>KickRadar</h1>
      </div>

      {tab === 'transfers' && (
        <TransfersTab
          theme={theme}
          league={league}
          onSelectLeague={selectLeague}
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
      {tab === 'spiele' && <FixturesTab theme={theme} league={league} onSelectLeague={selectLeague} />}
      {tab === 'aufstellungen' && <LineupsTab theme={theme} league={league} />}
      {tab === 'einstellungen' && (
        <SettingsTab
          theme={theme}
          darkModeSetting={darkModeSetting}
          onSetDarkModeSetting={setDarkModeSetting}
          favoriteClub={favoriteClub}
          onSetFavoriteClub={setFavoriteClub}
          quickFilters={quickFilters}
          onRemoveQuickFilter={removeQuickFilter}
        />
      )}

      <BottomNav tab={tab} onSelectTab={setTab} theme={theme} />
    </div>
  );
}
