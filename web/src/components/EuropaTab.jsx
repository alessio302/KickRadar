import { useState, useMemo } from 'react';
import { useEuropaFixtures } from '../hooks/useEuropaFixtures.js';
import { usePullToRefresh } from '../hooks/usePullToRefresh.js';
import LeagueCarousel from './LeagueCarousel.jsx';
import { UEFA_COMPETITIONS, adjacentCompetition } from '../lib/leagues.js';
import { DATE_LOCALES } from '../i18n/languages.js';
import PullToRefreshIndicator from './PullToRefreshIndicator.jsx';
import EuropaFixtureDetailOverlay from './EuropaFixtureDetailOverlay.jsx';

// Zone thresholds for the UEFA League Phase (all three competitions use
// an identical 36-team single-table format since 2024/25):
//   1-8  → direct to knockout round (no playoff)
//   9-24 → knockout playoff round
//  25-36 → eliminated
// Applied regardless of total team count in the data -- if the synced
// fixtures only partially cover the league phase, the colour gives the
// best available signal without waiting for a complete dataset.
const ZONE_COLOR = { direct: '#3D8BFD', playoff: '#F5A623', elim: '#E5484D' };

function europaZone(rank) {
  if (rank <= 8) return 'direct';
  if (rank <= 24) return 'playoff';
  return 'elim';
}

// Derive a standings table from the already-fetched fixture data.
// Avoids a separate DB call: useEuropaFixtures already has every finished
// fixture for this competition, which is all that's needed to compute W/D/L.
// Team identity comes from home_team_short_name/home_team_name (same fields
// EuropaFixtureRow uses -- no clubs table exists for UEFA fixtures).
function computeStandings(fixtures) {
  const teams = new Map();

  const entry = (name, badge) => {
    if (!teams.has(name)) {
      teams.set(name, { name, badge, played: 0, won: 0, draw: 0, lost: 0, gf: 0, ga: 0, points: 0 });
    }
    return teams.get(name);
  };

  for (const f of fixtures) {
    if (f.status !== 'finished' || f.home_score == null || f.away_score == null) continue;
    const home = entry(f.home_team_short_name || f.home_team_name, f.home_team_badge);
    const away = entry(f.away_team_short_name || f.away_team_name, f.away_team_badge);
    const hs = f.home_score;
    const as = f.away_score;
    home.played++; away.played++;
    home.gf += hs; home.ga += as;
    away.gf += as; away.ga += hs;
    if (hs > as) { home.won++; home.points += 3; away.lost++; }
    else if (hs < as) { away.won++; away.points += 3; home.lost++; }
    else { home.draw++; home.points++; away.draw++; away.points++; }
  }

  return [...teams.values()].sort(
    (a, b) =>
      b.points - a.points ||
      b.gf - b.ga - (a.gf - a.ga) ||
      b.gf - a.gf
  );
}

function TeamBadgeSmall({ url, name, size = 18, theme }) {
  const [failed, setFailed] = useState(false);
  if (url && !failed) {
    return (
      <img
        src={url}
        alt={name}
        width={size}
        height={size}
        style={{ objectFit: 'contain', flex: '0 0 auto' }}
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '999px',
        background: theme.surfaceRaised,
        border: `1px solid ${theme.border}`,
        flex: '0 0 auto',
      }}
    />
  );
}

// Standings table for one UEFA competition, computed client-side from
// finished fixtures. Same column layout as StandingsTab.jsx (Sp S U N ± Pkt)
// so the two tables look identical -- reusing its exact NUM_COL_WIDTH constant.
const NUM_COL_WIDTH = '26px';

function EuropaStandingsPanel({ theme, t, fixtures }) {
  const rows = useMemo(() => computeStandings(fixtures), [fixtures]);

  if (rows.length === 0) {
    return (
      <p style={{ fontSize: '13px', color: theme.textMuted, textAlign: 'center', padding: '24px 16px' }}>
        {t.europa.standingsEmpty}
      </p>
    );
  }

  const zoneItems = [
    [ZONE_COLOR.direct, t.europa.zoneDirectQualify],
    [ZONE_COLOR.playoff, t.europa.zonePlayoff],
    [ZONE_COLOR.elim, t.europa.zoneEliminated],
  ];

  return (
    <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', overscrollBehaviorY: 'none', padding: '8px 16px 14px' }}>
      {/* Column headers -- mirrors StandingsTab.jsx exactly */}
      <div style={{ display: 'flex', alignItems: 'center', paddingBottom: '6px', borderBottom: `1px solid ${theme.border}` }}>
        <div style={{ width: '3px', flexShrink: 0 }} />
        <div style={{ width: '28px', flexShrink: 0 }} />
        <div style={{ flex: 1 }} />
        {['Sp', 'S', 'U', 'N', '±', t.standings.points].map((h) => (
          <div
            key={h}
            style={{ width: NUM_COL_WIDTH, flexShrink: 0, textAlign: 'center', fontSize: '10px', fontWeight: 600, color: theme.textMuted, letterSpacing: '0.04em' }}
          >
            {h}
          </div>
        ))}
      </div>

      {rows.map((row, i) => {
        const rank = i + 1;
        const zone = europaZone(rank);
        const gd = row.gf - row.ga;
        return (
          <div
            key={row.name}
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '6px 0',
              borderBottom: `1px solid ${theme.border}`,
            }}
          >
            {/* Zone bar */}
            <div style={{ width: '3px', height: '28px', borderRadius: '2px', background: ZONE_COLOR[zone], flexShrink: 0 }} />
            {/* Position */}
            <div style={{ width: '28px', flexShrink: 0, textAlign: 'center', fontSize: '11px', fontWeight: 700, color: theme.textMuted, fontVariantNumeric: 'tabular-nums' }}>
              {rank}
            </div>
            {/* Club name + badge */}
            <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <TeamBadgeSmall url={row.badge} name={row.name} theme={theme} />
              <span style={{ fontSize: '13px', fontWeight: 500, color: theme.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {row.name}
              </span>
            </div>
            {/* Numeric cols */}
            {[row.played, row.won, row.draw, row.lost, gd > 0 ? `+${gd}` : gd, row.points].map((v, ci) => (
              <div
                key={ci}
                style={{
                  width: NUM_COL_WIDTH,
                  flexShrink: 0,
                  textAlign: 'center',
                  fontSize: '12.5px',
                  fontWeight: ci === 5 ? 700 : 500,
                  color: ci === 5 ? theme.text : theme.textMuted,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {v}
              </div>
            ))}
          </div>
        );
      })}

      {/* Zone legend */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', paddingTop: '12px' }}>
        {zoneItems.map(([color, label]) => (
          <div key={color} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: color, flexShrink: 0 }} />
            <span style={{ fontSize: '10.5px', color: theme.textMuted }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const BADGE_SIZE = 56;
const BADGE_PADDING = 6;

function formatDate(iso, locale) {
  return new Date(iso).toLocaleDateString(locale, { weekday: 'short', day: '2-digit', month: 'short' });
}
function formatTime(iso, locale) {
  return new Date(iso).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
}

function CompetitionSelector({ selected, theme, onSelect }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${UEFA_COMPETITIONS.length}, 1fr)`,
        gap: '8px',
        padding: '2px 0 14px',
      }}
    >
      {UEFA_COMPETITIONS.map((comp) => {
        const active = selected === comp.slug;
        return (
          <button
            key={comp.slug}
            onClick={() => onSelect(comp.slug)}
            title={comp.label}
            style={{
              minWidth: 0,
              display: 'flex',
              justifyContent: 'center',
              background: 'none',
              border: 'none',
              padding: 0,
              font: 'inherit',
              cursor: 'pointer',
            }}
          >
            <span
              style={{
                width: `${BADGE_SIZE}px`,
                height: `${BADGE_SIZE}px`,
                borderRadius: '10px',
                background: '#FFFFFF',
                border: `2px solid ${active ? comp.color : theme.border}`,
                boxSizing: 'border-box',
                overflow: 'hidden',
                padding: `${BADGE_PADDING}px`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <img
                src={comp.logo}
                alt={comp.label}
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
            </span>
          </button>
        );
      })}
    </div>
  );
}

function TeamBadge({ url, name, size = 20, theme }) {
  const [failed, setFailed] = useState(false);
  if (url && !failed) {
    return (
      <img
        src={url}
        alt={name}
        title={name}
        width={size}
        height={size}
        style={{ objectFit: 'contain', flex: '0 0 auto' }}
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '999px',
        background: theme.surfaceRaised,
        border: `1px solid ${theme.border}`,
        boxSizing: 'border-box',
        flex: '0 0 auto',
      }}
    />
  );
}

// One team's badge/name (left) and score (right, only while live or
// finished -- a scheduled fixture has no score yet). Mirrors FixtureRow.jsx
// (domestic)'s own TeamRow -- kept as a separate copy rather than a shared
// import since this one resolves its badge/name straight off the fixture's
// own home_team_badge/home_team_name fields (no clubs table row exists for
// European fixtures -- see this file's own useEuropaFixtures.js comment)
// instead of a clubsById lookup.
// Score turns red while live -- same reasoning as FixtureRow.jsx (domestic)'s
// own TeamRow.
function TeamRow({ badgeUrl, name, theme, score, isLive }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
        <TeamBadge url={badgeUrl} name={name} theme={theme} size={22} />
        <span
          style={{
            fontSize: '14px',
            fontWeight: 700,
            color: theme.text,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {name || '—'}
        </span>
      </div>
      {score != null && (
        // fontVariantNumeric: 'tabular-nums' -- same fix FixtureRow.jsx
        // (domestic)'s own TeamRow needed for the same user-reported
        // issue; see its own comment for why.
        <span style={{ fontSize: '14px', fontWeight: 700, color: isLive ? theme.danger : theme.text, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
          {score}
        </span>
      )}
    </div>
  );
}

// LiveScore-style layout (2026-09-11), same redesign and same reasoning as
// FixtureRow.jsx (domestic) -- see that file's own top comment for the
// full writeup. Two full-width stacked team rows instead of one shared
// "home vs away" row, no "LIVE" text label (the live minute plus its red
// color, or just the left accent bar absent a minute, are the indicator
// already).
function EuropaFixtureRow({ fixture, theme, t, locale, onSelectFixture }) {
  const isLive = fixture.status === 'live';
  const isFinished = fixture.status === 'finished';
  const showScore = isLive || isFinished;

  let statusLabel;
  if (isFinished) {
    statusLabel = t.fixtures.finished;
  } else if (isLive) {
    // live_minute lags status by however long syncLiveEvents.js's WS takes
    // to push a first tick for this match (or never arrives at all --
    // confirmed live 2026-09-10 GOAL API's WS doesn't reliably push for
    // every subscribed match, see syncEuropeanLiveScores.js's own
    // comment). Falls back to the "LIVE" word in that gap, same as
    // LiveCarousel.jsx and FixtureRow.jsx -- confirmed live 2026-09-11:
    // leaving this blank made the same fixture look inconsistent between
    // this list row and the carousel above it.
    statusLabel = fixture.live_minute ? (fixture.live_minute === 'HT' ? fixture.live_minute : `${fixture.live_minute}'`) : t.fixtures.live;
  } else if (fixture.kickoff_confirmed === false) {
    statusLabel = t.fixtures.kickoffTbd;
  } else {
    statusLabel = formatTime(fixture.kickoff_at, locale);
  }

  return (
    <div
      onClick={() => onSelectFixture?.(fixture)}
      style={{
        background: theme.surfaceRaised,
        border: `1px solid ${theme.border}`,
        borderRadius: '12px',
        display: 'flex',
        alignItems: 'stretch',
        gap: '10px',
        padding: '12px 14px',
        cursor: 'pointer',
      }}
    >
      <span aria-hidden="true" style={{ width: '3px', borderRadius: '2px', background: isLive ? theme.danger : 'transparent', flexShrink: 0 }} />
      <div style={{ width: '66px', flex: '0 0 auto', display: 'flex', alignItems: 'center' }}>
        <span style={{ fontSize: '13px', fontWeight: 700, color: isLive ? theme.danger : isFinished ? theme.textMuted : theme.accent, whiteSpace: 'nowrap' }}>
          {statusLabel}
        </span>
      </div>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '10px', justifyContent: 'center' }}>
        <TeamRow
          badgeUrl={fixture.home_team_badge}
          name={fixture.home_team_short_name || fixture.home_team_name}
          theme={theme}
          score={showScore ? fixture.home_score : null}
          isLive={isLive}
        />
        <TeamRow
          badgeUrl={fixture.away_team_badge}
          name={fixture.away_team_short_name || fixture.away_team_name}
          theme={theme}
          score={showScore ? fixture.away_score : null}
          isLive={isLive}
        />
      </div>
    </div>
  );
}

// Picks the matchday to highlight: live > next upcoming > latest completed.
function pickActiveMatchday(fixtures) {
  const live = fixtures.find((f) => f.status === 'live' && f.matchday != null);
  if (live) return live.matchday;
  const now = Date.now();
  const upcoming = fixtures
    .filter((f) => f.status !== 'finished' && f.matchday != null && new Date(f.kickoff_at) >= now)
    .map((f) => f.matchday);
  if (upcoming.length) return Math.min(...upcoming);
  const all = fixtures.map((f) => f.matchday).filter((m) => m != null);
  return all.length ? Math.max(...all) : null;
}

// The fixture list for one competition -- rendered twice by LeagueCarousel
// while a swipe is in progress (the active competition and whichever
// neighbor is being dragged into view), same split as FixturesTab.jsx's
// own FixturesList. onSelectFixture is only passed for the active
// instance (see LeagueCarousel.jsx's own comment on why the preview one
// stays non-interactive) -- EuropaFixtureRow's onClick already guards
// against it being undefined.
function EuropaFixturesList({ theme, t, locale, fixtures, loading, currentMatchdayOnly, liveOnly, refetch, refreshing, onSelectFixture }) {
  const { scrollRef, pullDistance, pulling } = usePullToRefresh(refetch);
  const activeMatchday = useMemo(() => pickActiveMatchday(fixtures), [fixtures]);

  const grouped = useMemo(() => {
    let list = fixtures;
    if (currentMatchdayOnly && activeMatchday != null) {
      list = list.filter((f) => f.matchday === activeMatchday);
    }
    if (liveOnly) {
      list = list.filter((f) => f.status === 'live');
    }
    const byDate = {};
    for (const f of list) {
      const key = formatDate(f.kickoff_at, locale);
      (byDate[key] = byDate[key] || []).push(f);
    }
    return byDate;
  }, [fixtures, currentMatchdayOnly, liveOnly, activeMatchday, locale]);

  const dateEntries = Object.entries(grouped);

  return (
    <div
      ref={scrollRef}
      style={{
        height: '100%',
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
        overscrollBehaviorY: 'none',
        padding: '0 16px 14px',
      }}
    >
      <PullToRefreshIndicator theme={theme} t={t} pullDistance={pullDistance} pulling={pulling} refreshing={refreshing} />

      {loading && (
        <p style={{ fontSize: '13px', color: theme.textMuted, textAlign: 'center', padding: '24px 0' }}>
          {t.common.loading}
        </p>
      )}

      {!loading && dateEntries.length === 0 && (
        <p style={{ fontSize: '13px', color: theme.textMuted, paddingLeft: '4px' }}>
          {t.fixtures.empty}
        </p>
      )}

      {!loading &&
        dateEntries.map(([date, dayFixtures]) => (
          <div key={date} style={{ marginBottom: '12px' }}>
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
              {dayFixtures.map((f) => (
                <EuropaFixtureRow key={f.id} fixture={f} theme={theme} t={t} locale={locale} onSelectFixture={onSelectFixture} />
              ))}
            </div>
          </div>
        ))}
    </div>
  );
}

export default function EuropaTab({ theme, t, language }) {
  const { data, loading, refreshing, refetch } = useEuropaFixtures();
  const locale = DATE_LOCALES[language];
  const [selectedComp, setSelectedComp] = useState(UEFA_COMPETITIONS[0].slug);
  const [activeSubTab, setActiveSubTab] = useState('spiele');
  const [currentMatchdayOnly, setCurrentMatchdayOnly] = useState(true);
  const [liveOnly, setLiveOnly] = useState(false);
  // Holds whatever `data` had for the clicked row at click time -- kept
  // only as a fallback for the split second before the live lookup below
  // resolves, and for a fixture that fell outside the loaded window.
  const [selectedFixture, setSelectedFixture] = useState(null);

  // Confirmed live 2026-09-10: passing selectedFixture straight into
  // EuropaFixtureDetailOverlay meant an overlay left open across a status
  // change (scheduled -> live) or a new match_events row showed neither --
  // it's a frozen copy of the row from the moment it was clicked, and
  // useEuropaFixtures.js's own realtime updates land in `data`, not in this
  // separately-held snapshot. Re-reading the live row from `data` by id on
  // every render (rather than searching just selectedComp's list -- the
  // user can swipe to a different competition tab while the overlay stays
  // open) keeps the open overlay's fixture prop current for free, same as
  // FixturesTab.jsx's own equivalent fix.
  const liveSelectedFixture = useMemo(() => {
    if (!selectedFixture) return null;
    for (const list of Object.values(data)) {
      const found = list.find((f) => f.id === selectedFixture.id);
      if (found) return found;
    }
    return selectedFixture;
  }, [data, selectedFixture]);

  // direction 1 = swipe left (next competition), -1 = swipe right --
  // same contract as App.jsx's own swipeLeague, just over UEFA_COMPETITIONS
  // via adjacentCompetition instead of LEAGUES/adjacentLeague.
  const swipeComp = (direction) => setSelectedComp(adjacentCompetition(selectedComp, direction).slug);

  return (
    // Same app-shell split as FixturesTab.jsx: a pinned, non-scrolling
    // header (selector + filters) as a flexShrink:0 sibling, then
    // LeagueCarousel's own swipe-pager for the actual fixture list. The
    // fixture-detail overlay stays a sibling AFTER LeagueCarousel, not
    // nested inside its scrolling box -- see this file's own git history
    // for why a position:fixed overlay nested inside a
    // WebkitOverflowScrolling:'touch' ancestor renders clipped on iOS.
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flexShrink: 0, padding: '12px 16px 0' }}>
        <CompetitionSelector selected={selectedComp} theme={theme} onSelect={setSelectedComp} />

        {/* Sub-navigation: Spiele | Tabelle (change A) */}
        <div style={{ display: 'flex', borderTop: `1px solid ${theme.border}`, borderBottom: `1px solid ${theme.border}` }}>
          {[['spiele', t.europa.tabSpiele], ['tabelle', t.europa.tabTabelle]].map(([id, label]) => (
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

        {/* Filter bar -- only shown in Spiele sub-tab, matches FixturesTab layout exactly */}
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
      </div>

      {activeSubTab === 'spiele' ? (
        <LeagueCarousel
          league={selectedComp}
          onSwitchLeague={swipeComp}
          adjacent={adjacentCompetition}
          renderPage={(slug) => (
            <EuropaFixturesList
              key={slug}
              theme={theme}
              t={t}
              locale={locale}
              fixtures={data[slug] ?? []}
              loading={loading}
              currentMatchdayOnly={currentMatchdayOnly}
              liveOnly={liveOnly}
              refetch={refetch}
              refreshing={refreshing}
              onSelectFixture={slug === selectedComp ? setSelectedFixture : undefined}
            />
          )}
        />
      ) : (
        <EuropaStandingsPanel
          theme={theme}
          t={t}
          fixtures={data[selectedComp] ?? []}
        />
      )}

      {liveSelectedFixture && (
        <EuropaFixtureDetailOverlay
          theme={theme}
          t={t}
          language={language}
          fixture={liveSelectedFixture}
          onClose={() => setSelectedFixture(null)}
        />
      )}
    </div>
  );
}
