import { useEffect, useMemo, useRef, useState } from 'react';
import { RotateCcwClock, Video, BarChart2 } from 'lucide-react';
import ClubJersey from './ClubJersey.jsx';
import MatchScore from './MatchScore.jsx';
import PlayerProfileOverlay from './PlayerProfileOverlay.jsx';
import {
  LineupList,
  Whistle,
  PitchIcon,
  HighlightsTab,
  MatchInfoTimeline,
  MatchGoalscorers,
  SECTION_LABEL_STYLE,
  HINT_STYLE,
  FormRow,
  StandingRow,
} from './FixtureDetailOverlay.jsx';
import { useMatchEvents } from '../hooks/useMatchEvents.js';
import { useEuropaLineups } from '../hooks/useEuropaLineups.js';
import { useEuropaTeamForm } from '../hooks/useEuropaTeamForm.js';
import { useEuropaLeagueStandings } from '../hooks/useEuropaLeagueStandings.js';
import { useEuropaHeadToHead } from '../hooks/useEuropaHeadToHead.js';
import { fetchPlayerProfile } from '../lib/playerProfile.js';
import { fetchFixtureStatistics } from '../lib/fixtureStatistics.js';
import { DATE_LOCALES } from '../i18n/languages.js';

// Which of GOAL API's own `type` strings (see get-fixture-statistics) this
// tab shows, in display order, and which t.stats.* key/theme colour each
// maps to. GOAL API's raw list carries more than this (Throw In, Free
// Kick, Goal Kick, Penalty, Substitution counts, Attacks, Dangerous
// Attacks) plus a second, differently-valued "On Target"/"Off Target" pair
// alongside "Shots On Goal"/"Shots Off Goal" -- confirmed live the two
// pairs don't even agree with each other (13/2 vs 11/2 for the same
// match), evidently two merged upstream feeds. Standardized on the
// On Goal/Off Goal/Blocked triplet here since it's the only internally
// consistent three-way shot breakdown GOAL API returns; the rest are
// either not meaningful to a casual reader (throw-ins, goal kicks) or
// redundant with what's already shown elsewhere (Substitution count vs.
// the actual sub events in the Spielinfo tab).
const STAT_ROWS = [
  ['Ball Possession', 'possession', true],
  ['Shots On Goal', 'shotsOnGoal', false],
  ['Shots Off Goal', 'shotsOffGoal', false],
  ['Shots Blocked', 'shotsBlocked', false],
  ['Corners', 'corners', false],
  ['Offsides', 'offsides', false],
  ['Fouls', 'fouls', false],
  ['Yellow Cards', 'yellowCards', false],
  ['Red Cards', 'redCards', false],
];

// "%" -> 62, "" -> null (no data for this row, e.g. "Shots Total"/"Shots
// Inside Box" in GOAL API's own response), "9" -> 9.
function parseStatValue(raw) {
  if (raw == null || raw === '') return null;
  const n = Number.parseInt(String(raw).replace('%', ''), 10);
  return Number.isFinite(n) ? n : null;
}

// One bar per stat: the side with the bigger raw number is highlighted in
// the user's chosen accent colour (per explicit direction -- always the
// larger count, not "better for that stat", so e.g. more fouls is still
// the highlighted side), the other in a neutral tone. A tie highlights
// neither, since there's no leader to point at.
function StatRow({ theme, label, home, away }) {
  if (home == null && away == null) return null;
  const h = home ?? 0;
  const a = away ?? 0;
  const total = h + a;
  const homeShare = total > 0 ? h / total : 0.5;
  const homeLeads = h > a;
  const awayLeads = a > h;

  return (
    <div style={{ marginBottom: '18px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '6px', fontSize: '13px' }}>
        <span style={{ fontWeight: 700, color: homeLeads ? theme.accent : theme.text, minWidth: '32px' }}>{home ?? '–'}</span>
        <span style={{ color: theme.textMuted, textAlign: 'center', flex: 1 }}>{label}</span>
        <span style={{ fontWeight: 700, color: awayLeads ? theme.accent : theme.text, minWidth: '32px', textAlign: 'right' }}>{away ?? '–'}</span>
      </div>
      <div style={{ display: 'flex', height: '6px', borderRadius: '999px', overflow: 'hidden', background: theme.border }}>
        <div style={{ width: `${homeShare * 100}%`, background: homeLeads ? theme.accent : theme.border }} />
        <div style={{ flex: 1, background: awayLeads ? theme.accent : theme.border }} />
      </div>
    </div>
  );
}

// Team stats only for now (per explicit direction) -- GOAL API's own
// response also carries a `players` breakdown (per-player shot/pass
// counts) and firstHalf/secondHalf splits, both left unused here until
// there's a reason to add them; fullTime is what's fetched and shown.
// Key computeStandings() itself groups teams by (home/away_team_short_name
// || ...team_name) -- matching that same fallback here is what makes a
// fixture's own home/away identity resolve to the right row in the table
// computeStandings returned, rather than two silently-different keys for
// the same team.
function standingsKey(shortName, name) {
  return shortName || name;
}

function EuropaFormSection({ t, theme, homeClub, awayClub }) {
  const { form: homeForm, loading: homeLoading } = useEuropaTeamForm(homeClub?.name);
  const { form: awayForm, loading: awayLoading } = useEuropaTeamForm(awayClub?.name);
  const loading = homeLoading || awayLoading;
  const noForm = !loading && homeForm.length === 0 && awayForm.length === 0;

  return (
    <>
      <p style={SECTION_LABEL_STYLE(theme)}>{t.stats.form}</p>
      {loading ? (
        <p style={HINT_STYLE(theme)}>{t.common.loading}</p>
      ) : noForm ? (
        <p style={HINT_STYLE(theme)}>{t.stats.noForm}</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '22px' }}>
          <FormRow theme={theme} club={homeClub} form={homeForm} />
          <FormRow theme={theme} club={awayClub} form={awayForm} />
        </div>
      )}
    </>
  );
}

// Name-keyed counterpart to FixtureDetailOverlay.jsx's own (unexported,
// club_id-keyed) HeadToHeadRow -- same visual shape, just resolving
// host/guest by team name instead of club_id since Europa meetings carry
// no club_id at all.
function EuropaHeadToHeadRow({ theme, meeting, homeClub, awayClub, locale }) {
  const meetingIsHomeClubHost = meeting.home_team_name === homeClub?.name;
  const hostClub = meetingIsHomeClubHost ? homeClub : awayClub;
  const guestClub = meetingIsHomeClubHost ? awayClub : homeClub;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', fontSize: '12.5px', padding: '6px 0' }}>
      <span style={{ color: theme.textMuted, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
        {new Date(meeting.date).toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: '2-digit' })}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
        <span style={{ width: '96px', textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {hostClub?.short_name || hostClub?.name}
        </span>
        <span style={{ width: '40px', flexShrink: 0, textAlign: 'center', fontWeight: 700 }}>
          {meeting.home_score} : {meeting.away_score}
        </span>
        <span style={{ width: '96px', textAlign: 'left', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {guestClub?.short_name || guestClub?.name}
        </span>
      </div>
    </div>
  );
}

function EuropaHeadToHeadSection({ t, theme, locale, homeClub, awayClub }) {
  const { meetings, loading } = useEuropaHeadToHead(homeClub?.name, awayClub?.name);

  return (
    <>
      <p style={SECTION_LABEL_STYLE(theme)}>{t.stats.headToHead}</p>
      {loading ? (
        <p style={HINT_STYLE(theme)}>{t.common.loading}</p>
      ) : meetings.length === 0 ? (
        <p style={HINT_STYLE(theme)}>{t.stats.noHeadToHead}</p>
      ) : (
        <div style={{ marginBottom: '22px' }}>
          {meetings.map((m) => (
            <EuropaHeadToHeadRow key={m.id} theme={theme} meeting={m} homeClub={homeClub} awayClub={awayClub} locale={locale} />
          ))}
        </div>
      )}
    </>
  );
}

function EuropaStandingSection({ t, theme, fixture, homeClub, awayClub }) {
  const { rows, loading } = useEuropaLeagueStandings(fixture.league_id);
  const homeKey = standingsKey(fixture.home_team_short_name, fixture.home_team_name);
  const awayKey = standingsKey(fixture.away_team_short_name, fixture.away_team_name);
  const homeRank = rows.findIndex((r) => r.name === homeKey) + 1;
  const awayRank = rows.findIndex((r) => r.name === awayKey) + 1;

  return (
    <>
      <p style={SECTION_LABEL_STYLE(theme)}>{t.stats.standing}</p>
      {loading ? (
        <p style={HINT_STYLE(theme)}>{t.common.loading}</p>
      ) : rows.length === 0 ? (
        <p style={HINT_STYLE(theme)}>{t.standings.empty}</p>
      ) : (
        <div>
          <StandingRow theme={theme} t={t} club={homeClub} entry={homeRank > 0 ? { position: homeRank } : null} />
          <StandingRow theme={theme} t={t} club={awayClub} entry={awayRank > 0 ? { position: awayRank } : null} />
        </div>
      )}
    </>
  );
}

function MatchStatisticsTab({ theme, t, locale, fixture, homeClub, awayClub }) {
  const [stats, setStats] = useState(null); // undefined-until-loaded via null, then { available, fullTime } | { available: false }
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchFixtureStatistics(fixture.goal_api_id).then((result) => {
      if (cancelled) return;
      setStats(result);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [fixture.goal_api_id]);

  // Deduped by type, first occurrence wins -- GOAL API's own list repeats
  // a handful of types (confirmed live: "Corners" and "Ball Possession"
  // both appear twice, the second "Ball Possession" pair even disagreeing
  // with the first).
  const byType = new Map();
  if (stats?.available) {
    for (const row of stats.fullTime) {
      if (!byType.has(row.type)) byType.set(row.type, row);
    }
  }

  // Form/Direkter Vergleich/Tabellenplatz, harmonized with Ligen's own
  // Statistiken tab (MatchStatsTab in FixtureDetailOverlay.jsx). An earlier
  // diagnostic wrongly concluded GOAL API had no head-to-head endpoint on
  // its FREE tier; a follow-up diagnostic (since removed) found the actual
  // documented shape (/h2h/:team1Id/:team2Id/direct) works fine -- see
  // syncEuropeanHeadToHead.js.
  return (
    <div style={{ padding: '4px 16px 20px' }}>
      {loading ? (
        <p style={{ fontSize: '13px', color: theme.textMuted, textAlign: 'center', padding: '32px 16px' }}>{t.common.loading}</p>
      ) : !stats?.available ? (
        <p style={{ fontSize: '13px', color: theme.textMuted, textAlign: 'center', padding: '16px' }}>{t.stats.noStatistics}</p>
      ) : (
        <div style={{ marginBottom: '22px' }}>
          {STAT_ROWS.map(([apiType, labelKey]) => {
            const row = byType.get(apiType);
            if (!row) return null;
            return (
              <StatRow key={apiType} theme={theme} label={t.stats[labelKey]} home={parseStatValue(row.home)} away={parseStatValue(row.away)} />
            );
          })}
        </div>
      )}

      <EuropaFormSection t={t} theme={theme} homeClub={homeClub} awayClub={awayClub} />
      <EuropaHeadToHeadSection t={t} theme={theme} locale={locale} homeClub={homeClub} awayClub={awayClub} />
      <EuropaStandingSection t={t} theme={theme} fixture={fixture} homeClub={homeClub} awayClub={awayClub} />
    </div>
  );
}

const DISMISS_THRESHOLD_PX = 100;

function formatKickoff(iso, locale, kickoffConfirmed, tbdLabel) {
  if (kickoffConfirmed === false) {
    return `${new Date(iso).toLocaleDateString(locale, { weekday: 'short', day: '2-digit', month: 'short' })} · ${tbdLabel}`;
  }
  return new Date(iso).toLocaleString(locale, { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// Counterpart to FixtureDetailOverlay.jsx's own MatchInfoFooter, sourced
// from the fixture row directly instead of homeClub.venue -- there's no
// clubs table row here to fall back to (see syncEuropeanLineups.js's own
// top comment), but syncEuropeanFixtures.js writes both fields straight
// from the fixture itself: referee from football-data.org's UCL match
// object (referees[]) or GOAL API's EL/UECL matchReferee, venue from
// GOAL API's matchStadium only (confirmed live football-data.org's UCL
// match object carries no venue at all, so it stays null for UCL rows).
function MatchInfoFooter({ theme, fixture }) {
  if (!fixture.referee && !fixture.venue) return null;

  return (
    <div style={{ margin: '0 16px 16px', paddingTop: '14px', borderTop: `1px solid ${theme.border}`, display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {fixture.referee && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: theme.textMuted }}>
          <Whistle size={15} style={{ flexShrink: 0 }} />
          <span>{fixture.referee}</span>
        </div>
      )}
      {fixture.venue && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: theme.textMuted }}>
          <PitchIcon size={15} style={{ flexShrink: 0 }} />
          <span>{fixture.venue}</span>
        </div>
      )}
    </div>
  );
}

// Slim counterpart to FixtureDetailOverlay.jsx for UCL/UEL/UECL fixtures --
// Aufstellungen + Spielinfo + Statistiken + Highlights, but no Tabelle:
// that keys off one of our 5 tracked domestic league standings, which
// doesn't exist for European fixtures (see
// src/lineups/syncEuropeanLineups.js's own top comment). Domestic's own
// "Statistiken" tab (form/head-to-head/table position, all clubs.id-keyed)
// can't run here either for the same reason -- this tab is a different
// thing entirely: real live match statistics (shots/possession/corners/
// fouls/cards) from GOAL API's own /fixtures/{id}/statistics, which
// football-data.org (UCL's other data source) doesn't have at all
// (confirmed live, see get-fixture-statistics's own top comment). Reuses
// FixtureDetailOverlay's LineupList, MatchInfoTimeline and HighlightsTab
// as-is -- LineupList only needs a `row` shaped { confirmed, formation,
// players }, MatchInfoTimeline's own side-detection already falls back to
// matching an event's team_name against homeClub.name/awayClub.name when
// club_id doesn't resolve (see its own comment), and HighlightsTab only
// ever reads fixture.highlight_video_url -- plus the same drag-to-dismiss
// bottom-sheet shell. match_events rows come from
// src/lineups/backfillEuropeanMatchEvents.js (a one-off, workflow_dispatch-
// only backfill, not a recurring job -- see its own top comment for why:
// it draws from the same GOAL API REST budget already strained for the
// domestic leagues). highlight_video_url is populated by
// src/lineups/syncEuropeanHighlights.js, the European counterpart of
// syncHighlights.js (see that file's own top comment for the YouTube
// source and matching rationale).
export default function EuropaFixtureDetailOverlay({ theme, t, language, fixture, onClose }) {
  // 'lineups' | 'info' | 'stats' | 'highlights' -- mirrors
  // FixtureDetailOverlay.jsx's own `view` state, just without the 'table'
  // tab this slim overlay has no data source for (see the top comment).
  const [view, setView] = useState('lineups');
  const [side, setSide] = useState('home');
  const { byTeamName } = useEuropaLineups(fixture.id);
  // Single shared subscription for both MatchGoalscorers (always shown, in
  // the header) and MatchInfoTimeline (Spielinfo tab only) -- see
  // FixtureDetailOverlay.jsx's own MatchGoalscorers comment for why this
  // must not be two independent useMatchEvents() calls each opening their
  // own Realtime channel on the same topic.
  const matchEvents = useMatchEvents(fixture.id);
  const locale = DATE_LOCALES[language];

  const activeRow = side === 'home' ? byTeamName.get(fixture.home_team_name) : byTeamName.get(fixture.away_team_name);

  // ClubJersey only ever reads club.crest_url/club.name -- wrapping the
  // fixture's own team_name/team_badge fields in that shape reuses it
  // as-is instead of a parallel badge component.
  const homeClub = useMemo(
    () => ({ name: fixture.home_team_name, short_name: fixture.home_team_short_name, crest_url: fixture.home_team_badge }),
    [fixture]
  );
  const awayClub = useMemo(
    () => ({ name: fixture.away_team_name, short_name: fixture.away_team_short_name, crest_url: fixture.away_team_badge }),
    [fixture]
  );

  // Same profile-overlay wiring as FixtureDetailOverlay.jsx's own
  // handleSelectPlayer -- fetchPlayerProfile(p.id) falls through to the
  // get-player-profile Edge Function for anyone not yet in our `players`
  // table (a European player included, per that function's own comment),
  // so this needs no European-specific player lookup at all.
  const [profilePlayer, setProfilePlayer] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const handleSelectPlayer = async (p) => {
    if (!p) return;
    setProfilePlayer({ name: p.name, photo_url: p.photo, position: p.position });
    setProfileLoading(true);
    const live = await fetchPlayerProfile(p.id);
    if (live) setProfilePlayer(live);
    setProfileLoading(false);
  };

  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragStartY = useRef(null);

  const handlePointerDown = (e) => {
    dragStartY.current = e.clientY;
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const handlePointerMove = (e) => {
    if (dragStartY.current == null) return;
    const delta = e.clientY - dragStartY.current;
    if (delta > 0) setDragY(delta);
  };
  const handlePointerUp = () => {
    if (dragY > DISMISS_THRESHOLD_PX) {
      onClose();
    } else {
      setDragY(0);
    }
    setDragging(false);
    dragStartY.current = null;
  };

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: `rgba(0,0,0,${0.5 * Math.max(0, 1 - dragY / 400)})`,
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
          zIndex: 50,
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            background: theme.bg,
            width: '100%',
            maxWidth: '420px',
            height: '82vh',
            borderTopLeftRadius: '16px',
            borderTopRightRadius: '16px',
            display: 'flex',
            flexDirection: 'column',
            paddingBottom: 'env(safe-area-inset-bottom)',
            transform: `translateY(${dragY}px)`,
            transition: dragging ? 'none' : 'transform 0.2s ease',
          }}
        >
          <div style={{ flexShrink: 0, padding: '10px 16px 10px', borderBottom: `1px solid ${theme.border}` }}>
            <div
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              style={{ cursor: 'grab', touchAction: 'none' }}
            >
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '10px' }}>
                <div style={{ width: '36px', height: '4px', borderRadius: '999px', background: theme.border }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', marginBottom: '4px' }}>
                <ClubJersey club={homeClub} size={22} theme={theme} />
                <MatchScore fixture={fixture} t={t} theme={theme} style={{ fontSize: '14px', fontWeight: 700 }} />
                <ClubJersey club={awayClub} size={22} theme={theme} />
              </div>
              {fixture.status !== 'live' && fixture.status !== 'finished' && (
                <p style={{ fontSize: '12px', color: theme.textMuted, textAlign: 'center', margin: '0 0 12px' }}>
                  {formatKickoff(fixture.kickoff_at, locale, fixture.kickoff_confirmed, t.fixtures.kickoffTbd)}
                </p>
              )}
            </div>

            <MatchGoalscorers theme={theme} t={t} fixture={fixture} homeClub={homeClub} awayClub={awayClub} events={matchEvents.events} loading={matchEvents.loading} />

            {/* Same tab-switcher styling as FixtureDetailOverlay.jsx's own,
                including icons-only-with-aria-label -- see that file's own
                comment on why (labels overflowed the sheet's 420px width
                for the domestic overlay's 5-tab case; this one only ever
                shows up to 3, but matching keeps both overlays visually
                consistent rather than one being text and the other icons).
                Spielinfo shows once there's something to time-line (live or
                finished, same gate MatchInfoTimeline itself applies) --
                syncLiveEvents.js's WebSocket already writes match_events
                for a live European fixture the same way it does for the 5
                domestic leagues, so this isn't only fed by the one-off
                finished-match backfill. Highlights stays finished-only: an
                upcoming or live European fixture can never have a
                highlight clip yet. */}
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', marginBottom: '10px', borderBottom: `1px solid ${theme.border}` }}>
              {[
                ['lineups', t.matchInfo.tabLineups, <PitchIcon key="icon" />],
                ...(fixture.status === 'finished' || fixture.status === 'live' ? [['info', t.matchInfo.tabInfo, <RotateCcwClock key="icon" size={18} />]] : []),
                // Same gate as Spielinfo -- GOAL API has nothing to show
                // for a fixture that hasn't kicked off yet either.
                ...(fixture.status === 'finished' || fixture.status === 'live' ? [['stats', t.matchInfo.tabStats, <BarChart2 key="icon" size={18} />]] : []),
                ...(fixture.status === 'finished' ? [['highlights', t.matchInfo.tabHighlights, <Video key="icon" size={18} />]] : []),
              ].map(([key, label, icon]) => (
                <button
                  key={key}
                  onClick={() => setView(key)}
                  aria-label={label}
                  title={label}
                  style={{
                    flex: 1,
                    display: 'flex',
                    justifyContent: 'center',
                    padding: '6px 2px 10px',
                    border: 'none',
                    borderBottom: view === key ? `2px solid ${theme.accent}` : '2px solid transparent',
                    background: 'transparent',
                    color: view === key ? theme.text : theme.textMuted,
                    cursor: 'pointer',
                  }}
                >
                  {icon}
                </button>
              ))}
            </div>

            {/* Which side's lineup is shown -- meaningless outside the
                Aufstellungen tab, so hidden for Highlights same as
                FixtureDetailOverlay.jsx's own side toggle. */}
            {view === 'lineups' && (
              <div style={{ display: 'flex', background: theme.surface, borderRadius: '10px', padding: '3px', border: `1px solid ${theme.border}` }}>
                {[['home', homeClub], ['away', awayClub]].map(([key, club]) => (
                  <button
                    key={key}
                    onClick={() => setSide(key)}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      padding: '8px',
                      fontSize: '13px',
                      fontWeight: side === key ? 700 : 600,
                      borderRadius: '7px',
                      border: 'none',
                      cursor: 'pointer',
                      background: side === key ? theme.surfaceRaised : 'transparent',
                      color: side === key ? theme.text : theme.textMuted,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {club?.name || '–'}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
            {view === 'lineups' && (
              <>
                <LineupList theme={theme} t={t} row={activeRow} onSelectPlayer={handleSelectPlayer} />
                <MatchInfoFooter theme={theme} fixture={fixture} />
              </>
            )}
            {view === 'info' && <MatchInfoTimeline theme={theme} t={t} fixture={fixture} homeClub={homeClub} awayClub={awayClub} events={matchEvents.events} loading={matchEvents.loading} />}
            {view === 'stats' && <MatchStatisticsTab theme={theme} t={t} locale={locale} fixture={fixture} homeClub={homeClub} awayClub={awayClub} />}
            {view === 'highlights' && <HighlightsTab theme={theme} t={t} fixture={fixture} />}
          </div>
        </div>
      </div>
      {profilePlayer && (
        <PlayerProfileOverlay
          theme={theme}
          t={t}
          player={profilePlayer}
          locale={locale}
          loading={profileLoading}
          onClose={() => setProfilePlayer(null)}
        />
      )}
    </>
  );
}
